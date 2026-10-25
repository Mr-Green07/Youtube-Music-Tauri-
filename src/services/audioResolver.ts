/**
 * Audio Resolver Service
 *
 * Handles audio stream resolution through multiple strategies:
 * 1. Rust backend command (resolve_audio) — cascading yt-dlp → Piped → Invidious
 * 2. Rust backend command (ytm_get_stream) — Innertube player endpoint
 * 3. Direct yt-dlp sidecar invocation via Tauri Shell plugin
 * 4. Piped / Invidious public instances over plain fetch (also works in browser)
 * 5. Spotify metadata enrichment for track discovery
 *
 * All YouTube Data API v3 usage is avoided; streams are extracted from
 * decentralized instances and the bundled yt-dlp binary.
 */

import { Track } from "../types/music";
import { isTauri } from "./tauriBridge";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AudioStreamResult {
  url: string;
  source: string;       // "yt-dlp" | "piped:instance" | "invidious:instance"
  format?: string;
  quality?: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  thumbnail: string;
  previewUrl?: string;
  externalUrl: string;
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[];
}

export type AudioQuality = "best" | "medium" | "worst";

// ── Lazy Tauri Imports ───────────────────────────────────────────────────────

async function getTauriCore() {
  if (!isTauri()) return null;
  try {
    return await import("@tauri-apps/api/core");
  } catch {
    return null;
  }
}

async function getShellPlugin() {
  if (!isTauri()) return null;
  try {
    return await import("@tauri-apps/plugin-shell");
  } catch {
    return null;
  }
}

// ── Rust Backend Resolver (Recommended Path) ─────────────────────────────────

/**
 * Resolves audio via the Rust backend command `resolve_audio`.
 * This is the primary resolver — it internally cascades through
 * yt-dlp → Piped → Invidious on the Rust side with proper error handling.
 */
export async function resolveAudioViaBackend(
  videoId: string,
  quality: AudioQuality = "best"
): Promise<AudioStreamResult | null> {
  const core = await getTauriCore();
  if (!core) return null;

  try {
    const result = await core.invoke<AudioStreamResult>("resolve_audio", {
      videoId,
      quality,
    });
    if (result?.url) {
      console.info(`[resolver] Backend resolved via ${result.source}: ${result.url.slice(0, 80)}...`);
      return result;
    }
  } catch (e) {
    console.warn("[resolver] Backend resolve_audio failed:", e);
  }

  return null;
}

// ── Direct yt-dlp Sidecar Execution (Frontend-driven) ────────────────────────

/**
 * Directly spawns the yt-dlp sidecar from the frontend via Tauri Shell plugin.
 * Use this when you want fine-grained control over the extraction process,
 * or when the Rust backend is busy/unavailable.
 *
 * Executes: yt-dlp -g -f ba --no-playlist --no-warnings <url>
 * Returns the raw CDN URL printed to stdout.
 */
export async function resolveAudioViaYtDlpSidecar(
  videoId: string,
  quality: AudioQuality = "best"
): Promise<AudioStreamResult | null> {
  const shell = await getShellPlugin();
  if (!shell) return null;

  const formatSelector = quality === "best" ? "ba" : quality === "medium" ? "ba[abr<=128]" : "wa";
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const command = shell.Command.sidecar("binaries/yt-dlp", [
      "-g",                        // Print URL to stdout (no download)
      "-f", formatSelector,        // Audio format selector
      "--no-playlist",             // Don't resolve playlists
      "--no-warnings",             // Suppress non-critical warnings
      "--no-check-certificates",   // Avoid TLS issues
      videoUrl,
    ]);

    const output = await command.execute();

    if (output.code !== 0) {
      console.warn(`[yt-dlp] Exited with code ${output.code}: ${output.stderr}`);
      return null;
    }

    const url = output.stdout.trim();
    if (!url || !url.startsWith("http")) {
      console.warn("[yt-dlp] Invalid output:", url?.slice(0, 100));
      return null;
    }

    console.info(`[resolver] yt-dlp sidecar resolved: ${url.slice(0, 80)}...`);
    return {
      url,
      source: "yt-dlp",
      format: formatSelector,
      quality,
    };
  } catch (e) {
    console.error("[resolver] yt-dlp sidecar error:", e);
    return null;
  }
}

/**
 * Spawns yt-dlp as a streaming process with real-time event callbacks.
 * Useful for progress tracking or extracting additional metadata.
 */
export async function spawnYtDlpWithEvents(
  videoUrl: string,
  args: string[],
  callbacks: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
    onClose?: (code: number) => void;
    onError?: (error: string) => void;
  }
): Promise<{ kill: () => void } | null> {
  const shell = await getShellPlugin();
  if (!shell) return null;

  try {
    const command = shell.Command.sidecar("binaries/yt-dlp", [...args, videoUrl]);

    command.on("close", (data) => {
      callbacks.onClose?.(data.code ?? -1);
    });

    command.on("error", (error) => {
      callbacks.onError?.(error);
    });

    command.stdout.on("data", (line) => {
      callbacks.onStdout?.(line);
    });

    command.stderr.on("data", (line) => {
      callbacks.onStderr?.(line);
    });

    const child = await command.spawn();

    return {
      kill: () => child.kill(),
    };
  } catch (e) {
    console.error("[resolver] yt-dlp spawn error:", e);
    callbacks.onError?.(String(e));
    return null;
  }
}

// ── Spotify Metadata Commands ────────────────────────────────────────────────

/**
 * Searches Spotify for track metadata via the secure Rust backend.
 * API keys never leave the Rust process.
 */
export async function searchSpotifyMetadata(
  query: string,
  limit: number = 10
): Promise<SpotifySearchResult | null> {
  const core = await getTauriCore();
  if (!core) return null;

  try {
    const result = await core.invoke<SpotifySearchResult>("spotify_search", {
      query,
      limit,
    });
    return result;
  } catch (e) {
    console.warn("[spotify] Search failed:", e);
    return null;
  }
}

/**
 * Fetches a single track's metadata from Spotify.
 */
export async function getSpotifyTrack(
  trackId: string
): Promise<SpotifyTrack | null> {
  const core = await getTauriCore();
  if (!core) return null;

  try {
    return await core.invoke<SpotifyTrack>("spotify_get_track", {
      trackId,
    });
  } catch (e) {
    console.warn("[spotify] Get track failed:", e);
    return null;
  }
}

// ── Innertube Player API (Tauri backend) ─────────────────────────────────────

/**
 * Asks the Rust backend to resolve via the YouTube Music Innertube `player`
 * endpoint (`ytm_get_stream`). The backend cascades into yt-dlp / Piped /
 * Invidious when Innertube refuses to hand out a URL.
 */
export async function resolveAudioViaInnertube(
  videoId: string
): Promise<AudioStreamResult | null> {
  const core = await getTauriCore();
  if (!core) return null;

  try {
    const url = await core.invoke<string>("ytm_get_stream", { videoId });
    if (url && url.startsWith("http")) {
      return { url, source: "innertube:music.youtube.com", format: "audio" };
    }
  } catch (e) {
    console.warn("[resolver] Innertube ytm_get_stream failed:", e);
  }

  return null;
}

// ── Public Instance Streaming (works in Tauri *and* plain browser) ───────────

/**
 * Resolves through Piped / Invidious public instances over plain `fetch`.
 * This is what makes online streaming work in the browser preview and it is
 * also the last network layer for the desktop build.
 */
export async function resolveAudioViaOnlineInstances(
  videoId: string
): Promise<AudioStreamResult | null> {
  try {
    const { resolveStreamOnline } = await import("./onlineStream");
    const resolved = await resolveStreamOnline(videoId);
    if (resolved?.url) {
      return {
        url: resolved.url,
        source: resolved.source,
        quality: resolved.bitrate ? `${Math.round(resolved.bitrate / 1000)}kbps` : undefined,
      };
    }
  } catch (e) {
    console.warn("[resolver] Public instance resolution failed:", e);
  }
  return null;
}

// ── Unified Resolution Pipeline ──────────────────────────────────────────────

export interface StreamResolution {
  url: string;
  source: string;
  quality?: string;
  /** True when the URL came from the bundled demo sample (offline mode). */
  isFallback?: boolean;
}

export const FALLBACK_STREAM_URL =
  "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3";

/** A YouTube video id is 11 url-safe characters. Demo/mock ids are not. */
export function isRealVideoId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

/**
 * Master resolver: attempts all available strategies in priority order
 * to resolve a Track to a playable audio stream URL, reporting which layer won.
 *
 * Resolution cascade:
 * 1. Track already carries a (still fresh) streamUrl          → direct
 * 2. Rust backend resolve_audio (yt-dlp → Piped → Invidious)  → desktop
 * 3. Rust backend ytm_get_stream (Innertube player)           → desktop
 * 4. Frontend yt-dlp sidecar direct call                      → desktop
 * 5. Piped / Invidious public instances (fetch)               → desktop + browser
 * 6. Royalty-free fallback sample                             → demo/offline
 */
export async function resolveTrackAudioDetailed(
  track: Track,
  quality: AudioQuality = "best",
  options: { forceRefresh?: boolean } = {}
): Promise<StreamResolution> {
  if (options.forceRefresh) {
    try {
      const { clearStreamCache } = await import("./onlineStream");
      clearStreamCache();
    } catch {
      // ignore — cache is a best-effort optimisation
    }
  }

  // Fast path: track already has a resolved stream
  if (track.streamUrl && !options.forceRefresh) {
    return { url: track.streamUrl, source: "cache:direct", isFallback: false };
  }

  // Demo/mock tracks have synthetic ids — nothing online can resolve them.
  if (!isRealVideoId(track.id)) {
    return { url: FALLBACK_STREAM_URL, source: "demo:sample", isFallback: true };
  }

  // Layer 1: Rust backend cascading resolver (yt-dlp → Piped → Invidious)
  const backendResult = await resolveAudioViaBackend(track.id, quality);
  if (backendResult?.url) {
    return { url: backendResult.url, source: backendResult.source, quality: backendResult.quality };
  }

  // Layer 2: Innertube player endpoint through the Rust backend
  const innertubeResult = await resolveAudioViaInnertube(track.id);
  if (innertubeResult?.url) {
    return { url: innertubeResult.url, source: innertubeResult.source, quality: innertubeResult.quality };
  }

  // Layer 3: Direct yt-dlp sidecar (frontend-driven fallback)
  const sidecarResult = await resolveAudioViaYtDlpSidecar(track.id, quality);
  if (sidecarResult?.url) {
    return { url: sidecarResult.url, source: sidecarResult.source, quality: sidecarResult.quality };
  }

  // Layer 4: Piped / Invidious public instances over fetch
  const onlineResult = await resolveAudioViaOnlineInstances(track.id);
  if (onlineResult?.url) {
    return { url: onlineResult.url, source: onlineResult.source, quality: onlineResult.quality };
  }

  // Layer 5: Fallback sample stream for offline/demo mode
  console.warn("[resolver] All resolvers exhausted, using fallback stream");
  return { url: FALLBACK_STREAM_URL, source: "offline:sample", isFallback: true };
}

/** String-only convenience wrapper kept for backwards compatibility. */
export async function resolveTrackAudio(
  track: Track,
  quality: AudioQuality = "best"
): Promise<string> {
  const resolved = await resolveTrackAudioDetailed(track, quality);
  return resolved.url;
}
