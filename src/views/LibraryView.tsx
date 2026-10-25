import React from "react";
import { Heart, Play, ListMusic, History, Lock, Plus, Shuffle } from "lucide-react";
import { Track, Playlist, UserSession } from "../types/music";
import { TrackTable } from "../components/TrackTable";
import { TrackCard } from "../components/TrackCard";
import { formatTotalDuration } from "../services/playlistStore";

interface LibraryViewProps {
  session: UserSession;
  likedTracks: Track[];
  playlists: Playlist[];
  history: Track[];
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track, queueContext?: Track[]) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onToggleLike: (track: Track) => void;
  onSaveToPlaylist: (track: Track) => void;
  onOpenLogin: () => void;
  onCreatePlaylist: () => void;
  onDeletePlaylist: (playlist: Playlist) => void;
  onShufflePlay: (tracks: Track[]) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  session,
  likedTracks,
  playlists,
  history,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onSelectPlaylist,
  onToggleLike,
  onSaveToPlaylist,
  onOpenLogin,
  onCreatePlaylist,
  onDeletePlaylist,
  onShufflePlay,
}) => {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 select-none">
      {/* Auth Banner if Guest */}
      {!session.isAuthenticated && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/30 to-zinc-900 border border-red-900/40 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-xs font-bold text-red-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Running in Isolated Local Vault</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Your saved playlists live on this device. Sign in with Google to also sync your
              YouTube Music library.
            </p>
          </div>
          <button
            onClick={onOpenLogin}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-colors shrink-0"
          >
            Connect Account
          </button>
        </div>
      )}

      {/* Liked Songs Header Block */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Heart className="w-4 h-4 text-red-500 fill-current" />
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              Liked Songs ({likedTracks.length})
            </h2>
          </div>

          {likedTracks.length > 0 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onShufflePlay(likedTracks)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
              >
                <Shuffle className="w-3 h-3" />
                <span>Shuffle</span>
              </button>
              <button
                onClick={() => onPlayTrack(likedTracks[0], likedTracks)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow transition-colors"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Play All</span>
              </button>
            </div>
          )}
        </div>

        {likedTracks.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 bg-[#121216] border border-[#1e1e24] rounded-xl">
            You haven&apos;t liked any songs yet. Click the heart icon on any song to save it here.
          </div>
        ) : (
          <div className="bg-[#121216] border border-[#1e1e24] rounded-xl p-2">
            <TrackTable
              tracks={likedTracks}
              currentTrackId={currentTrackId}
              isPlaying={isPlaying}
              onPlayTrack={(t) => onPlayTrack(t, likedTracks)}
              onToggleLike={onToggleLike}
              onSaveToPlaylist={onSaveToPlaylist}
            />
          </div>
        )}
      </section>

      {/* Playlists section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ListMusic className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              Your Playlists ({playlists.length})
            </h2>
          </div>

          <button
            onClick={onCreatePlaylist}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Playlist</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {playlists.map((pl) => (
            <TrackCard
              key={pl.id}
              id={pl.id}
              title={pl.title}
              subtitle={`${pl.trackCount} ${pl.trackCount === 1 ? "track" : "tracks"}`}
              meta={formatTotalDuration((pl.tracks || []).reduce((s, t) => s + t.duration, 0))}
              thumbnail={pl.thumbnail}
              onClick={() => onSelectPlaylist(pl)}
              onPlay={() =>
                pl.tracks && pl.tracks.length > 0
                  ? onPlayTrack(pl.tracks[0], pl.tracks)
                  : onSelectPlaylist(pl)
              }
              onDelete={() => onDeletePlaylist(pl)}
            />
          ))}

          {/* Create playlist tile */}
          <button
            onClick={onCreatePlaylist}
            className="group flex flex-col p-3 rounded-xl border border-dashed border-[#2c2c36] hover:border-red-500/60 bg-[#101014] hover:bg-[#141419] transition-all text-left"
          >
            <div className="aspect-square w-full rounded-lg bg-[#16161b] group-hover:bg-[#1c1c22] flex items-center justify-center mb-3 transition-colors">
              <Plus className="w-7 h-7 text-zinc-600 group-hover:text-red-400 transition-colors" />
            </div>
            <span className="text-xs font-semibold text-zinc-300 group-hover:text-white">
              Create playlist
            </span>
            <span className="text-[11px] text-zinc-500 mt-0.5">Collect songs you love</span>
          </button>
        </div>

        {playlists.length === 0 && (
          <p className="text-[11px] text-zinc-500">
            Tip: hover any song and press the “Save to playlist” icon to build your first playlist.
          </p>
        )}
      </section>

      {/* History section */}
      {history.length > 0 && (
        <section className="space-y-4 pb-4">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              Recently Played
            </h2>
          </div>

          <div className="bg-[#121216] border border-[#1e1e24] rounded-xl p-2">
            <TrackTable
              tracks={history}
              currentTrackId={currentTrackId}
              isPlaying={isPlaying}
              onPlayTrack={(t) => onPlayTrack(t, history)}
              onToggleLike={onToggleLike}
              onSaveToPlaylist={onSaveToPlaylist}
              likedIds={likedTracks.map((t) => t.id)}
            />
          </div>
        </section>
      )}
    </div>
  );
};
