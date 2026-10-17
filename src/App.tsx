import React, { useState, useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar, NavTab } from "./components/Sidebar";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { LoginModal } from "./components/LoginModal";
import { HomeView } from "./views/HomeView";
import { SearchView } from "./views/SearchView";
import { LibraryView } from "./views/LibraryView";
import { SettingsView } from "./views/SettingsView";
import { TrackTable } from "./components/TrackTable";
import { Track, Playlist, UserSession, PlayerSettings } from "./types/music";
import { audioEngine } from "./services/audioEngine";
import { getAuthSession, fetchAudioStream, isTauri } from "./services/tauriBridge";
import { MOCK_TRACKS, MOCK_PLAYLISTS } from "./services/mockData";
import { ArrowLeft, Play, ListMusic } from "lucide-react";
import "./App.css";

export const App: React.FC = () => {
  // Navigation & UI State
  const [currentTab, setCurrentTab] = useState<NavTab>("home");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  // User & Settings
  const [session, setSession] = useState<UserSession>({ isAuthenticated: false });
  const [settings, setSettings] = useState<PlayerSettings>({
    quality: "normal",
    volume: 0.8,
    normalizeVolume: true,
    minimizeToTray: true,
    enableHardwareMediaKeys: true,
  });

  // Library & Music Data
  const [likedTracks, setLikedTracks] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ytm_liked_tracks");
    return saved ? JSON.parse(saved) : MOCK_TRACKS.filter((t) => t.isLiked);
  });
  const [history, setHistory] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ytm_history");
    return saved ? JSON.parse(saved) : [MOCK_TRACKS[0], MOCK_TRACKS[1]];
  });
  const [playlists] = useState<Playlist[]>(MOCK_PLAYLISTS);

  // Audio Engine State
  const [audioState, setAudioState] = useState(audioEngine.getState());

  // Initialize Auth & Audio engine listener
  useEffect(() => {
    // 1. Fetch persistent session from Rust backend
    getAuthSession().then(setSession);

    // 2. Subscribe to audio engine
    const unsubscribe = audioEngine.subscribe((state) => {
      setAudioState(state);
    });

    // 3. Listen to Rust backend SMTC global events if in Tauri
    if (isTauri()) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<string>("smtc-action", (event) => {
          switch (event.payload) {
            case "play":
              audioEngine.resume();
              break;
            case "pause":
              audioEngine.pause();
              break;
            case "toggle":
              audioEngine.togglePlayPause();
              break;
            case "next":
              audioEngine.playNext();
              break;
            case "previous":
              audioEngine.playPrevious();
              break;
          }
        });
      }).catch(console.error);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  // Save liked tracks
  useEffect(() => {
    localStorage.setItem("ytm_liked_tracks", JSON.stringify(likedTracks));
  }, [likedTracks]);

  // Save history
  useEffect(() => {
    localStorage.setItem("ytm_history", JSON.stringify(history));
  }, [history]);

  // Track playback handler
  const handlePlayTrack = async (track: Track, queueContext?: Track[]) => {
    // Update history
    setHistory((prev) => [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 50));

    // Resolve audio stream via Rust backend or mock stream
    const streamUrl = await fetchAudioStream(track);
    audioEngine.playTrack(track, queueContext, streamUrl);
  };

  // Like / Unlike toggle
  const handleToggleLike = (trackId: string) => {
    setLikedTracks((prev) => {
      const exists = prev.find((t) => t.id === trackId);
      if (exists) {
        return prev.filter((t) => t.id !== trackId);
      } else {
        const found =
          MOCK_TRACKS.find((t) => t.id === trackId) ||
          audioState.currentTrack || {
            id: trackId,
            title: "Unknown Track",
            artist: "YouTube Music",
            duration: 180,
            thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
          };
        return [{ ...found, isLiked: true }, ...prev];
      }
    });
  };

  const currentQueue = audioEngine.getQueue();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 font-sans">
      {/* 1. Top Native Window Header & Scoped Auth */}
      <TitleBar session={session} onOpenLogin={() => setIsLoginOpen(true)} />

      {/* 2. Middle Body: Sidebar + Main Content View + Up Next Drawer */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setSelectedPlaylist(null);
            setCurrentTab(tab);
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-[#0d0d11]">
          {selectedPlaylist ? (
            /* Playlist Detail View */
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 select-none">
              <button
                onClick={() => setSelectedPlaylist(null)}
                className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <div className="flex flex-col sm:flex-row items-center sm:items-end space-y-4 sm:space-y-0 sm:space-x-6 pb-4 border-b border-zinc-800">
                <img
                  src={selectedPlaylist.thumbnail}
                  alt={selectedPlaylist.title}
                  className="w-36 h-36 rounded-xl object-cover shadow-xl border border-zinc-800"
                />
                <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-red-500">
                    Playlist
                  </span>
                  <h1 className="text-xl font-bold text-white">
                    {selectedPlaylist.title}
                  </h1>
                  <p className="text-xs text-zinc-400 max-w-md">
                    {selectedPlaylist.description || "Curated playlist"}
                  </p>
                  <div className="flex items-center space-x-3 pt-2 justify-center sm:justify-start">
                    {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 && (
                      <button
                        onClick={() =>
                          handlePlayTrack(
                            selectedPlaylist.tracks![0],
                            selectedPlaylist.tracks
                          )
                        }
                        className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-900/30 transition-transform hover:scale-105"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Play All</span>
                      </button>
                    )}
                    <span className="text-xs text-zinc-500 font-mono">
                      {selectedPlaylist.trackCount} tracks
                    </span>
                  </div>
                </div>
              </div>

              {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 ? (
                <div className="bg-[#121216] border border-[#1e1e24] rounded-xl p-2">
                  <TrackTable
                    tracks={selectedPlaylist.tracks}
                    currentTrackId={audioState.currentTrack?.id}
                    isPlaying={audioState.isPlaying}
                    onPlayTrack={(t) => handlePlayTrack(t, selectedPlaylist.tracks)}
                    onToggleLike={handleToggleLike}
                  />
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-zinc-500">
                  <ListMusic className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                  Playlist is currently empty.
                </div>
              )}
            </div>
          ) : currentTab === "home" ? (
            <HomeView
              currentTrackId={audioState.currentTrack?.id}
              isPlaying={audioState.isPlaying}
              onPlayTrack={handlePlayTrack}
              onSelectPlaylist={(pl) => setSelectedPlaylist(pl)}
              onToggleLike={handleToggleLike}
            />
          ) : currentTab === "search" ? (
            <SearchView
              currentTrackId={audioState.currentTrack?.id}
              isPlaying={audioState.isPlaying}
              onPlayTrack={handlePlayTrack}
              onSelectPlaylist={(pl) => setSelectedPlaylist(pl)}
              onToggleLike={handleToggleLike}
            />
          ) : currentTab === "library" || currentTab === "liked" ? (
            <LibraryView
              session={session}
              likedTracks={likedTracks}
              playlists={playlists}
              history={history}
              currentTrackId={audioState.currentTrack?.id}
              isPlaying={audioState.isPlaying}
              onPlayTrack={handlePlayTrack}
              onSelectPlaylist={(pl) => setSelectedPlaylist(pl)}
              onToggleLike={handleToggleLike}
              onOpenLogin={() => setIsLoginOpen(true)}
            />
          ) : (
            <SettingsView
              settings={settings}
              onUpdateSettings={(newSettings) =>
                setSettings((prev) => ({ ...prev, ...newSettings }))
              }
              session={session}
              onSessionChange={setSession}
              onOpenLogin={() => setIsLoginOpen(true)}
            />
          )}
        </main>

        {/* Up Next Drawer */}
        <QueueDrawer
          isOpen={isQueueOpen}
          onClose={() => setIsQueueOpen(false)}
          queue={currentQueue}
          currentTrack={audioState.currentTrack}
          onPlayTrack={(t) => audioEngine.playTrack(t)}
          onRemoveTrack={(idx) => audioEngine.removeFromQueue(idx)}
        />
      </div>

      {/* 3. Bottom Minimalist Playback Bar */}
      <PlayerBar
        currentTrack={audioState.currentTrack}
        isPlaying={audioState.isPlaying}
        currentTime={audioState.currentTime}
        duration={audioState.duration}
        volume={audioState.volume}
        isMuted={audioState.isMuted}
        repeatMode={audioState.repeatMode}
        isShuffled={audioState.isShuffled}
        queueCount={currentQueue.length}
        isQueueOpen={isQueueOpen}
        onTogglePlay={() => audioEngine.togglePlayPause()}
        onNext={() => audioEngine.playNext()}
        onPrevious={() => audioEngine.playPrevious()}
        onSeek={(sec) => audioEngine.seek(sec)}
        onVolumeChange={(vol) => audioEngine.setVolume(vol)}
        onToggleMute={() => audioEngine.toggleMute()}
        onToggleRepeat={() => audioEngine.toggleRepeat()}
        onToggleShuffle={() => audioEngine.toggleShuffle()}
        onToggleQueue={() => setIsQueueOpen(!isQueueOpen)}
        onToggleLike={handleToggleLike}
      />

      {/* 4. Google Auth Isolated WebView Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        session={session}
        onSessionChange={setSession}
      />
    </div>
  );
};

export default App;
