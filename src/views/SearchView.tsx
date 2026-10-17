import React, { useState, useEffect } from "react";
import { Search as SearchIcon, X, Music, Disc, Radio } from "lucide-react";
import { Track, Playlist, SearchResults } from "../types/music";
import { TrackTable } from "../components/TrackTable";
import { TrackCard } from "../components/TrackCard";
import { searchYouTubeMusic } from "../services/tauriBridge";

interface SearchViewProps {
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track, queueContext?: Track[]) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onToggleLike: (trackId: string) => void;
}

type FilterCategory = "all" | "songs" | "albums" | "playlists";

export const SearchView: React.FC<SearchViewProps> = ({
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onSelectPlaylist,
  onToggleLike,
}) => {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("all");
  const [results, setResults] = useState<SearchResults>({ tracks: [], albums: [], playlists: [] });
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ tracks: [], albums: [], playlists: [] });
      return;
    }

    const handler = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchYouTubeMusic(query);
        setResults(res);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(handler);
  }, [query]);

  const quickGenres = ["Synthwave", "Lo-Fi Beats", "Cyberpunk", "Deep House", "Ambient Chill", "Classical Focus"];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 select-none">
      {/* Search Input Bar */}
      <div className="relative max-w-xl">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
          <SearchIcon className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, artists, albums, or paste YouTube link..."
          className="w-full bg-[#141418] border border-[#22222a] focus:border-red-500 text-xs text-zinc-100 pl-10 pr-10 py-3 rounded-xl focus:outline-none transition-colors shadow-inner placeholder:text-zinc-500"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      {query && (
        <div className="flex items-center space-x-2 text-xs">
          {(["all", "songs", "albums", "playlists"] as FilterCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${
                activeCategory === cat
                  ? "bg-zinc-800 text-white border border-zinc-700"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Loading state */}
      {isSearching && (
        <div className="py-8 text-center text-xs text-zinc-500">
          Searching private YouTube Music endpoints...
        </div>
      )}

      {/* Results View */}
      {query && !isSearching && (
        <div className="space-y-6">
          {/* Songs section */}
          {(activeCategory === "all" || activeCategory === "songs") && results.tracks.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center space-x-2 text-zinc-300 text-xs font-bold uppercase tracking-wider">
                <Music className="w-3.5 h-3.5 text-red-500" />
                <span>Songs ({results.tracks.length})</span>
              </div>
              <div className="bg-[#121216] border border-[#1e1e24] rounded-xl p-2">
                <TrackTable
                  tracks={results.tracks}
                  currentTrackId={currentTrackId}
                  isPlaying={isPlaying}
                  onPlayTrack={(t) => onPlayTrack(t, results.tracks)}
                  onToggleLike={onToggleLike}
                />
              </div>
            </section>
          )}

          {/* Albums section */}
          {(activeCategory === "all" || activeCategory === "albums") && results.albums.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center space-x-2 text-zinc-300 text-xs font-bold uppercase tracking-wider">
                <Disc className="w-3.5 h-3.5 text-red-500" />
                <span>Albums</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                {results.albums.map((alb) => (
                  <TrackCard
                    key={alb.id}
                    id={alb.id}
                    title={alb.title}
                    subtitle={`${alb.artist} • ${alb.year || ""}`}
                    thumbnail={alb.thumbnail}
                    onClick={() => {
                      if (alb.tracks && alb.tracks.length > 0) {
                        onPlayTrack(alb.tracks[0], alb.tracks);
                      }
                    }}
                    onPlay={() => {
                      if (alb.tracks && alb.tracks.length > 0) {
                        onPlayTrack(alb.tracks[0], alb.tracks);
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Playlists section */}
          {(activeCategory === "all" || activeCategory === "playlists") && results.playlists.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center space-x-2 text-zinc-300 text-xs font-bold uppercase tracking-wider">
                <Radio className="w-3.5 h-3.5 text-red-500" />
                <span>Community & Curated Playlists</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {results.playlists.map((pl) => (
                  <TrackCard
                    key={pl.id}
                    id={pl.id}
                    title={pl.title}
                    subtitle={`${pl.trackCount} tracks • ${pl.author || "YouTube Music"}`}
                    thumbnail={pl.thumbnail}
                    onClick={() => onSelectPlaylist(pl)}
                    onPlay={() => onSelectPlaylist(pl)}
                  />
                ))}
              </div>
            </section>
          )}

          {results.tracks.length === 0 && results.albums.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-500">
              No results found for &quot;{query}&quot;. Try a different search term.
            </div>
          )}
        </div>
      )}

      {/* Default / Empty Search Screen */}
      {!query && (
        <div className="space-y-6 pt-4">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Suggested Soundtracks & Genres
          </span>
          <div className="flex flex-wrap gap-2">
            {quickGenres.map((genre) => (
              <button
                key={genre}
                onClick={() => setQuery(genre)}
                className="px-3 py-2 rounded-xl bg-[#141418] hover:bg-[#1f1f26] border border-[#22222a] text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
