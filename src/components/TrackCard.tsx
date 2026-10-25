import React from "react";
import { ListPlus, Play, Trash2 } from "lucide-react";

interface TrackCardProps {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
  badge?: string;
  /** Shows a "Save to playlist" affordance on hover (used by track cards). */
  onSaveToPlaylist?: (e: React.MouseEvent) => void;
  /** Shows a delete affordance on hover (used by user playlist cards). */
  onDelete?: (e: React.MouseEvent) => void;
  /** Optional secondary line, e.g. total playtime. */
  meta?: string;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  title,
  subtitle,
  thumbnail,
  onClick,
  onPlay,
  badge,
  onSaveToPlaylist,
  onDelete,
  meta,
}) => {
  return (
    <div
      onClick={onClick}
      className="group flex flex-col p-3 rounded-xl bg-[#141418] hover:bg-[#1a1a20] border border-[#202026] hover:border-zinc-700/60 transition-all cursor-pointer relative shadow-sm"
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-zinc-900 mb-3 shadow-md">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
            <span className="text-3xl text-zinc-600">♪</span>
          </div>
        )}

        {/* Hover Play Button Overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay(e);
          }}
          className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2 transition-all duration-200 shadow-lg hover:scale-110 active:scale-95"
          title="Play"
          aria-label={`Play ${title}`}
        >
          <Play className="w-4 h-4 fill-current ml-0.5" />
        </button>

        {badge && (
          <span className="absolute top-2 left-2 bg-black/70 backdrop-blur-md text-[10px] text-zinc-300 px-2 py-0.5 rounded-full font-medium">
            {badge}
          </span>
        )}

        {/* Hover action cluster (save / delete) */}
        {(onSaveToPlaylist || onDelete) && (
          <div className="absolute top-2 right-2 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onSaveToPlaylist && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveToPlaylist(e);
                }}
                className="w-7 h-7 rounded-full bg-black/70 backdrop-blur-md text-zinc-300 hover:text-white hover:bg-red-600 flex items-center justify-center transition-colors"
                title="Save to playlist"
                aria-label={`Save ${title} to a playlist`}
              >
                <ListPlus className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(e);
                }}
                className="w-7 h-7 rounded-full bg-black/70 backdrop-blur-md text-zinc-300 hover:text-white hover:bg-red-600 flex items-center justify-center transition-colors"
                title="Delete playlist"
                aria-label={`Delete ${title}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <span className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white">
        {title}
      </span>
      <span className="text-[11px] text-zinc-400 truncate mt-0.5">{subtitle}</span>
      {meta && <span className="text-[10px] text-zinc-500 truncate mt-0.5 font-mono">{meta}</span>}
    </div>
  );
};
