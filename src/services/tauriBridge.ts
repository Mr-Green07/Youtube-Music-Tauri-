import { Track, Playlist, SearchResults, UserSession } from "../types/music";
import { MOCK_TRACKS, MOCK_PLAYLISTS, MOCK_ALBUMS } from "./mockData";

// Helper to detect if running inside Tauri runtime
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
};

// Lazy load Tauri API functions to prevent exceptions in pure browser mode
async function getTauriCore() {
  if (isTauri()) {
    try {
      return await import("@tauri-apps/api/core");
    } catch (e) {
      console.warn("Could not import @tauri-apps/api/core:", e);
    }
  }
  return null;
}

async function getTauriWindow() {
  if (isTauri()) {
    try {
      return await import("@tauri-apps/api/window");
    } catch (e) {
      console.warn("Could not import @tauri-apps/api/window:", e);
    }
  }
  return null;
}

/**
 * Window Control actions (native borderless window support)
 */
export async function minimizeApp(): Promise<void> {
  const winModule = await getTauriWindow();
  if (winModule) {
    const current = winModule.getCurrentWindow();
    await current.minimize();
  }
}

export async function toggleMaximizeApp(): Promise<void> {
  const winModule = await getTauriWindow();
  if (winModule) {
    const current = winModule.getCurrentWindow();
    await current.toggleMaximize();
  }
}

export async function closeOrHideApp(): Promise<void> {
  const core = await getTauriCore();
  if (core) {
    try {
      await core.invoke("hide_to_tray");
      return;
    } catch {
      // Fallback to closing if tray is not registered
    }
  }
  const winModule = await getTauriWindow();
  if (winModule) {
    const current = winModule.getCurrentWindow();
    await current.close();
  }
}

/**
 * Authentication & Session Management
 */
export async function getAuthSession(): Promise<UserSession> {
  const core = await getTauriCore();
  if (core) {
    try {
      return await core.invoke<UserSession>("get_auth_session");
    } catch (e) {
      console.error("Failed to fetch auth session from Rust:", e);
    }
  }
  // Fallback to local session storage simulation
  const saved = localStorage.getItem("ytm_session");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return { isAuthenticated: false };
}

export async function openGoogleLogin(): Promise<UserSession> {
  const core = await getTauriCore();
  if (core) {
    try {
      return await core.invoke<UserSession>("open_google_login");
    } catch (e) {
      console.error("Error opening Google Auth WebView:", e);
    }
  }
  // Browser fallback simulation
  const dummySession: UserSession = {
    isAuthenticated: true,
    userEmail: "music.lover@gmail.com",
    displayName: "Audiophile",
    avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80",
    cookiesSavedAt: Date.now(),
  };
  localStorage.setItem("ytm_session", JSON.stringify(dummySession));
  return dummySession;
}

export async function logoutUser(): Promise<void> {
  const core = await getTauriCore();
  if (core) {
    try {
      await core.invoke("clear_auth_session");
    } catch (e) {
      console.error("Error clearing session:", e);
    }
  }
  localStorage.removeItem("ytm_session");
}

/**
 * YouTube Music Innertube API Bridge
 */
export async function fetchHomeFeed(): Promise<{
  quickPicks: Track[];
  recommendedPlaylists: Playlist[];
  trending: Track[];
}> {
  const core = await getTauriCore();
  if (core) {
    try {
      const data = await core.invoke<{
        quickPicks: Track[];
        recommendedPlaylists: Playlist[];
        trending: Track[];
      }>("ytm_get_home");
      if (data && data.quickPicks && data.quickPicks.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn("Backend ytm_get_home returned error, using fallback feed:", e);
    }
  }

  return {
    quickPicks: MOCK_TRACKS.slice(0, 4),
    recommendedPlaylists: MOCK_PLAYLISTS,
    trending: MOCK_TRACKS.slice(2, 6),
  };
}

export async function searchYouTubeMusic(query: string): Promise<SearchResults> {
  if (!query.trim()) {
    return { tracks: [], albums: [], playlists: [] };
  }

  const core = await getTauriCore();
  if (core) {
    try {
      const res = await core.invoke<SearchResults>("ytm_search", { query });
      if (res && (res.tracks.length > 0 || res.albums.length > 0)) {
        return res;
      }
    } catch (e) {
      console.warn("Backend ytm_search fallback to local filtering:", e);
    }
  }

  const q = query.toLowerCase();
  const matchedTracks = MOCK_TRACKS.filter(
    (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
  const matchedAlbums = MOCK_ALBUMS.filter(
    (a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
  );
  const matchedPlaylists = MOCK_PLAYLISTS.filter((p) => p.title.toLowerCase().includes(q));

  return {
    tracks: matchedTracks.length ? matchedTracks : MOCK_TRACKS.slice(0, 3),
    albums: matchedAlbums,
    playlists: matchedPlaylists,
  };
}

export async function fetchAudioStream(track: Track): Promise<string> {
  // If track already has a direct valid streamUrl, use it
  if (track.streamUrl) {
    return track.streamUrl;
  }

  // Primary path: Use the cascading audio resolver (yt-dlp → Piped → Invidious)
  try {
    const { resolveTrackAudio } = await import("./audioResolver");
    const resolvedUrl = await resolveTrackAudio(track);
    if (resolvedUrl) {
      return resolvedUrl;
    }
  } catch (e) {
    console.warn("Audio resolver unavailable, falling back to Innertube:", e);
  }

  // Secondary path: Direct Innertube player API
  const core = await getTauriCore();
  if (core) {
    try {
      const streamUrl = await core.invoke<string>("ytm_get_stream", { videoId: track.id });
      if (streamUrl) {
        return streamUrl;
      }
    } catch (e) {
      console.error("Backend ytm_get_stream failed:", e);
    }
  }

  // Fallback royalty-free stream for offline preview
  return "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3";
}

/**
 * Windows SMTC Integration Bridge
 */
export async function syncWindowsSmtc(
  track: Track | null,
  isPlaying: boolean,
  positionSeconds: number
): Promise<void> {
  if (!track) return;

  // 1. Rust backend SMTC update
  const core = await getTauriCore();
  if (core) {
    try {
      await core.invoke("smtc_update_playback", {
        title: track.title,
        artist: track.artist,
        album: track.album || "Single",
        thumbnail: track.thumbnail,
        durationSeconds: track.duration,
        positionSeconds: Math.floor(positionSeconds),
        isPlaying,
      });
    } catch (e) {
      console.debug("Native SMTC invoke note:", e);
    }
  }

  // 2. Browser MediaSession API (natively integrated with Windows SMTC in Chromium/WebView2)
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || "YouTube Music",
      artwork: [
        { src: track.thumbnail, sizes: "512x512", type: "image/jpeg" },
      ],
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }
}
