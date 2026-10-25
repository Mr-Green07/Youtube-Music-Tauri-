import React, { useEffect, useState } from "react";
import { Sparkles, TrendingUp, Radio } from "lucide-react";
import { Track, Playlist } from "../types/music";
import { TrackCard } from "../components/TrackCard";
import { TrackTable } from "../components/TrackTable";
import { fetchHomeFeed } from "../services/tauriBridge";

interface HomeViewProps {
  currentTrackId?: string;
  isPlaying: boolean;
  likedIds?: string[];
  onPlayTrack: (track: Track, queueContext?: Track[]) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onToggleLike: (track: Track) => void;
  onSaveToPlaylist: (track: Track) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  currentTrackId,
  isPlaying,
  likedIds,
  onPlayTrack,
  onSelectPlaylist,
  onToggleLike,
  onSaveToPlaylist,
}) => {
  const [quickPicks, setQuickPicks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchHomeFeed().then((data) => {
      if (mounted) {
        setQuickPicks(data.quickPicks);
        setPlaylists(data.recommendedPlaylists);
        setTrending(data.trending);
        setIsLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-400">Loading YouTube Music stream...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 select-none">
      {/* Section 1: Quick Picks */}
      <section className="space-y-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
            Quick Picks
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {quickPicks.map((track) => (
            <TrackCard
              key={track.id}
              id={track.id}
              title={track.title}
              subtitle={track.artist}
              thumbnail={track.thumbnail}
              onClick={() => onPlayTrack(track, quickPicks)}
              onPlay={() => onPlayTrack(track, quickPicks)}
              onSaveToPlaylist={() => onSaveToPlaylist(track)}
              badge={track.durationFormatted}
            />
          ))}
        </div>
      </section>

      {/* Section 2: Recommended Mixes & Playlists */}
      <section className="space-y-4">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
            Recommended Stations & Mixes
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => onSelectPlaylist(pl)}
              className="group flex p-3 rounded-xl bg-[#141418] hover:bg-[#1a1a20] border border-[#202026] hover:border-zinc-700/60 transition-all cursor-pointer space-x-4 items-center"
            >
              <img
                src={pl.thumbnail}
                alt={pl.title}
                className="w-16 h-16 rounded-lg object-cover shrink-0 shadow-md group-hover:scale-105 transition-transform"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-zinc-200 group-hover:text-white truncate">
                  {pl.title}
                </span>
                <span className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                  {pl.description || `Collection with ${pl.trackCount} songs`}
                </span>
                <span className="text-[10px] text-zinc-500 mt-1 font-mono">
                  {pl.author || "YouTube Music"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Trending Chart */}
      <section className="space-y-4 pb-4">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
            Trending Charts
          </h2>
        </div>

        <div className="bg-[#121216] border border-[#1e1e24] rounded-xl p-2 shadow-sm">
          <TrackTable
            tracks={trending}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            onPlayTrack={(track) => onPlayTrack(track, trending)}
            onToggleLike={onToggleLike}
            onSaveToPlaylist={onSaveToPlaylist}
            likedIds={likedIds}
          />
        </div>
      </section>
    </div>
  );
};
