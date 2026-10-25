import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar, NavTab } from "./components/Sidebar";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { LoginModal } from "./components/LoginModal";
import { SaveToPlaylistModal } from "./components/SaveToPlaylistModal";
import { Toaster, toast } from "./components/Toast";
import { HomeView } from "./views/HomeView";
import { SearchView } from "./views/SearchView";
import { LibraryView } from "./views/LibraryView";
import { SettingsView } from "./views/SettingsView";
import { PlaylistView } from "./views/PlaylistView";
import { Track, Playlist, UserSession, PlayerSettings } from "./types/music";
import { audioEngine } from "./services/audioEngine";
import {
  getAuthSession,
  fetchAudioStream,
  fetchOnlinePlaylist,
  isTauri,
} from "./services/tauriBridge";
import { playlistStore, useUserPlaylists } from "./services/playlistStore";
import { MOCK_TRACKS } from "./services/mockData";
import "./App.css";

export const App: React.FC = () => {
  // Navigation & UI State
  const [currentTab, setCurrentTab] = useState<NavTab>("home");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isLoadingPlaylistTracks, setIsLoadingPlaylistTracks] = useState(false);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);

  // Save-to-playlist modal
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [trackToSave, setTrackToSave] = useState<Track | null>(null);

  // User & Settings
  const [session, setSession] = useState<UserSession>({ isAuthenticated: false });
  const [settings, setSettings] = useState<PlayerSettings>({
    quality: "normal",
    volume: 0.8,
    normalizeVolume: true,
    minimizeToTray: true,
    enableHardwareMediaKeys: true,
  });

  // Persisted user playlists (created via "Save to playlist")
  const userPlaylists = useUserPlaylists();

  // Library & Music Data
  const [likedTracks, setLikedTracks] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ytm_liked_tracks");
    return saved ? JSON.parse(saved) : MOCK_TRACKS.filter((t) => t.isLiked);
  });
  const [history, setHistory] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ytm_history");
    return saved ? JSON.parse(saved) : [];
  });

  // Audio Engine State
  const [audioState, setAudioState] = useState(audioEngine.getState());
  const fallbackNotifiedRef = useRef<string | null>(null);

  const likedIds = useMemo(() => likedTracks.map((t) => t.id), [likedTracks]);

  // ── Initialisation ─────────────────────────────────────────────────────────

  useEffect(() => {
    getAuthSession().then(setSession);

    // Stream resolution is owned by the engine so auto-advance, skips and
    // playlist playback all resolve real online streams — not just the first click.
    audioEngine.setStreamResolver((track, options) => fetchAudioStream(track, options));
    audioEngine.setVolume(settings.volume);

    const unsubscribe = audioEngine.subscribe(setAudioState);

    if (isTauri()) {
      import("@tauri-apps/api/event")
        .then(({ listen }) => {
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
        })
        .catch(console.error);
    }

    return () => {
      unsubscribe();
      audioEngine.setStreamResolver(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist library data
  useEffect(() => {
    localStorage.setItem("ytm_liked_tracks", JSON.stringify(likedTracks));
  }, [likedTracks]);

  useEffect(() => {
    localStorage.setItem("ytm_history", JSON.stringify(history));
  }, [history]);

  // Warn once per track when only the offline demo sample could be resolved.
  useEffect(() => {
    const track = audioState.currentTrack;
    if (!track || !audioState.isFallbackStream) return;
    if (fallbackNotifiedRef.current === track.id) return;
    fallbackNotifiedRef.current = track.id;
    toast("No online stream resolved — playing demo audio.", "info");
  }, [audioState.currentTrack, audioState.isFallbackStream]);

  // ── Playback ───────────────────────────────────────────────────────────────

  const handlePlayTrack = useCallback((track: Track, queueContext?: Track[]) => {
    setHistory((prev) => [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 50));
    audioEngine.playTrack(track, queueContext);
  }, []);

  const handlePlayAll = useCallback(
    (tracks: Track[], shuffled = false) => {
      if (tracks.length === 0) return;
      const order = shuffled ? shuffleTracks(tracks) : tracks;
      handlePlayTrack(order[0], order);
      if (shuffled) toast("Shuffled playback started", "info", 1800);
    },
    [handlePlayTrack]
  );

  // ── Likes ──────────────────────────────────────────────────────────────────

  const handleToggleLike = useCallback((track: Track) => {
    setLikedTracks((prev) => {
      const exists = prev.some((t) => t.id === track.id);
      if (exists) return prev.filter((t) => t.id !== track.id);
      return [{ ...track, isLiked: true }, ...prev];
    });
  }, []);

  // ── Playlists ──────────────────────────────────────────────────────────────

  const openSaveModal = useCallback((track: Track | null) => {
    setTrackToSave(track);
    setIsSaveModalOpen(true);
  }, []);

  const handleRemoveTrackFromPlaylist = useCallback(
    (playlistId: string, track: Track) => {
      const removed = playlistStore.removeTrack(playlistId, track.id);
      if (removed) toast(`Removed “${track.title}” from playlist`, "info");
    },
    []
  );

  const handleCreatePlaylist = useCallback(() => {
    openSaveModal(null);
  }, [openSaveModal]);

  const handleDeletePlaylist = useCallback(
    (playlist: Playlist) => {
      const confirmed = window.confirm(
        `Delete the playlist “${playlist.title}”? Saved songs are not removed from your library.`
      );
      if (!confirmed) return;
      playlistStore.delete(playlist.id);
      setSelectedPlaylist((current) => (current?.id === playlist.id ? null : current));
      toast(`Deleted “${playlist.title}”`, "info");
    },
    []
  );

  const handleSelectPlaylist = useCallback(async (playlist: Playlist) => {
    setSelectedPlaylist(playlist);

    // Online playlists arrive without tracks — hydrate them on open.
    const isOnline = !playlist.isUserPlaylist;
    const hasTracks = Boolean(playlist.tracks && playlist.tracks.length > 0);
    if (!isOnline || hasTracks) return;

    setIsLoadingPlaylistTracks(true);
    try {
      const details = await fetchOnlinePlaylist(playlist);
      setSelectedPlaylist((current) =>
        current && current.id === playlist.id
          ? {
              ...current,
              title: details.title || current.title,
              author: details.author || current.author,
              thumbnail: current.thumbnail || details.thumbnail || "",
              tracks: details.tracks,
              trackCount: details.tracks.length,
            }
          : current
      );
      if (details.tracks.length === 0) {
        toast("Could not load this playlist's tracks. Check your connection.", "error");
      }
    } finally {
      setIsLoadingPlaylistTracks(false);
    }
  }, []);

  /** Persists an online YouTube Music playlist into the local user library. */
  const handleImportPlaylist = useCallback(async () => {
    const playlist = selectedPlaylist;
    if (!playlist) return;
    const tracks = playlist.tracks ?? [];
    if (tracks.length === 0) return;

    setIsImportingPlaylist(true);
    try {
      const created = playlistStore.create(
        playlist.title,
        tracks,
        playlist.description || `Imported from YouTube Music • ${playlist.author || "Online"}`
      );
      toast(`Saved “${playlist.title}” with ${tracks.length} songs`);
      const stored = playlistStore.getById(created.id) || created;
      setSelectedPlaylist(stored);
    } finally {
      setIsImportingPlaylist(false);
    }
  }, [selectedPlaylist]);

  // Always render the freshest copy of a user playlist (live store updates).
  const activePlaylist = useMemo(() => {
    if (!selectedPlaylist) return null;
    if (!selectedPlaylist.isUserPlaylist) return selectedPlaylist;
    return userPlaylists.find((p) => p.id === selectedPlaylist.id) ?? selectedPlaylist;
  }, [selectedPlaylist, userPlaylists]);

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
          {activePlaylist ? (
            <PlaylistView
              playlist={activePlaylist}
              isLoadingTracks={isLoadingPlaylistTracks}
              currentTrackId={audioState.currentTrack?.id}
              isPlaying={audioState.isPlaying}
              likedIds={likedIds}
              onBack={() => setSelectedPlaylist(null)}
              onPlayTrack={handlePlayTrack}
              onPlayAll={handlePlayAll}
              onToggleLike={handleToggleLike}
              onSaveToPlaylist={openSaveModal}
              onRemoveTrack={
                activePlaylist.isUserPlaylist
                  ? (track) => handleRemoveTrackFromPlaylist(activePlaylist.id, track)
                  : undefined
              }
              onRename={
                activePlaylist.isUserPlaylist
                  ? (title) => {
                      playlistStore.rename(activePlaylist.id, title);
                      toast("Playlist renamed");
                    }
                  : undefined
              }
              onDelete={
                activePlaylist.isUserPlaylist
                  ? () => handleDeletePlaylist(activePlaylist)
                  : undefined
              }
              onImport={!activePlaylist.isUserPlaylist ? handleImportPlaylist : undefined}
              isImporting={isImportingPlaylist}
            />
          ) : currentTab === "home" ? (
            <HomeView
              currentTrackId={audioState.currentTrack?.id}
              isPlaying={audioState.isPlaying}
              likedIds={likedIds}
              onPlayTrack={handlePlayTrack}
              onSelectPlaylist={handleSelectPlaylist}
              onToggleLike={handleToggleLike}
              onSaveToPlaylist={openSaveModal}
            />
          ) : currentTab === "search" ? (
            <SearchView
              currentTrackId={audioState.currentTrack?.id}
              isPlaying={audioState.isPlaying}
              likedIds={likedIds}
              onPlayTrack={handlePlayTrack}
              onSelectPlaylist={handleSelectPlaylist}
              onToggleLike={handleToggleLike}
              onSaveToPlaylist={openSaveModal}
            />
          ) : currentTab === "library" || currentTab === "liked" ? (
            <LibraryView
              session={session}
              likedTracks={likedTracks}
              playlists={userPlaylists}
              history={history}
              currentTrackId={audioState.currentTrack?.id}
              isPlaying={audioState.isPlaying}
              onPlayTrack={handlePlayTrack}
              onSelectPlaylist={handleSelectPlaylist}
              onToggleLike={handleToggleLike}
              onSaveToPlaylist={openSaveModal}
              onOpenLogin={() => setIsLoginOpen(true)}
              onCreatePlaylist={handleCreatePlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onShufflePlay={(tracks) => handlePlayAll(tracks, true)}
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
        streamSource={audioState.streamSource}
        isResolving={audioState.isResolving}
        isFallbackStream={audioState.isFallbackStream}
        likedIds={likedIds}
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
        onSaveToPlaylist={openSaveModal}
      />

      {/* 4. Google Auth Isolated WebView Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        session={session}
        onSessionChange={setSession}
      />

      {/* 5. Save to playlist (create / toggle membership) */}
      <SaveToPlaylistModal
        isOpen={isSaveModalOpen}
        track={trackToSave}
        onClose={() => setIsSaveModalOpen(false)}
        onPlaylistCreated={(created) => {
          if (!trackToSave) {
            setSelectedPlaylist(created);
          }
        }}
      />

      {/* 6. Global toast layer */}
      <Toaster />
    </div>
  );
};

function shuffleTracks(tracks: Track[]): Track[] {
  const copy = [...tracks];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default App;
