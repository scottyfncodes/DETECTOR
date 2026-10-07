/**
 * All sound is synthesised at runtime — no audio files, nothing to download,
 * and the detector tone can be driven continuously by signal strength.
 *
 * iOS requires an AudioContext to be created/resumed inside a user gesture, so
 * nothing is built until unlock() is called from a tap.
 */
import type { ToneClass } from '@/systems/detection';
import { clamp01 } from '@/core/rng';

export type AmbienceKind = 'park' | 'railway' | 'mine' | 'chamber' | 'ruins' | null;

const TONE_FREQ: Record<ToneClass, number> = {
  iron: 196,
  mid: 466,
  high: 784,
  odd: 587,
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceNodes: AudioNode[] = [];
  private ambienceKind: AmbienceKind = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private dangerNodes: { gain: GainNode; stop: () => void } | null = null;
  private lastGrain = 0;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** The live context and master bus, for the music layer (engine/music.ts). */
  graph(): { ctx: AudioContext; master: GainNode; noise: () => AudioBufferSourceNode | null; enabled: boolean } | null {
    if (!this.ctx || !this.master) return null;
    return { ctx: this.ctx, master: this.master, noise: () => this.noiseSource(), enabled: this.enabled };
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.9 : 0;
  }

  /** Must be called from inside a real user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.value = 0;
      this.ambienceGain.connect(this.master);
      this.noiseBuffer = this.makeNoise(2.5);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Re-resumes an already-unlocked context — e.g. after iOS suspends it on backgrounding. */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // Brown-ish noise reads as earth rather than static.
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    return src;
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  // ── detector ─────────────────────────────────────────────────────────────
  /** A single detector pip. Pitch by tone class, brightness by strength. */
  beep(tone: ToneClass, strength: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now();
    const s = clamp01(strength);
    const base = TONE_FREQ[tone];
    const dur = 0.045 + 0.07 * s;

    const osc = this.ctx.createOscillator();
    osc.type = tone === 'iron' ? 'sawtooth' : tone === 'high' ? 'triangle' : 'square';
    osc.frequency.setValueAtTime(base * (0.97 + s * 0.06), t);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600 + s * 4200, t);
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    const peak = 0.05 + 0.2 * s;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    if (tone === 'odd') {
      // Unknown materials get a detuned twin — unsettling on purpose.
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(base * 1.49, t);
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
      osc2.connect(g2).connect(this.master);
      osc2.start(t);
      osc2.stop(t + dur * 1.7);
    }
  }

  /** Confirmation chirp when the player locks a target in pinpoint mode. */
  confirm(): void {
    this.tone(660, 0.09, 0.16, 'triangle');
    this.tone(990, 0.12, 0.1, 'triangle', 0.06);
  }

  // ── excavation ───────────────────────────────────────────────────────────
  dig(intensity: number): void {
    this.grain(intensity, 220, 900, 0.16);
  }

  brush(intensity: number): void {
    this.grain(intensity * 0.5, 1800, 5200, 0.1, true);
  }

  /** Tool touching the artifact — soft, but you notice it. */
  contact(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, t);
    osc.frequency.exponentialRampToValueAtTime(920, t + 0.06);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** A real mistake: metal on artifact. */
  strike(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now();
    const src = this.noiseSource();
    if (src) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 2.4;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + 0.16);
    }
    this.tone(320, 0.22, 0.18, 'square');
    this.tone(214, 0.3, 0.12, 'sine', 0.01);
  }

  /** The artifact comes clear of the dirt. */
  reveal(big = false): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now();
    const notes = big ? [196, 294, 392, 587, 784] : [392, 587, 784];
    notes.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = this.ctx!.createGain();
      const start = t + i * (big ? 0.1 : 0.07);
      const dur = big ? 2.4 : 1.3;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(big ? 0.13 : 0.1, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(this.master!);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    });
  }

  /** Two-note motif reserved for clues. The player learns to want this sound. */
  clue(): void {
    this.tone(523, 0.5, 0.1, 'sine');
    this.tone(784, 1.1, 0.09, 'sine', 0.22);
    this.tone(1046, 1.6, 0.05, 'triangle', 0.44);
  }

  mechanism(): void {
    this.tone(140, 0.18, 0.22, 'square');
    this.grain(0.8, 120, 600, 0.3);
  }

  /** Stone moving against stone, slowly, for a couple of seconds. Then it stops. */
  grind(seconds = 2.4): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now();
    const src = this.noiseSource();
    if (!src) return;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.linearRampToValueAtTime(230, t + seconds);
    bp.Q.value = 2.6;
    const trem = this.ctx.createOscillator();
    trem.frequency.value = 7.5;
    const tremGain = this.ctx.createGain();
    tremGain.gain.value = 0.12;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.25);
    g.gain.setValueAtTime(0.34, t + seconds - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    trem.connect(tremGain).connect(g.gain);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    trem.start(t);
    src.stop(t + seconds + 0.05);
    trem.stop(t + seconds + 0.05);
    // The thud when it seats.
    this.tone(52, 0.7, 0.3, 'sine', seconds - 0.05);
    this.grain(0.9, 80, 400, 0.35);
  }

  /** The held breath before a discovery card: a low swell that never resolves. */
  swell(seconds = 1.2): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now();
    for (const [f, type, peak] of [
      [65.4, 'sine', 0.12],
      [98, 'triangle', 0.05],
    ] as [number, OscillatorType, number][]) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + seconds * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.6);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + seconds + 0.7);
    }
  }

  /** A quiet pencil-on-paper tick for a landmark note. Not a find; a remark. */
  note(): void {
    this.grain(0.25, 1800, 4200, 0.07, true);
    this.tone(1320, 0.09, 0.03, 'triangle', 0.02);
  }

  /** Low rumble bed for collapse / escape sequences. */
  danger(on: boolean): void {
    if (!this.ctx || !this.master) return;
    if (on && !this.dangerNodes) {
      const src = this.noiseSource();
      if (!src) return;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 110;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.55, this.now() + 0.8);
      src.connect(lp).connect(gain).connect(this.master);
      src.start();
      this.dangerNodes = {
        gain,
        stop: () => {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
        },
      };
    } else if (!on && this.dangerNodes) {
      const { gain, stop } = this.dangerNodes;
      gain.gain.linearRampToValueAtTime(0, this.now() + 0.5);
      setTimeout(stop, 700);
      this.dangerNodes = null;
    }
  }

  // ── ambience ─────────────────────────────────────────────────────────────
  ambience(kind: AmbienceKind): void {
    if (!this.ctx || !this.ambienceGain) return;
    if (this.ambienceKind === kind) return;
    this.stopAmbience();
    this.ambienceKind = kind;
    if (!kind) return;

    const src = this.noiseSource();
    if (!src) return;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'park' ? 520 : kind === 'ruins' ? 440 : kind === 'railway' ? 360 : 220;

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = kind === 'park' || kind === 'ruins' ? 0.13 : 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = kind === 'park' || kind === 'ruins' ? 160 : 80;
    lfo.connect(lfoGain).connect(lp.frequency);

    src.connect(lp).connect(this.ambienceGain);
    src.start();
    lfo.start();
    this.ambienceNodes = [src, lfo, lp, lfoGain];

    const level = kind === 'park' ? 0.1 : kind === 'ruins' ? 0.1 : kind === 'railway' ? 0.09 : 0.12;
    this.ambienceGain.gain.cancelScheduledValues(this.now());
    this.ambienceGain.gain.setValueAtTime(this.ambienceGain.gain.value, this.now());
    this.ambienceGain.gain.linearRampToValueAtTime(level, this.now() + 1.5);

    if (kind === 'mine' || kind === 'chamber') {
      // A slow, tonal drone underneath — the ground stops feeling neutral.
      const drone = this.ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = kind === 'chamber' ? 47 : 58;
      const dg = this.ctx.createGain();
      dg.gain.value = 0.5;
      drone.connect(dg).connect(this.ambienceGain);
      drone.start();
      this.ambienceNodes.push(drone, dg);
    } else if (kind === 'ruins') {
      // Open air, not underground: a thin high tone instead of a dread drone.
      const drone = this.ctx.createOscillator();
      drone.type = 'triangle';
      drone.frequency.value = 220;
      const dg = this.ctx.createGain();
      dg.gain.value = 0.16;
      drone.connect(dg).connect(this.ambienceGain);
      drone.start();
      this.ambienceNodes.push(drone, dg);
    }
  }

  private stopAmbience(): void {
    if (!this.ambienceGain) return;
    this.ambienceGain.gain.cancelScheduledValues(this.now());
    this.ambienceGain.gain.setValueAtTime(0, this.now());
    for (const node of this.ambienceNodes) {
      const source = node as AudioBufferSourceNode & OscillatorNode;
      if (typeof source.stop === 'function') {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }
      node.disconnect();
    }
    this.ambienceNodes = [];
    this.ambienceKind = null;
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  ui(kind: 'tap' | 'back' | 'open' | 'deny'): void {
    switch (kind) {
      case 'tap':
        this.tone(880, 0.05, 0.05, 'triangle');
        break;
      case 'back':
        this.tone(440, 0.06, 0.045, 'triangle');
        break;
      case 'open':
        this.tone(523, 0.09, 0.05, 'sine');
        this.tone(698, 0.12, 0.04, 'sine', 0.05);
        break;
      case 'deny':
        this.tone(180, 0.12, 0.08, 'square');
        break;
    }
  }

  // ── primitives ───────────────────────────────────────────────────────────
  private tone(
    freq: number,
    dur: number,
    peak: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.05, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** Short filtered noise burst — the basis of every earth sound. */
  private grain(
    intensity: number,
    lowHz: number,
    highHz: number,
    dur: number,
    throttle = false,
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const nowMs = performance.now();
    if (throttle && nowMs - this.lastGrain < 55) return;
    this.lastGrain = nowMs;

    const t = this.now();
    const src = this.noiseSource();
    if (!src) return;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(highHz, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, lowHz), t + dur);
    bp.Q.value = 0.8;
    const gain = this.ctx.createGain();
    const peak = 0.04 + clamp01(intensity) * 0.3;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  suspendAll(): void {
    this.danger(false);
    this.stopAmbience();
  }
}

export const audio = new AudioEngine();
