import React, { useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  Volume1,
  VolumeX,
  Heart,
  ListMusic,
  ListPlus,
  Radio,
  Loader2,
} from "lucide-react";
import { Track, RepeatMode } from "../types/music";

interface PlayerBarProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  queueCount: number;
  isQueueOpen: boolean;
  /** Resolver that produced the current audio URL (shown as the live stream badge). */
  streamSource?: string | null;
  isResolving?: boolean;
  isFallbackStream?: boolean;
  /** Canonical liked ids so the heart stays in sync with the library. */
  likedIds?: string[];
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleQueue: () => void;
  onToggleLike: (track: Track) => void;
  onSaveToPlaylist: (track: Track) => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface StreamBadge {
  label: string;
  tone: string;
}

function describeStream(source?: string | null, isFallback?: boolean, isResolving?: boolean): StreamBadge {
  if (isResolving) {
    return { label: "Resolving stream…", tone: "bg-zinc-800 text-zinc-300 border-zinc-700/60" };
  }
  if (!source) {
    return { label: "Idle", tone: "bg-zinc-900 text-zinc-500 border-zinc-800" };
  }
  if (isFallback || source.startsWith("offline") || source.startsWith("demo")) {
    return { label: "Demo sample", tone: "bg-amber-950/60 text-amber-300 border-amber-800/60" };
  }
  if (source.startsWith("piped")) {
    return { label: "LIVE · Piped", tone: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" };
  }
  if (source.startsWith("invidious")) {
    return { label: "LIVE · Invidious", tone: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" };
  }
  if (source.startsWith("innertube")) {
    return { label: "LIVE · Innertube", tone: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" };
  }
  if (source.startsWith("yt-dlp")) {
    return { label: "LIVE · yt-dlp", tone: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" };
  }
  return { label: "LIVE · Cached", tone: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" };
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  repeatMode,
  isShuffled,
  queueCount,
  isQueueOpen,
  streamSource,
  isResolving,
  isFallbackStream,
  likedIds,
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleRepeat,
  onToggleShuffle,
  onToggleQueue,
  onToggleLike,
  onSaveToPlaylist,
}) => {
  const [hoverSeekTime, setHoverSeekTime] = useState<number | null>(null);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverSeekTime(ratio * duration);
  };

  const effectiveVolume = isMuted ? 0 : volume;
  const isCurrentLiked = currentTrack
    ? likedIds
      ? likedIds.includes(currentTrack.id)
      : Boolean(currentTrack.isLiked)
    : false;

  return (
    <div className="h-20 w-full bg-[#101014] border-t border-[#1c1c20] flex flex-col justify-between px-4 py-2 select-none z-40 shrink-0">
      {/* Top Scrubber Line */}
      <div
        className="w-full group py-1 cursor-pointer relative"
        onClick={handleProgressBarClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverSeekTime(null)}
      >
        <div className="w-full h-1 group-hover:h-2 bg-zinc-800 rounded-full overflow-hidden transition-all relative">
          <div
            className="h-full bg-red-600 transition-all rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Hover Time Tooltip */}
        {hoverSeekTime !== null && (
          <div
            className="absolute -top-7 transform -translate-x-1/2 bg-zinc-800 text-zinc-200 text-[10px] px-1.5 py-0.5 rounded shadow pointer-events-none"
            style={{
              left: `${(hoverSeekTime / (duration || 1)) * 100}%`,
            }}
          >
            {formatTime(hoverSeekTime)}
          </div>
        )}
      </div>

      {/* Main Bar Controls */}
      <div className="flex items-center justify-between h-14">
        {/* Left: Track Info */}
        <div className="flex items-center space-x-3 w-1/4 min-w-[200px]">
          {currentTrack ? (
            <>
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className="w-11 h-11 rounded-md object-cover border border-zinc-800/80 shadow-md shrink-0"
              />
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-xs font-medium text-zinc-100 truncate hover:underline cursor-pointer">
                  {currentTrack.title}
                </span>
                <span className="text-[11px] text-zinc-400 truncate hover:text-zinc-300 cursor-pointer">
                  {currentTrack.artist}
                </span>
              </div>
              <button
                onClick={() => onToggleLike(currentTrack)}
                className={`p-1.5 rounded-full hover:bg-zinc-800 transition-colors shrink-0 ${
                  isCurrentLiked ? "text-red-500" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title={isCurrentLiked ? "Remove from liked songs" : "Add to liked songs"}
              >
                <Heart className={`w-4 h-4 ${isCurrentLiked ? "fill-current" : ""}`} />
              </button>
              <button
                onClick={() => onSaveToPlaylist(currentTrack)}
                className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
                title="Save to playlist"
                aria-label="Save to playlist"
              >
                <ListPlus className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-xs text-zinc-500 italic">No track loaded</div>
          )}
        </div>

        {/* Center: Playback Controls & Timestamps */}
        <div className="flex flex-col items-center justify-center space-y-1">
          <div className="flex items-center space-x-4">
            <button
              onClick={onToggleShuffle}
              className={`p-1.5 rounded-full transition-colors ${
                isShuffled ? "text-red-500" : "text-zinc-400 hover:text-white"
              }`}
              title={`Shuffle: ${isShuffled ? "On" : "Off"}`}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onPrevious}
              className="p-1.5 text-zinc-300 hover:text-white transition-colors"
              title="Previous"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={onTogglePlay}
              className="w-9 h-9 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md shadow-white/10"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={onNext}
              className="p-1.5 text-zinc-300 hover:text-white transition-colors"
              title="Next"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              onClick={onToggleRepeat}
              className={`p-1.5 rounded-full transition-colors ${
                repeatMode !== "off" ? "text-red-500" : "text-zinc-400 hover:text-white"
              }`}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === "one" ? (
                <Repeat1 className="w-3.5 h-3.5" />
              ) : (
                <Repeat className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="text-[10px] text-zinc-400 tracking-wider font-mono">
            <span>{formatTime(currentTime)}</span>
            <span className="mx-1 text-zinc-600">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Quality, Volume, Queue */}
        <div className="flex items-center justify-end space-x-3 w-1/4 min-w-[200px]">
          {(() => {
            const badge = describeStream(streamSource, isFallbackStream, isResolving);
            return (
              <span
                className={`flex items-center space-x-1 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${badge.tone}`}
                title={streamSource ? `Stream source: ${streamSource}` : "No active stream"}
              >
                {isResolving ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Radio className="w-2.5 h-2.5" />
                )}
                <span className="max-w-[110px] truncate">{badge.label}</span>
              </span>
            );
          })()}

          {/* Volume Control */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={onToggleMute}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {effectiveVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : effectiveVolume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={effectiveVolume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Queue Drawer Button */}
          <button
            onClick={onToggleQueue}
            className={`p-2 rounded-lg transition-colors relative ${
              isQueueOpen
                ? "bg-zinc-800 text-red-400"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
            }`}
            title="Up Next Queue"
          >
            <ListMusic className="w-4 h-4" />
            {queueCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {queueCount > 99 ? "99+" : queueCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
