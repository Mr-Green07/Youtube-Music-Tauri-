import React from "react";
import { Heart, Play, ListMusic, History, Lock } from "lucide-react";
import { Track, Playlist, UserSession } from "../types/music";
import { TrackTable } from "../components/TrackTable";
import { TrackCard } from "../components/TrackCard";

interface LibraryViewProps {
  session: UserSession;
  likedTracks: Track[];
  playlists: Playlist[];
  history: Track[];
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track, queueContext?: Track[]) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onToggleLike: (trackId: string) => void;
  onOpenLogin: () => void;
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
  onOpenLogin,
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
              Sign in with your Google Account to automatically sync playlists and liked songs from YouTube Music.
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
            <button
              onClick={() => onPlayTrack(likedTracks[0], likedTracks)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Play All</span>
            </button>
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
            />
          </div>
        )}
      </section>

      {/* Playlists section */}
      <section className="space-y-4">
        <div className="flex items-center space-x-2">
          <ListMusic className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
            Your Playlists
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {playlists.map((pl) => (
            <TrackCard
              key={pl.id}
              id={pl.id}
              title={pl.title}
              subtitle={`${pl.trackCount} tracks`}
              thumbnail={pl.thumbnail}
              onClick={() => onSelectPlaylist(pl)}
              onPlay={() => onSelectPlaylist(pl)}
            />
          ))}
        </div>
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
            />
          </div>
        </section>
      )}
    </div>
  );
};
