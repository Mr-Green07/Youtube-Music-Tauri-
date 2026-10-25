import React, { useState } from "react";
import {
  ArrowLeft,
  Play,
  Shuffle,
  ListMusic,
  Pencil,
  Trash2,
  Download,
  Check,
  X,
  Loader2,
  Clock3,
} from "lucide-react";
import { Playlist, Track } from "../types/music";
import { TrackTable } from "../components/TrackTable";
import { formatTotalDuration } from "../services/playlistStore";

interface PlaylistViewProps {
  playlist: Playlist;
  /** True while an online playlist's tracks are being fetched. */
  isLoadingTracks?: boolean;
  currentTrackId?: string;
  isPlaying: boolean;
  likedIds?: string[];
  onBack: () => void;
  onPlayTrack: (track: Track, queue: Track[]) => void;
  onPlayAll: (tracks: Track[], shuffled?: boolean) => void;
  onToggleLike: (track: Track) => void;
  onSaveToPlaylist: (track: Track) => void;
  onRemoveTrack?: (track: Track) => void;
  onRename?: (title: string) => void;
  onDelete?: () => void;
  /** "Save to my library" — imports an online playlist and all of its tracks. */
  onImport?: () => void;
  isImporting?: boolean;
}

export const PlaylistView: React.FC<PlaylistViewProps> = ({
  playlist,
  isLoadingTracks,
  currentTrackId,
  isPlaying,
  likedIds,
  onBack,
  onPlayTrack,
  onPlayAll,
  onToggleLike,
  onSaveToPlaylist,
  onRemoveTrack,
  onRename,
  onDelete,
  onImport,
  isImporting,
}) => {
  const tracks = playlist.tracks ?? [];
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(playlist.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totalSeconds = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const isUserPlaylist = Boolean(playlist.isUserPlaylist);

  const submitRename = () => {
    const next = draftTitle.trim();
    if (next && next !== playlist.title) onRename?.(next);
    setIsRenaming(false);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 select-none">
      <button
        onClick={onBack}
        className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Hero */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end space-y-4 sm:space-y-0 sm:space-x-6 pb-4 border-b border-zinc-800">
        <div className="w-36 h-36 rounded-xl overflow-hidden shadow-xl border border-zinc-800 shrink-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black flex items-center justify-center">
          {playlist.thumbnail ? (
            <img
              src={playlist.thumbnail}
              alt={playlist.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <ListMusic className="w-10 h-10 text-zinc-600" />
          )}
        </div>

        <div className="flex flex-col space-y-1.5 text-center sm:text-left min-w-0 flex-1">
          <span
            className={`text-[10px] uppercase font-bold tracking-wider ${
              isUserPlaylist ? "text-red-500" : "text-zinc-500"
            }`}
          >
            {isUserPlaylist ? "Your playlist" : "YouTube Music playlist"}
          </span>

          {isRenaming ? (
            <div className="flex items-center space-x-2">
              <input
                value={draftTitle}
                autoFocus
                maxLength={80}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setIsRenaming(false);
                }}
                className="bg-[#1a1a20] border border-[#2c2c36] focus:border-red-500/70 rounded-lg px-2 py-1 text-lg font-bold text-white focus:outline-none"
              />
              <button
                onClick={submitRename}
                className="p-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white"
                title="Save name"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsRenaming(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 justify-center sm:justify-start">
              <h1 className="text-xl font-bold text-white truncate">{playlist.title}</h1>
              {isUserPlaylist && onRename && (
                <button
                  onClick={() => {
                    setDraftTitle(playlist.title);
                    setIsRenaming(true);
                  }}
                  className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  title="Rename playlist"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {playlist.description && (
            <p className="text-xs text-zinc-400 max-w-md">{playlist.description}</p>
          )}

          <div className="flex items-center justify-center sm:justify-start space-x-2 text-[11px] text-zinc-500 font-mono pt-0.5">
            <span>{tracks.length || playlist.trackCount} tracks</span>
            {totalSeconds > 0 && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="flex items-center space-x-1">
                  <Clock3 className="w-3 h-3" />
                  <span>{formatTotalDuration(totalSeconds)}</span>
                </span>
              </>
            )}
            {playlist.author && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="truncate max-w-[160px]">{playlist.author}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 justify-center sm:justify-start">
            {tracks.length > 0 && (
              <>
                <button
                  onClick={() => onPlayAll(tracks)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-900/30 transition-transform hover:scale-105"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Play All</span>
                </button>
                <button
                  onClick={() => onPlayAll(tracks, true)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Shuffle</span>
                </button>
              </>
            )}

            {onImport && !isUserPlaylist && (
              <button
                onClick={onImport}
                disabled={isImporting || tracks.length === 0}
                className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-800/60 text-emerald-200 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Save playlist to library</span>
              </button>
            )}

            {isUserPlaylist && onDelete && (
              confirmDelete ? (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setConfirmDelete(false);
                      onDelete();
                    }}
                    className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                  >
                    Delete permanently
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-950/40 text-xs font-medium transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Track list */}
      {isLoadingTracks ? (
        <div className="py-12 flex flex-col items-center space-y-3 text-xs text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin text-red-500" />
          <span>Streaming track list from YouTube Music…</span>
        </div>
      ) : tracks.length > 0 ? (
        <div className="bg-[#121216] border border-[#1e1e24] rounded-xl p-2">
          <TrackTable
            tracks={tracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            onPlayTrack={(t) => onPlayTrack(t, tracks)}
            onToggleLike={onToggleLike}
            onSaveToPlaylist={onSaveToPlaylist}
            onRemoveTrack={isUserPlaylist ? onRemoveTrack : undefined}
            likedIds={likedIds}
          />
        </div>
      ) : (
        <div className="py-12 text-center text-xs text-zinc-500">
          <ListMusic className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
          <p>This playlist is empty.</p>
          <p className="text-[11px] text-zinc-600 mt-1">
            Use the “Save to playlist” button on any song to add it here.
          </p>
        </div>
      )}
    </div>
  );
};
