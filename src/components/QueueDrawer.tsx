import React from "react";
import { X, Play, Trash2, ListMusic } from "lucide-react";
import { Track } from "../types/music";

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  queue: Track[];
  currentTrack: Track | null;
  onPlayTrack: (track: Track) => void;
  onRemoveTrack: (index: number) => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  isOpen,
  onClose,
  queue,
  currentTrack,
  onPlayTrack,
  onRemoveTrack,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-10 right-0 w-80 bg-[#121216] border-l border-[#1c1c20] z-40 shadow-2xl flex flex-col justify-between transition-all select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center space-x-2 text-zinc-200">
          <ListMusic className="w-4 h-4 text-red-500" />
          <span className="text-xs font-semibold tracking-wide uppercase">Up Next Queue</span>
          <span className="text-[10px] text-zinc-500 font-mono">({queue.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Queue Track List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {queue.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            Queue is empty. Select a song or playlist to start playing.
          </div>
        ) : (
          queue.map((track, idx) => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <div
                key={`${track.id}-${idx}`}
                onClick={() => onPlayTrack(track)}
                className={`group flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer text-xs ${
                  isCurrent
                    ? "bg-zinc-800/80 text-red-400 border-l-2 border-red-500"
                    : "hover:bg-zinc-800/40 text-zinc-300"
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
                  <div className="relative w-8 h-8 rounded overflow-hidden shrink-0">
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-3 h-3 fill-current text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium text-zinc-200">
                      {track.title}
                    </span>
                    <span className="truncate text-[10px] text-zinc-400">
                      {track.artist}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-[10px] font-mono text-zinc-500">
                    {track.durationFormatted || "3:30"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTrack(idx);
                    }}
                    className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-zinc-800 text-[10px] text-zinc-500 text-center">
        Auto-play continues with personalized radio
      </div>
    </div>
  );
};
