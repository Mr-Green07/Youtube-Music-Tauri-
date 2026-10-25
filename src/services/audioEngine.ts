import { Track, RepeatMode } from "../types/music";

const FALLBACK_AUDIO_URL = "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3";
import { syncWindowsSmtc } from "./tauriBridge";

export interface StreamResolutionInfo {
  url: string;
  source: string;
  quality?: string;
  isFallback?: boolean;
}

/** Injected by the app layer so queue auto-advance can resolve real streams. */
export type StreamResolver = (
  track: Track,
  options?: { forceRefresh?: boolean }
) => Promise<StreamResolutionInfo>;

export type AudioStateListener = (state: {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  isBuffering: boolean;
  isResolving: boolean;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  /** Which resolver produced the current audio URL, e.g. `piped:host` or `yt-dlp`. */
  streamSource: string | null;
  /** True when the current track is playing from the offline demo sample. */
  isFallbackStream: boolean;
}) => void;

class AudioEngine {
  private audio: HTMLAudioElement;
  private currentTrack: Track | null = null;
  private queue: Track[] = [];
  private originalQueue: Track[] = [];
  private queueIndex = -1;
  private repeatMode: RepeatMode = "off";
  private isShuffled = false;
  private isBuffering = false;
  private isResolving = false;
  private listeners: Set<AudioStateListener> = new Set();
  private updateInterval: number | null = null;
  private streamResolver: StreamResolver | null = null;
  private streamSource: string | null = null;
  private isFallbackStream = false;
  /** Guards against a slow resolution overwriting a newer track selection. */
  private playRequestId = 0;
  /** Track id that already consumed its single automatic stream retry. */
  private retryTrackId: string | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.volume = 0.8;

    this.setupAudioListeners();
    this.setupMediaSession();
  }

  private setupAudioListeners() {
    this.audio.addEventListener("play", () => {
      this.notifyListeners();
      this.syncSmtc();
      this.startTimeTracker();
    });

    this.audio.addEventListener("pause", () => {
      this.notifyListeners();
      this.syncSmtc();
      this.stopTimeTracker();
    });

    this.audio.addEventListener("waiting", () => {
      this.isBuffering = true;
      this.notifyListeners();
    });

    this.audio.addEventListener("playing", () => {
      this.isBuffering = false;
      this.notifyListeners();
    });

    this.audio.addEventListener("ended", () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener("error", (e) => {
      console.error("Audio playback error:", e);
      this.isBuffering = false;
      this.notifyListeners();
      void this.recoverFromStreamError();
    });

    this.audio.addEventListener("timeupdate", () => {
      this.notifyListeners();
    });
  }

  /**
   * Signed googlevideo/instance URLs expire after a while. When a saved track
   * fails to load, re-resolve it once with a forced refresh instead of leaving
   * the player stuck on an error.
   */
  private async recoverFromStreamError() {
    const track = this.currentTrack;
    if (!track || !this.streamResolver || this.audio.src === FALLBACK_AUDIO_URL) return;
    if (this.retryTrackId === track.id) return;

    this.retryTrackId = track.id;
    this.isResolving = true;
    this.notifyListeners();

    try {
      const resolution = await this.streamResolver(track, { forceRefresh: true });
      if (this.currentTrack?.id !== track.id) return;
      this.streamSource = resolution.source;
      this.isFallbackStream = Boolean(resolution.isFallback);
      this.audio.src = resolution.url;
      await this.audio.play().catch(() => undefined);
    } catch (err) {
      console.warn("Stream recovery failed:", err);
    } finally {
      this.isResolving = false;
      this.notifyListeners();
    }
  }

  private startTimeTracker() {
    this.stopTimeTracker();
    this.updateInterval = window.setInterval(() => {
      this.notifyListeners();
    }, 250);
  }

  private stopTimeTracker() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private syncSmtc() {
    syncWindowsSmtc(this.currentTrack, !this.audio.paused, this.audio.currentTime);
  }

  private setupMediaSession() {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => this.resume());
    navigator.mediaSession.setActionHandler("pause", () => this.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => this.playPrevious());
    navigator.mediaSession.setActionHandler("nexttrack", () => this.playNext());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) {
        this.seek(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const offset = details.seekOffset || 10;
      this.seek(Math.max(this.audio.currentTime - offset, 0));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const offset = details.seekOffset || 10;
      this.seek(Math.min(this.audio.currentTime + offset, this.audio.duration || 0));
    });
  }

  public subscribe(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  public getState() {
    return {
      currentTrack: this.currentTrack,
      isPlaying: !this.audio.paused && !this.audio.ended,
      currentTime: this.audio.currentTime || 0,
      duration: this.audio.duration || this.currentTrack?.duration || 0,
      buffered: this.audio.buffered.length > 0 ? this.audio.buffered.end(this.audio.buffered.length - 1) : 0,
      isBuffering: this.isBuffering,
      isResolving: this.isResolving,
      volume: this.audio.volume,
      isMuted: this.audio.muted,
      repeatMode: this.repeatMode,
      isShuffled: this.isShuffled,
      streamSource: this.streamSource,
      isFallbackStream: this.isFallbackStream,
    };
  }

  /**
   * Registers the stream resolver used for every playback (including automatic
   * queue advance). Without it, skipping to the next track would not resolve a
   * live URL and would silently fall back to the demo sample.
   */
  public setStreamResolver(resolver: StreamResolver | null) {
    this.streamResolver = resolver;
  }

  public async playTrack(
    track: Track,
    queueContext?: Track[],
    streamUrl?: string,
    streamSource?: string
  ) {
    if (queueContext && queueContext.length > 0) {
      this.originalQueue = [...queueContext];
      this.queue = this.isShuffled ? this.shuffleArray([...queueContext]) : [...queueContext];
      this.queueIndex = this.queue.findIndex((t) => t.id === track.id);
      if (this.queueIndex === -1) {
        this.queue.unshift(track);
        this.queueIndex = 0;
      }
    } else if (this.queue.length === 0) {
      this.queue = [track];
      this.originalQueue = [track];
      this.queueIndex = 0;
    }

    const requestId = ++this.playRequestId;
    this.currentTrack = track;
    this.retryTrackId = null;
    this.streamSource = streamSource || null;
    this.isFallbackStream = false;

    let resolvedUrl = streamUrl || track.streamUrl;

    // Resolve online when we have no direct URL yet (stream URLs expire, so a
    // saved playlist track always needs a fresh resolution).
    if (!resolvedUrl && this.streamResolver) {
      this.isResolving = true;
      this.isBuffering = true;
      this.notifyListeners();
      try {
        const resolution = await this.streamResolver(track);
        // A newer track was selected while we were resolving — abandon this one.
        if (requestId !== this.playRequestId) return;
        resolvedUrl = resolution.url;
        this.streamSource = resolution.source;
        this.isFallbackStream = Boolean(resolution.isFallback);
      } catch (e) {
        console.warn("Stream resolution failed:", e);
      } finally {
        if (requestId === this.playRequestId) {
          this.isResolving = false;
        }
      }
      if (requestId !== this.playRequestId) return;
    }

    const finalUrl = resolvedUrl || FALLBACK_AUDIO_URL;
    if (!resolvedUrl) {
      this.isFallbackStream = true;
      this.streamSource = this.streamSource || "offline:sample";
    }

    this.audio.src = finalUrl;
    this.isBuffering = true;
    this.notifyListeners();

    try {
      await this.audio.play();
      this.syncSmtc();
    } catch (err) {
      console.warn("Autoplay blocked or playback deferred:", err);
    }
  }

  public togglePlayPause() {
    if (this.audio.paused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  public async resume() {
    if (!this.currentTrack && this.queue.length > 0) {
      await this.playTrack(this.queue[0]);
      return;
    }
    try {
      await this.audio.play();
    } catch (e) {
      console.error("Resume failed:", e);
    }
  }

  public pause() {
    this.audio.pause();
  }

  public seek(seconds: number) {
    if (Number.isFinite(seconds)) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || seconds));
      this.notifyListeners();
      this.syncSmtc();
    }
  }

  public setVolume(val: number) {
    const clamped = Math.max(0, Math.min(1, val));
    this.audio.volume = clamped;
    if (clamped > 0 && this.audio.muted) {
      this.audio.muted = false;
    }
    this.notifyListeners();
  }

  public toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.notifyListeners();
  }

  public toggleRepeat() {
    const modes: RepeatMode[] = ["off", "all", "one"];
    const nextIndex = (modes.indexOf(this.repeatMode) + 1) % modes.length;
    this.repeatMode = modes[nextIndex];
    this.notifyListeners();
  }

  public toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    if (this.isShuffled) {
      const current = this.currentTrack;
      const rest = this.originalQueue.filter((t) => t.id !== current?.id);
      this.queue = current ? [current, ...this.shuffleArray(rest)] : this.shuffleArray([...this.originalQueue]);
      this.queueIndex = 0;
    } else {
      this.queue = [...this.originalQueue];
      if (this.currentTrack) {
        this.queueIndex = this.queue.findIndex((t) => t.id === this.currentTrack?.id);
      }
    }
    this.notifyListeners();
  }

  public playNext() {
    if (this.queue.length === 0) return;

    if (this.queueIndex + 1 < this.queue.length) {
      this.queueIndex++;
      this.playTrack(this.queue[this.queueIndex]);
    } else if (this.repeatMode === "all") {
      this.queueIndex = 0;
      this.playTrack(this.queue[0]);
    }
  }

  public playPrevious() {
    if (this.queue.length === 0) return;

    // If more than 3 seconds in, restart track
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }

    if (this.queueIndex > 0) {
      this.queueIndex--;
      this.playTrack(this.queue[this.queueIndex]);
    } else {
      this.seek(0);
    }
  }

  private handleTrackEnded() {
    if (this.repeatMode === "one") {
      this.seek(0);
      this.audio.play();
    } else {
      this.playNext();
    }
  }

  private shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  public getQueue(): Track[] {
    return [...this.queue];
  }

  public removeFromQueue(index: number) {
    if (index >= 0 && index < this.queue.length) {
      this.queue.splice(index, 1);
      if (index < this.queueIndex) {
        this.queueIndex--;
      }
      this.notifyListeners();
    }
  }
}

export const audioEngine = new AudioEngine();
