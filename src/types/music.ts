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
