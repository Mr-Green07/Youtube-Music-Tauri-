import React from "react";
import { Play } from "lucide-react";

interface TrackCardProps {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
  badge?: string;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  title,
  subtitle,
  thumbnail,
  onClick,
  onPlay,
  badge,
}) => {
  return (
    <div
      onClick={onClick}
      className="group flex flex-col p-3 rounded-xl bg-[#141418] hover:bg-[#1a1a20] border border-[#202026] hover:border-zinc-700/60 transition-all cursor-pointer relative shadow-sm"
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-zinc-900 mb-3 shadow-md">
        <img
          src={thumbnail}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />

        {/* Hover Play Button Overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay(e);
          }}
          className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2 transition-all duration-200 shadow-lg hover:scale-110 active:scale-95"
          title="Play"
        >
          <Play className="w-4 h-4 fill-current ml-0.5" />
        </button>

        {badge && (
          <span className="absolute top-2 left-2 bg-black/70 backdrop-blur-md text-[10px] text-zinc-300 px-2 py-0.5 rounded-full font-medium">
            {badge}
          </span>
        )}
      </div>

      {/* Info */}
      <span className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white">
        {title}
      </span>
      <span className="text-[11px] text-zinc-400 truncate mt-0.5">
        {subtitle}
      </span>
    </div>
  );
};
