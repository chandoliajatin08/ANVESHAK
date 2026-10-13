/**
 * Web Audio API Alert Sound Synthesizer
 * Provides audible industrial telemetry feedback without external audio assets.
 */

class SoundEffectsService {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
    this.lastPlayed = 0;
  }

  init() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
  }

  playWarningBeep() {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastPlayed < 1000) return; // rate limit
    this.lastPlayed = now;
    this.init();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, this.audioCtx.currentTime); // E5
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.3);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  playCriticalAlarm() {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastPlayed < 500) return;
    this.lastPlayed = now;
    this.init();
    if (!this.audioCtx) return;

    try {
      // High-sound piezo buzzer synthesizer matching ESP32 hardware buzzer (2000 Hz)
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'square'; // Piercing square wave like physical buzzer
      osc.frequency.setValueAtTime(2000, t); // 2000 Hz high frequency buzzer
      osc.frequency.setValueAtTime(2200, t + 0.1);
      osc.frequency.setValueAtTime(2000, t + 0.2);

      // High volume output
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  playSosAlarm() {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(1046.5, t); // C6 siren
      osc.frequency.linearRampToValueAtTime(1318.51, t + 0.25);
      osc.frequency.linearRampToValueAtTime(1046.5, t + 0.5);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    } catch {
      // Audio policy
    }
  }
}

export const soundEffects = new SoundEffectsService();
