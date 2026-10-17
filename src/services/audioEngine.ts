import { Track, RepeatMode } from "../types/music";
import { syncWindowsSmtc } from "./tauriBridge";

export type AudioStateListener = (state: {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  isBuffering: boolean;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffled: boolean;
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
  private listeners: Set<AudioStateListener> = new Set();
  private updateInterval: number | null = null;

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
    });

    this.audio.addEventListener("timeupdate", () => {
      this.notifyListeners();
    });
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
      volume: this.audio.volume,
      isMuted: this.audio.muted,
      repeatMode: this.repeatMode,
      isShuffled: this.isShuffled,
    };
  }

  public async playTrack(track: Track, queueContext?: Track[], streamUrl?: string) {
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

    this.currentTrack = track;
    const resolvedStream = streamUrl || track.streamUrl || "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3";

    this.audio.src = resolvedStream;
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
