import { HomeFeed, Playlist, SearchResults, Track, UserSession } from "../types/music";
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
export async function fetchHomeFeed(): Promise<HomeFeed> {
  // 1. Desktop: YouTube Music Innertube home feed (real online charts / mixes)
  const core = await getTauriCore();
  if (core) {
    try {
      const data = await core.invoke<HomeFeed>("ytm_get_home");
      if (data?.quickPicks?.length) {
        return data;
      }
    } catch (e) {
      console.warn("Backend ytm_get_home returned error, using fallback feed:", e);
    }
  }

  // 2. Browser (or desktop failure): live search over public instances
  try {
    const { pipedSearch } = await import("./onlineStream");
    const online = await pipedSearch("trending music");
    if (online && online.tracks.length > 0) {
      return {
        quickPicks: online.tracks.slice(0, 6),
        recommendedPlaylists: online.playlists.length ? online.playlists : MOCK_PLAYLISTS,
        trending: online.tracks.slice(6, 14).length ? online.tracks.slice(6, 14) : online.tracks,
      };
    }
  } catch (e) {
    console.warn("Online home feed unavailable:", e);
  }

  // 3. Fully offline demo content
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

  // 1. Desktop: YouTube Music Innertube search (real songs, albums, playlists)
  const core = await getTauriCore();
  if (core) {
    try {
      const res = await core.invoke<SearchResults>("ytm_search", { query });
      if (res && (res.tracks.length > 0 || res.albums.length > 0 || res.playlists.length > 0)) {
        return res;
      }
    } catch (e) {
      console.warn("Backend ytm_search failed, trying online instances:", e);
    }
  }

  // 2. Public instances (Piped) — works in the browser preview as well
  try {
    const { pipedSearch } = await import("./onlineStream");
    const online = await pipedSearch(query);
    if (online && (online.tracks.length > 0 || online.playlists.length > 0)) {
      return {
        tracks: online.tracks,
        albums: [],
        playlists: online.playlists,
      };
    }
  } catch (e) {
    console.warn("Online search unavailable:", e);
  }

  // 3. Local demo catalogue
  const q = query.toLowerCase();
  const matchedTracks = MOCK_TRACKS.filter(
    (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
  const matchedAlbums = MOCK_ALBUMS.filter(
    (a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
  );
  const matchedPlaylists = MOCK_PLAYLISTS.filter((p) => p.title.toLowerCase().includes(q));

  return {
    tracks: matchedTracks,
    albums: matchedAlbums,
    playlists: matchedPlaylists,
  };
}

/**
 * Loads the track list of an online playlist / album / mix.
 *
 * The result is used when the user opens a YouTube Music playlist card from
 * search or from the home feed — without this the card would have no tracks.
 */
export async function fetchOnlinePlaylist(
  playlist: Playlist
): Promise<{ tracks: Track[]; title?: string; author?: string; thumbnail?: string }> {
  if (playlist.tracks && playlist.tracks.length > 0) {
    return { tracks: playlist.tracks };
  }

  const browseId = playlist.browseId || playlist.id;

  // 1. Desktop backend (Innertube browse)
  const core = await getTauriCore();
  if (core && browseId) {
    try {
      const res = await core.invoke<{
        tracks: Track[];
        title?: string;
        author?: string;
        thumbnail?: string;
      }>("ytm_get_playlist", { browseId });
      if (res?.tracks?.length) {
        return res;
      }
    } catch (e) {
      console.warn("Backend ytm_get_playlist failed, trying public instances:", e);
    }
  }

  // 2. Public instances
  try {
    const { fetchOnlinePlaylistTracks } = await import("./onlineStream");
    const res = await fetchOnlinePlaylistTracks(browseId);
    if (res?.tracks?.length) {
      return res;
    }
  } catch (e) {
    console.warn("Online playlist fetch unavailable:", e);
  }

  return { tracks: [] };
}

/**
 * Resolves the best playable stream for a track together with the resolver that
 * produced it (surfaced in the player bar as the live streaming source).
 */
export async function fetchAudioStream(
  track: Track,
  options: { forceRefresh?: boolean } = {}
): Promise<{
  url: string;
  source: string;
  quality?: string;
  isFallback?: boolean;
}> {
  try {
    const { resolveTrackAudioDetailed } = await import("./audioResolver");
    const resolved = await resolveTrackAudioDetailed(track, "best", options);
    if (resolved?.url) {
      return resolved;
    }
  } catch (e) {
    console.warn("Audio resolver unavailable, falling back to Innertube:", e);
  }

  // Direct Innertube player API as a last desktop resort
  const core = await getTauriCore();
  if (core) {
    try {
      const streamUrl = await core.invoke<string>("ytm_get_stream", { videoId: track.id });
      if (streamUrl) {
        return { url: streamUrl, source: "innertube:music.youtube.com" };
      }
    } catch (e) {
      console.error("Backend ytm_get_stream failed:", e);
    }
  }

  // Fallback royalty-free stream for offline preview
  return {
    url: "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3",
    source: "offline:sample",
    isFallback: true,
  };
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
