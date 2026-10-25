import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListPlus, Music2, Plus, Search, X, Loader2 } from "lucide-react";
import { Playlist, Track } from "../types/music";
import { playlistStore, useUserPlaylists } from "../services/playlistStore";
import { toast } from "./Toast";

interface SaveToPlaylistModalProps {
  isOpen: boolean;
  /** Track being saved. `null` opens the modal in "manage playlists" mode. */
  track: Track | null;
  onClose: () => void;
  /** Fired after a playlist is created, so the caller can navigate to it. */
  onPlaylistCreated?: (playlist: Playlist) => void;
}

/**
 * The "Save to playlist" surface.
 *
 * Every row toggles the current track in/out of a locally persisted playlist and
 * immediately confirms the result with a toast — which is what makes the flow
 * feel like a real music library instead of a mock list.
 */
export const SaveToPlaylistModal: React.FC<SaveToPlaylistModalProps> = ({
  isOpen,
  track,
  onClose,
  onPlaylistCreated,
}) => {
  const playlists = useUserPlaylists();
  const [filter, setFilter] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFilter("");
    setIsCreating(playlists.length === 0);
    setNewTitle("");
    setIsBusy(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
    // Intentionally only react to open state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const visiblePlaylists = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => p.title.toLowerCase().includes(q));
  }, [playlists, filter]);

  if (!isOpen) return null;

  const handleToggle = (playlist: Playlist) => {
    if (!track) return;
    const result = playlistStore.toggleTrack(playlist.id, track);
    if (result === "removed") {
      toast(`Removed from “${playlist.title}”`, "info");
    } else if (result === "added") {
      toast(`Saved to “${playlist.title}”`);
    } else {
      toast("Could not update that playlist", "error");
    }
  };

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) {
      inputRef.current?.focus();
      return;
    }
    setIsBusy(true);
    try {
      const created = playlistStore.create(title);
      if (track) {
        playlistStore.addTrack(created.id, track);
        toast(`Created “${title}” and saved the track`);
      } else {
        toast(`Created “${title}”`);
      }
      onPlaylistCreated?.(playlistStore.getById(created.id) || created);
      setNewTitle("");
      setIsCreating(false);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center select-none">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-[400px] max-w-[92vw] max-h-[80vh] flex flex-col rounded-2xl bg-[#121216] border border-[#26262e] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#23232a]">
          <div className="flex items-center space-x-2">
            <ListPlus className="w-4 h-4 text-red-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-100">
              {track ? "Save to playlist" : "Your playlists"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Track preview */}
        {track && (
          <div className="flex items-center space-x-3 px-4 py-3 border-b border-[#23232a] bg-[#15151a]">
            <img
              src={track.thumbnail}
              alt={track.title}
              className="w-10 h-10 rounded object-cover border border-zinc-800 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-100 truncate">{track.title}</p>
              <p className="text-[11px] text-zinc-400 truncate">{track.artist}</p>
            </div>
          </div>
        )}

        {/* Filter */}
        {playlists.length > 4 && (
          <div className="px-3 pt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a playlist"
                className="w-full bg-[#1a1a20] border border-[#26262e] focus:border-zinc-600 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Playlist rows */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {visiblePlaylists.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-zinc-500">
              {playlists.length === 0
                ? "No playlists yet — create your first one below."
                : `No playlist matches “${filter}”.`}
            </div>
          )}

          {visiblePlaylists.map((playlist) => {
            const contains = Boolean(track && playlist.tracks?.some((t) => t.id === track.id));
            return (
              <button
                key={playlist.id}
                onClick={() => handleToggle(playlist)}
                disabled={!track}
                className={`w-full flex items-center space-x-3 px-2 py-2 rounded-lg text-left transition-colors ${
                  track ? "hover:bg-zinc-800/60 cursor-pointer" : "cursor-default"
                }`}
              >
                <div className="w-9 h-9 rounded bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center border border-zinc-700/60">
                  {playlist.thumbnail ? (
                    <img
                      src={playlist.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Music2 className="w-4 h-4 text-zinc-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-100 truncate">{playlist.title}</p>
                  <p className="text-[10px] text-zinc-500">
                    {playlist.trackCount} {playlist.trackCount === 1 ? "song" : "songs"}
                    {playlist.description ? ` • ${playlist.description}` : ""}
                  </p>
                </div>

                {track && (
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                      contains
                        ? "bg-red-600 border-red-500 text-white"
                        : "border-zinc-600 text-transparent"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Create new playlist */}
        <div className="border-t border-[#23232a] p-3 space-y-2 bg-[#141419]">
          {isCreating ? (
            <div className="flex items-center space-x-2">
              <input
                ref={inputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="New playlist name"
                maxLength={80}
                className="flex-1 bg-[#1a1a20] border border-[#2c2c36] focus:border-red-500/70 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                onClick={handleCreate}
                disabled={isBusy || !newTitle.trim()}
                className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors flex items-center space-x-1"
              >
                {isBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Create</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setIsCreating(true);
                window.setTimeout(() => inputRef.current?.focus(), 30);
              }}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg border border-dashed border-zinc-700 hover:border-red-500/60 hover:text-white text-zinc-400 text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create new playlist</span>
            </button>
          )}

          <p className="text-[10px] text-zinc-600 text-center leading-snug">
            Playlists are stored on this device and play back instantly — no account needed.
          </p>
        </div>
      </div>
    </div>
  );
};
