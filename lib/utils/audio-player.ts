/**
 * Audio Player - Audio player interface
 *
 * Handles audio playback, pause, stop, and other operations
 * Loads pre-generated TTS audio files from IndexedDB
 *
 */

import { db } from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';
import { useSettingsStore } from '@/lib/store/settings';

const log = createLogger('AudioPlayer');

interface BrowserTTSFallback {
  text: string;
  voice?: string;
  speed?: number;
}

/**
 * Audio player implementation
 */
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private onEndedCallback: (() => void) | null = null;
  private muted: boolean = false;
  private volume: number = 1;
  private playbackRate: number = 1;

  private hasBrowserSpeechActivity(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!window.speechSynthesis &&
      (window.speechSynthesis.speaking ||
        window.speechSynthesis.pending ||
        window.speechSynthesis.paused)
    );
  }

  /**
   * Play audio (from IndexedDB pre-generated cache)
   * @param audioId Audio ID
   * @returns true if audio started playing, false if no audio (TTS disabled or not generated)
   */
  public async play(audioId: string, fallback?: BrowserTTSFallback): Promise<boolean> {
    try {
      // Get audio from database
      const audioRecord = await db.audioFiles.get(audioId);

      if (!audioRecord) {
        return this.playBrowserTTSFallback(fallback);
      }

      // Stop current playback
      this.stop();

      // Create audio element
      this.audio = new Audio();

      // Set audio source
      const blobUrl = URL.createObjectURL(audioRecord.blob);
      this.audio.src = blobUrl;
      if (this.muted) this.audio.volume = 0;
      else this.audio.volume = this.volume;

      // Apply playback rate
      this.audio.defaultPlaybackRate = this.playbackRate;
      this.audio.playbackRate = this.playbackRate;

      // Set ended callback
      this.audio.addEventListener('ended', () => {
        URL.revokeObjectURL(blobUrl);
        this.onEndedCallback?.();
      });

      // Play
      await this.audio.play();
      // Re-apply after play() — some browsers reset during load
      this.audio.playbackRate = this.playbackRate;
      return true;
    } catch (error) {
      log.error('Failed to play audio:', error);
      throw error;
    }
  }

  private playBrowserTTSFallback(fallback?: BrowserTTSFallback): boolean {
    const { ttsProviderId, ttsVoice, ttsSpeed } = useSettingsStore.getState();

    if (ttsProviderId !== 'browser-native-tts' || !fallback?.text) {
      return false;
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return false;
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(fallback.text);
    utterance.lang = 'zh-CN';
    utterance.rate = fallback.speed ?? ttsSpeed ?? this.playbackRate;
    utterance.volume = this.muted ? 0 : this.volume;

    const voices = window.speechSynthesis.getVoices();
    const desiredVoice = fallback.voice || ttsVoice;
    const matchedVoice = voices.find(
      (voice) =>
        voice.voiceURI === desiredVoice ||
        voice.name === desiredVoice ||
        voice.lang === desiredVoice,
    );
    if (matchedVoice) {
      utterance.voice = matchedVoice;
      utterance.lang = matchedVoice.lang || utterance.lang;
    }

    utterance.onend = () => {
      this.utterance = null;
      this.onEndedCallback?.();
    };
    utterance.onerror = (event) => {
      this.utterance = null;
      log.error('Browser TTS playback failed:', event.error);
      this.onEndedCallback?.();
    };

    this.utterance = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
    if (
      this.utterance &&
      typeof window !== 'undefined' &&
      window.speechSynthesis &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending)
    ) {
      window.speechSynthesis.pause();
    }
  }

  /**
   * Stop playback
   */
  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    if (this.utterance && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.utterance = null;
    }
    // Note: onEndedCallback intentionally NOT cleared here because play()
    // calls stop() internally — clearing would break the callback chain.
    // Stale callbacks are harmless: engine mode check prevents processNext().
  }

  /**
   * Resume playback
   */
  public resume(): void {
    if (this.audio?.paused) {
      this.audio.playbackRate = this.playbackRate;
      this.audio.play().catch((error) => {
        log.error('Failed to resume audio:', error);
      });
    }
    if (this.utterance && typeof window !== 'undefined' && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }

  /**
   * Get current playback status (actively playing, not paused)
   */
  public isPlaying(): boolean {
    return (
      (this.audio !== null && !this.audio.paused) ||
      (this.utterance !== null && this.hasBrowserSpeechActivity() && !window.speechSynthesis.paused)
    );
  }

  /**
   * Whether there is active audio (playing or paused, but not ended)
   * Used to decide whether to resume playback or skip to the next line
   */
  public hasActiveAudio(): boolean {
    return this.audio !== null || (this.utterance !== null && this.hasBrowserSpeechActivity());
  }

  /**
   * Get current playback time (milliseconds)
   */
  public getCurrentTime(): number {
    return this.audio ? this.audio.currentTime * 1000 : 0;
  }

  /**
   * Get audio duration (milliseconds)
   */
  public getDuration(): number {
    return this.audio && !isNaN(this.audio.duration) ? this.audio.duration * 1000 : 0;
  }

  /**
   * Set playback ended callback
   */
  public onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /**
   * Set mute state (takes effect immediately on currently playing audio)
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.audio) {
      this.audio.volume = muted ? 0 : this.volume;
    }
  }

  /**
   * Set volume (0-1)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio && !this.muted) {
      this.audio.volume = this.volume;
    }
  }

  /**
   * Set playback speed (takes effect immediately on currently playing audio)
   */
  public setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.5, Math.min(2, rate));
    if (this.audio) {
      this.audio.playbackRate = this.playbackRate;
    }
  }

  /**
   * Destroy the player
   */
  public destroy(): void {
    this.stop();
    this.onEndedCallback = null;
  }
}

/**
 * Create an audio player instance
 */
export function createAudioPlayer(): AudioPlayer {
  return new AudioPlayer();
}
