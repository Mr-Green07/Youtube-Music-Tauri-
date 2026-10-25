import React from "react";
import { Play, Pause, Heart, Clock, ListPlus, Trash2 } from "lucide-react";
import { Track } from "../types/music";

interface TrackTableProps {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track) => void;
  onToggleLike: (track: Track) => void;
  /** Opens the "Save to playlist" modal for the row. */
  onSaveToPlaylist?: (track: Track) => void;
  /** Removes the row from the playlist currently being viewed. */
  onRemoveTrack?: (track: Track) => void;
  emptyLabel?: string;
  /** Canonical liked track ids; keeps the heart in sync across every view. */
  likedIds?: string[];
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export const TrackTable: React.FC<TrackTableProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onToggleLike,
  onSaveToPlaylist,
  onRemoveTrack,
  emptyLabel,
  likedIds,
}) => {
  if (tracks.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-zinc-500">
        {emptyLabel || "No songs here yet."}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col select-none">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/60">
        <div className="col-span-1 text-center">#</div>
        <div className="col-span-5">Title</div>
        <div className="col-span-3">Artist / Album</div>
        <div className="col-span-1 flex items-center justify-end">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div className="col-span-2 text-center">Actions</div>
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-zinc-900/60">
        {tracks.map((track, idx) => {
          const isCurrent = currentTrackId === track.id;
          const isLiked = likedIds ? likedIds.includes(track.id) : Boolean(track.isLiked);
          return (
            <div
              key={`${track.id}-${idx}`}
              onClick={() => onPlayTrack(track)}
              className={`group grid grid-cols-12 gap-3 px-3 py-2.5 items-center rounded-lg transition-colors cursor-pointer text-xs ${
                isCurrent
                  ? "bg-zinc-800/60 text-red-400"
                  : "hover:bg-zinc-800/30 text-zinc-300 hover:text-white"
              }`}
            >
              {/* Col 1: Index / Play Button */}
              <div className="col-span-1 flex items-center justify-center">
                <span className="group-hover:hidden text-zinc-500 font-mono text-[11px]">
                  {isCurrent && isPlaying ? (
                    <span className="flex space-x-0.5 items-end h-3">
                      <span className="w-0.5 h-3 bg-red-500 animate-pulse" />
                      <span className="w-0.5 h-2 bg-red-500 animate-pulse delay-75" />
                      <span className="w-0.5 h-3.5 bg-red-500 animate-pulse delay-150" />
                    </span>
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="hidden group-hover:flex items-center justify-center text-white">
                  {isCurrent && isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current text-red-500" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                </span>
              </div>

              {/* Col 2: Thumbnail & Title */}
              <div className="col-span-5 flex items-center space-x-3 min-w-0">
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="w-9 h-9 rounded object-cover shrink-0 border border-zinc-800"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <p className={`font-medium truncate ${isCurrent ? "text-red-400" : "text-zinc-200"}`}>
                    {track.title}
                  </p>
                </div>
              </div>

              {/* Col 3: Artist & Album */}
              <div className="col-span-3 truncate text-zinc-400 text-[11px]">
                <span>{track.artist}</span>
                {track.album && <span className="text-zinc-500 ml-1.5">• {track.album}</span>}
              </div>

              {/* Col 4: Duration */}
              <div className="col-span-1 text-right text-zinc-400 font-mono text-[11px]">
                {track.duration ? track.durationFormatted || formatDuration(track.duration) : "—"}
              </div>

              {/* Col 5: Like / Save to playlist / Remove */}
              <div className="col-span-2 flex items-center justify-center space-x-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLike(track);
                  }}
                  className={`p-1.5 rounded-full transition-colors ${
                    isLiked
                      ? "text-red-500"
                      : "text-zinc-600 hover:text-zinc-200 opacity-0 group-hover:opacity-100"
                  }`}
                  title={isLiked ? "Remove from liked songs" : "Add to liked songs"}
                  aria-label={isLiked ? "Unlike track" : "Like track"}
                >
                  <Heart className={`w-3.5 h-3.5 ${isLiked ? "fill-current" : ""}`} />
                </button>

                {onSaveToPlaylist && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSaveToPlaylist(track);
                    }}
                    className="p-1.5 rounded-full text-zinc-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                    title="Save to playlist"
                    aria-label="Save to playlist"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                  </button>
                )}

                {onRemoveTrack && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTrack(track);
                    }}
                    className="p-1.5 rounded-full text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove from this playlist"
                    aria-label="Remove from playlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
