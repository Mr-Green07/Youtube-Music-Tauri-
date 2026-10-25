/**
 * Playlist Store — local, persisted user library.
 *
 * Every playlist created through the "Save to playlist" flow is stored here and
 * mirrored into `localStorage`, so saved music survives app restarts without
 * requiring a Google/YouTube Music session.
 *
 * The store is intentionally framework-agnostic (subscribe/getSnapshot) so it can
 * be consumed from React through `useUserPlaylists()` or imperatively anywhere.
 */

import { useSyncExternalStore } from "react";
import { Playlist, Track } from "../types/music";

const STORAGE_KEY = "ytm_user_playlists_v1";

export type AddTrackResult = "added" | "exists" | "missing-playlist";

type Listener = () => void;

const listeners = new Set<Listener>();
let playlists: Playlist[] = loadFromStorage();
let snapshot: Playlist[] = playlists;
let version = 0;

// ── Persistence ──────────────────────────────────────────────────────────────

function safeParse(raw: string | null): Playlist[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Playlist => Boolean(p) && typeof p === "object" && typeof p.title === "string")
      .map((p) => normalizePlaylist(p));
  } catch {
    return [];
  }
}

function loadFromStorage(): Playlist[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  } catch (e) {
    console.warn("[playlists] Unable to persist library:", e);
  }
}

function normalizePlaylist(p: Playlist): Playlist {
  const tracks = Array.isArray(p.tracks) ? p.tracks.map(normalizeTrack) : [];
  return {
    ...p,
    id: p.id || createId(),
    tracks,
    trackCount: tracks.length,
    thumbnail: p.thumbnail || tracks[0]?.thumbnail || "",
    isUserPlaylist: p.isUserPlaylist ?? true,
    author: p.author || "You",
  };
}

/**
 * Stream URLs are signed and expire after a few hours — never store them, or a
 * saved track becomes unplayable tomorrow. They are re-resolved at play time.
 */
function normalizeTrack(track: Track): Track {
  const clean: Track = { ...track, isLiked: track.isLiked ?? false };
  delete clean.streamUrl;
  return clean;
}

function createId(): string {
  return `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function emit() {
  version += 1;
  snapshot = playlists.map((p) => ({
    ...p,
    trackCount: p.tracks?.length ?? 0,
    thumbnail: p.thumbnail || p.tracks?.[0]?.thumbnail || "",
  }));
  persist();
  listeners.forEach((listener) => listener());
}

// ── Public API ───────────────────────────────────────────────────────────────

export const playlistStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): Playlist[] {
    return snapshot;
  },

  getVersion(): number {
    return version;
  },

  getAll(): Playlist[] {
    return snapshot;
  },

  getById(id: string): Playlist | undefined {
    return snapshot.find((p) => p.id === id);
  },

  /** Creates a new playlist (optionally pre-filled) and returns it. */
  create(title: string, tracks: Track[] = [], description?: string): Playlist {
    const cleanTitle = title.trim() || "New Playlist";
    const seeded = tracks.map(normalizeTrack);
    const playlist: Playlist = {
      id: createId(),
      title: cleanTitle,
      description,
      thumbnail: seeded[0]?.thumbnail || "",
      trackCount: seeded.length,
      author: "You",
      tracks: seeded,
      isUserPlaylist: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    playlists = [playlist, ...playlists];
    emit();
    return playlist;
  },

  /**
   * Adds a single track. Returns `exists` when the playlist already contains it
   * so the UI can tell the user instead of silently duplicating.
   */
  addTrack(playlistId: string, track: Track): AddTrackResult {
    const index = playlists.findIndex((p) => p.id === playlistId);
    if (index === -1) return "missing-playlist";

    const current = playlists[index];
    const existing = current.tracks ?? [];
    if (existing.some((t) => t.id === track.id)) return "exists";

    const updated: Playlist = {
      ...current,
      tracks: [...existing, normalizeTrack(track)],
      thumbnail: current.thumbnail || track.thumbnail,
      updatedAt: Date.now(),
    };
    playlists = [...playlists.slice(0, index), updated, ...playlists.slice(index + 1)];
    emit();
    return "added";
  },

  /** Adds several tracks at once (used when importing an online playlist). */
  addTracks(playlistId: string, tracks: Track[]): number {
    const index = playlists.findIndex((p) => p.id === playlistId);
    if (index === -1) return 0;

    const current = playlists[index];
    const existing = current.tracks ?? [];
    const existingIds = new Set(existing.map((t) => t.id));
    // Dedupe against both the playlist *and* the incoming batch itself.
    const additions: Track[] = [];
    for (const track of tracks) {
      if (existingIds.has(track.id)) continue;
      existingIds.add(track.id);
      additions.push(normalizeTrack(track));
    }
    if (additions.length === 0) return 0;

    const updated: Playlist = {
      ...current,
      tracks: [...existing, ...additions],
      thumbnail: current.thumbnail || additions[0]?.thumbnail || "",
      updatedAt: Date.now(),
    };
    playlists = [...playlists.slice(0, index), updated, ...playlists.slice(index + 1)];
    emit();
    return additions.length;
  },

  removeTrack(playlistId: string, trackId: string): boolean {
    const index = playlists.findIndex((p) => p.id === playlistId);
    if (index === -1) return false;

    const current = playlists[index];
    const nextTracks = (current.tracks ?? []).filter((t) => t.id !== trackId);
    if (nextTracks.length === (current.tracks ?? []).length) return false;

    const updated: Playlist = {
      ...current,
      tracks: nextTracks,
      thumbnail: nextTracks[0]?.thumbnail || current.thumbnail,
      updatedAt: Date.now(),
    };
    playlists = [...playlists.slice(0, index), updated, ...playlists.slice(index + 1)];
    emit();
    return true;
  },

  /** Toggles a track in a playlist — this is what the "Save to playlist" rows call. */
  toggleTrack(playlistId: string, track: Track): "added" | "removed" | "missing-playlist" {
    if (playlistStore.contains(playlistId, track.id)) {
      playlistStore.removeTrack(playlistId, track.id);
      return "removed";
    }
    const result = playlistStore.addTrack(playlistId, track);
    return result === "missing-playlist" ? "missing-playlist" : "added";
  },

  contains(playlistId: string, trackId: string): boolean {
    const playlist = playlistStore.getById(playlistId);
    return Boolean(playlist?.tracks?.some((t) => t.id === trackId));
  },

  rename(playlistId: string, title: string): boolean {
    const index = playlists.findIndex((p) => p.id === playlistId);
    if (index === -1) return false;
    const trimmed = title.trim();
    if (!trimmed) return false;
    playlists = playlists.map((p, i) =>
      i === index ? { ...p, title: trimmed, updatedAt: Date.now() } : p
    );
    emit();
    return true;
  },

  delete(playlistId: string): boolean {
    const next = playlists.filter((p) => p.id !== playlistId);
    if (next.length === playlists.length) return false;
    playlists = next;
    emit();
    return true;
  },

  /** Removes every track from a playlist while keeping the playlist itself. */
  clear(playlistId: string): boolean {
    const index = playlists.findIndex((p) => p.id === playlistId);
    if (index === -1) return false;
    playlists = playlists.map((p, i) =>
      i === index ? { ...p, tracks: [], trackCount: 0, updatedAt: Date.now() } : p
    );
    emit();
    return true;
  },

  /** Total playtime of a playlist in seconds. */
  durationOf(playlistId: string): number {
    const playlist = playlistStore.getById(playlistId);
    return (playlist?.tracks ?? []).reduce((sum, t) => sum + (t.duration || 0), 0);
  },

  /** Re-reads the library from storage (used by the cross-tab `storage` listener). */
  reload() {
    playlists = loadFromStorage();
    emit();
  },
};

// ── React bindings ───────────────────────────────────────────────────────────

/** Subscribes a component to the persisted user playlist library. */
export function useUserPlaylists(): Playlist[] {
  return useSyncExternalStore(
    (listener) => playlistStore.subscribe(listener),
    () => playlistStore.getSnapshot(),
    () => []
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) playlistStore.reload();
  });
}

export function formatTotalDuration(totalSeconds: number): string {
  if (!totalSeconds) return "0 min";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} hr ${minutes} min`;
  return `${minutes} min`;
}
