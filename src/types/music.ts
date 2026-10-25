export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  durationFormatted?: string;
  thumbnail: string;
  streamUrl?: string;
  isLiked?: boolean;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  thumbnail: string;
  trackCount: number;
  author?: string;
  tracks?: Track[];
  /** YouTube Music browse id (e.g. `VLPL...`, `MPRE...`). Present on online playlists. */
  browseId?: string;
  /** True when the playlist lives in the local user library (created via "Save to playlist"). */
  isUserPlaylist?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  year?: string;
  thumbnail: string;
  tracks: Track[];
}

export interface Artist {
  id: string;
  name: string;
  thumbnail: string;
  subscribers?: string;
}

export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  playlists: Playlist[];
}

export interface HomeFeed {
  quickPicks: Track[];
  recommendedPlaylists: Playlist[];
  trending: Track[];
}

export interface UserSession {
  isAuthenticated: boolean;
  userEmail?: string;
  displayName?: string;
  avatarUrl?: string;
  cookiesSavedAt?: number;
}

export type RepeatMode = "off" | "all" | "one";
export type AudioQuality = "high" | "normal" | "saver";

export interface PlayerSettings {
  quality: AudioQuality;
  volume: number;
  normalizeVolume: boolean;
  minimizeToTray: boolean;
  enableHardwareMediaKeys: boolean;
}

/** Where an audio stream came from — surfaced in the UI so users can see live streaming at work. */
export interface StreamSourceInfo {
  source: string;
  resolvedAt: number;
  url: string;
}

export type ToastKind = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}
