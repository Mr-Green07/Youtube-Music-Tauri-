/**
 * Online Streaming Client (Piped + Invidious public APIs).
 *
 * This module is the network layer that keeps streaming alive even when the
 * bundled Rust resolver/yt-dlp path is unavailable — for example when running
 * the UI in a plain browser (`pnpm dev`) or when the desktop sidecar binary is
 * missing on the current platform.
 *
 * Public Piped/Invidious instances expose permissive CORS headers, so the same
 * code works from the Tauri WebView *and* from a regular browser tab.
 *
 * Everything here returns plain normalized data (`Track` / `Playlist`) so the
 * rest of the app never talks to an instance API directly.
 */

import { Playlist, Track } from "../types/music";

// ── Instance pools ───────────────────────────────────────────────────────────

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.reallyaweso.me",
];

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
];

const REQUEST_TIMEOUT_MS = 9000;

// ── Tiny cache so repeat plays don't hammer public instances ─────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const hit = memoryCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearStreamCache() {
  memoryCache.clear();
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Normalizers ──────────────────────────────────────────────────────────────

interface PipedStreamItem {
  url?: string;
  type?: string;
  title?: string;
  name?: string;
  uploaderName?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  id?: string;
}

interface PipedStreamsResponse {
  title?: string;
  uploader?: string;
  uploaderUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
  audioStreams?: Array<{
    url?: string;
    bitrate?: number;
    mimeType?: string;
    codec?: string;
  }>;
}

function youtubeIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = /(?:v=|\/watch\?v=|youtu\.be\/|\/shorts\/|\/vi\/)([A-Za-z0-9_-]{6,})/.exec(url);
  return match ? match[1] : null;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function pipedItemToTrack(item: PipedStreamItem): Track | null {
  const id = item.id || youtubeIdFromUrl(item.url);
  if (!id) return null;
  const duration = typeof item.duration === "number" && item.duration > 0 ? item.duration : 0;
  return {
    id,
    title: item.title || item.name || "Unknown title",
    artist: item.uploaderName || item.uploader || "Unknown artist",
    duration,
    durationFormatted: duration ? formatDuration(duration) : undefined,
    thumbnail:
      item.thumbnail ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    isLiked: false,
  };
}

function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const track of tracks) {
    if (!track.id || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

// ── Search ───────────────────────────────────────────────────────────────────

interface PipedSearchResponse {
  items?: Array<PipedStreamItem & { type?: string }>;
}

/**
 * Searches YouTube Music through Piped instances.
 * Returns `null` when every instance is unreachable so callers can fall back.
 */
export async function pipedSearch(query: string): Promise<{
  tracks: Track[];
  playlists: Playlist[];
} | null> {
  const trimmed = query.trim();
  if (!trimmed) return { tracks: [], playlists: [] };

  const cacheKey = `search:${trimmed.toLowerCase()}`;
  const cached = cacheGet<{ tracks: Track[]; playlists: Playlist[] }>(cacheKey);
  if (cached) return cached;

  for (const instance of PIPED_INSTANCES) {
    const base = `${instance}/search?q=${encodeURIComponent(trimmed)}&filter=`;
    // Songs + playlists in parallel on the same instance.
    const [songs, playlistHits] = await Promise.all([
      fetchJson<PipedSearchResponse>(`${base}music_songs`),
      fetchJson<PipedSearchResponse>(`${base}music_playlists`),
    ]);

    if (!songs?.items?.length) continue;

    const tracks = dedupeTracks(
      songs.items
        .filter((item) => item.type !== "channel" && item.type !== "playlist")
        .map(pipedItemToTrack)
        .filter((t): t is Track => Boolean(t))
    );

    if (tracks.length === 0) continue;

    const playlists: Playlist[] = (playlistHits?.items || [])
      .filter((item) => item.type === "playlist" || Boolean(item.url?.includes("list=")))
      .map((item, index) => {
        const listId = new URLSearchParams((item.url || "").split("?")[1] || "").get("list");
        const thumbId = youtubeIdFromUrl(item.thumbnail) || youtubeIdFromUrl(item.url);
        return {
          id: `piped_pl_${listId || index}`,
          title: item.name || item.title || "Online playlist",
          thumbnail:
            item.thumbnail ||
            (thumbId ? `https://i.ytimg.com/vi/${thumbId}/hqdefault.jpg` : ""),
          trackCount: 0,
          author: item.uploaderName || "YouTube Music",
          browseId: listId ? `VL${listId}` : undefined,
          tracks: [],
        } as Playlist;
      });

    const result = { tracks, playlists };
    cacheSet(cacheKey, result, 5 * 60 * 1000);
    return result;
  }

  return null;
}

// ── Audio stream resolution ──────────────────────────────────────────────────

interface ResolvedStream {
  url: string;
  source: string;
  bitrate: number;
}

async function resolveViaPiped(videoId: string): Promise<ResolvedStream | null> {
  const cacheKey = `stream:${videoId}`;
  const cached = cacheGet<ResolvedStream>(cacheKey);
  if (cached) return cached;

  for (const instance of PIPED_INSTANCES) {
    const data = await fetchJson<PipedStreamsResponse>(`${instance}/streams/${videoId}`);
    const streams = data?.audioStreams;
    if (!streams?.length) continue;

    const best = streams
      .filter((s) => Boolean(s.url))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

    if (!best?.url) continue;

    const resolved: ResolvedStream = {
      url: best.url,
      source: `piped:${new URL(instance).host}`,
      bitrate: best.bitrate || 0,
    };
    // Piped stream URLs are backed by a googlevideo URL that expires — cache briefly.
    cacheSet(cacheKey, resolved, 20 * 60 * 1000);
    return resolved;
  }

  return null;
}

interface InvidiousVideoResponse {
  adaptiveFormats?: Array<{ url?: string; type?: string; bitrate?: string | number }>;
  formatStreams?: Array<{ url?: string; type?: string }>;
}

async function resolveViaInvidious(videoId: string): Promise<ResolvedStream | null> {
  const cacheKey = `stream:inv:${videoId}`;
  const cached = cacheGet<ResolvedStream>(cacheKey);
  if (cached) return cached;

  for (const instance of INVIDIOUS_INSTANCES) {
    const data = await fetchJson<InvidiousVideoResponse>(
      `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats`
    );
    const audio = (data?.adaptiveFormats || [])
      .filter((f) => (f.type || "").startsWith("audio/") && f.url)
      .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0];

    if (!audio?.url) continue;

    const resolved: ResolvedStream = {
      url: audio.url,
      source: `invidious:${new URL(instance).host}`,
      bitrate: Number(audio.bitrate || 0),
    };
    cacheSet(cacheKey, resolved, 20 * 60 * 1000);
    return resolved;
  }

  return null;
}

/**
 * Resolves a YouTube video id to a playable audio stream URL through public
 * instances. Used as the browser-side (and last-resort desktop) streaming layer.
 */
export async function resolveStreamOnline(videoId: string): Promise<ResolvedStream | null> {
  if (!videoId || videoId.startsWith("yt_") || videoId.startsWith("piped_")) return null;

  const viaPiped = await resolveViaPiped(videoId);
  if (viaPiped) return viaPiped;

  return resolveViaInvidious(videoId);
}

// ── Online playlists / mixes ─────────────────────────────────────────────────

interface PipedPlaylistResponse {
  name?: string;
  thumbnailUrl?: string;
  uploader?: string;
  relatedStreams?: PipedStreamItem[];
}

/**
 * Loads the tracks of an online playlist. Accepts either a YouTube Music browse
 * id (`VLPL...`, `MPRE...`) or a raw playlist id (`PL...`).
 */
export async function fetchOnlinePlaylistTracks(
  browseId: string
): Promise<{ title?: string; author?: string; thumbnail?: string; tracks: Track[] } | null> {
  const playlistId = browseId.replace(/^VL/, "");
  if (!playlistId) return null;

  const cacheKey = `playlist:${playlistId}`;
  const cached = cacheGet<{ title?: string; author?: string; thumbnail?: string; tracks: Track[] }>(
    cacheKey
  );
  if (cached) return cached;

  for (const instance of PIPED_INSTANCES) {
    const data = await fetchJson<PipedPlaylistResponse>(`${instance}/playlists/${playlistId}`);
    if (!data?.relatedStreams?.length) continue;

    const tracks = dedupeTracks(
      data.relatedStreams
        .map(pipedItemToTrack)
        .filter((t): t is Track => Boolean(t))
    );
    if (tracks.length === 0) continue;

    const result = {
      title: data.name,
      author: data.uploader,
      thumbnail: data.thumbnailUrl,
      tracks,
    };
    cacheSet(cacheKey, result, 10 * 60 * 1000);
    return result;
  }

  return null;
}

/** Cheap reachability probe used by the UI to show online/offline streaming state. */
export async function isOnlineStreamingAvailable(): Promise<boolean> {
  for (const instance of PIPED_INSTANCES.slice(0, 2)) {
    const data = await fetchJson<unknown>(`${instance}/trending?region=US`);
    if (data) return true;
  }
  return Boolean(typeof navigator !== "undefined" && navigator.onLine);
}
