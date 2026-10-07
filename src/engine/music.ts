/**
 * The music layer. Everything is synthesised, like the rest of the game's
 * sound, and everything is keyed to what the player is doing rather than to
 * a timeline: a slow pad that belongs to the place, a tension control that
 * follows the detector, short motifs that belong to discoveries of each
 * size, and a scheduler of ambient events (birds, gusts, drips, a creak)
 * that keeps a field from ever being silent.
 *
 * Nothing here holds a reference to the AudioContext longer than a call:
 * engine/audio.ts owns it (and the iOS unlock dance), this just asks.
 */
import type { AmbienceKind } from './audio';
import { audio } from './audio';
import type { DiscoveryTier } from '@/systems/discovery';
import { clamp01 } from '@/core/rng';

interface Pad {
  nodes: AudioNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
  pulseGain: GainNode;
  baseCutoff: number;
  kind: AmbienceKind;
}

interface Key {
  root: number;
  /** Pad partials as ratios of the root. */
  pad: [number, OscillatorType, number][];
  /** Scale degrees (ratios) a motif draws on. */
  scale: number[];
  cutoff: number;
  level: number;
}

const KEYS: Record<NonNullable<AmbienceKind>, Key> = {
  park: {
    root: 73.42, // D2
    pad: [
      [1, 'triangle', 1],
      [1.5, 'triangle', 0.5],
      [2.0, 'sine', 0.35],
      [2.25, 'sine', 0.18],
    ],
    scale: [1, 1.125, 1.25, 1.5, 1.6875, 2, 2.25, 2.5, 3],
    cutoff: 520,
    level: 0.05,
  },
  railway: {
    root: 55, // A1
    pad: [
      [1, 'sawtooth', 0.55],
      [1.5, 'triangle', 0.45],
      [1.782, 'sine', 0.25], // minor 7th
      [2, 'sine', 0.2],
    ],
    scale: [1, 1.2, 1.333, 1.5, 1.782, 2, 2.4, 2.667, 3],
    cutoff: 380,
    level: 0.045,
  },
  mine: {
    root: 41.2, // E1
    pad: [
      [1, 'sine', 1],
      [2, 'triangle', 0.3],
      [2.828, 'sine', 0.12], // tritone, barely there
      [3, 'sine', 0.1],
    ],
    scale: [1, 1.2, 1.414, 1.5, 1.8, 2, 2.4, 2.828, 3],
    cutoff: 260,
    level: 0.06,
  },
  ruins: {
    root: 98, // G2
    pad: [
      [1, 'triangle', 0.8],
      [1.5, 'triangle', 0.6],
      [3, 'sine', 0.2],
      [4.5, 'sine', 0.08],
    ],
    scale: [1, 1.125, 1.333, 1.5, 1.6875, 2, 2.25, 2.667, 3],
    cutoff: 640,
    level: 0.04,
  },
  chamber: {
    root: 34.65, // C#1
    pad: [
      [1, 'sine', 1],
      [1.5, 'sine', 0.2],
      [2, 'triangle', 0.15],
    ],
    scale: [1, 1.2, 1.414, 1.5, 1.8, 2, 2.4],
    cutoff: 200,
    level: 0.06,
  },
};

type EventKind = 'bird' | 'gust' | 'creak' | 'drip' | 'rumble' | 'tick' | 'crow';

const EVENTS: Record<NonNullable<AmbienceKind>, { kind: EventKind; min: number; max: number }[]> = {
  park: [
    { kind: 'bird', min: 2.5, max: 8 },
    { kind: 'gust', min: 9, max: 22 },
  ],
  railway: [
    { kind: 'gust', min: 5, max: 14 },
    { kind: 'creak', min: 14, max: 36 },
    { kind: 'crow', min: 20, max: 50 },
  ],
  mine: [
    { kind: 'drip', min: 1.8, max: 6 },
    { kind: 'rumble', min: 24, max: 55 },
    { kind: 'gust', min: 12, max: 30 },
  ],
  ruins: [
    { kind: 'gust', min: 7, max: 18 },
    { kind: 'bird', min: 9, max: 25 },
    { kind: 'tick', min: 12, max: 30 },
  ],
  chamber: [
    { kind: 'drip', min: 2, max: 7 },
    { kind: 'rumble', min: 15, max: 40 },
  ],
};

class MusicEngine {
  private pad: Pad | null = null;
  private kind: AmbienceKind = null;
  /** The last real place, so a discovery card played after leaving it is still in its key. */
  private lastKind: NonNullable<AmbienceKind> = 'park';
  private tension = 0;
  private timers: { kind: EventKind; min: number; max: number; next: number }[] = [];
  private space_: { ctx: AudioContext; input: GainNode } | null = null;
  private lastMotif = 0;

  /** Where the player is. Crossfades the pad and reseeds the ambient scheduler. */
  setScene(kind: AmbienceKind): void {
    if (kind === this.kind && (this.pad || !kind)) return;
    this.kind = kind;
    this.stopPad();
    this.timers = kind ? EVENTS[kind].map((e) => ({ ...e, next: e.min * 0.5 + Math.random() * e.min })) : [];
    if (!kind) return;
    this.lastKind = kind;
    this.startPad(kind);
  }

  /** 0..1, how close the detector is to something — the pad leans in. */
  setTension(t: number): void {
    const target = clamp01(t);
    if (Math.abs(target - this.tension) < 0.01) return;
    this.tension = target;
    const g = audio.graph();
    if (!g || !this.pad) return;
    const now = g.ctx.currentTime;
    this.pad.filter.frequency.setTargetAtTime(this.pad.baseCutoff * (1 + target * 2.2), now, 0.6);
    this.pad.pulseGain.gain.setTargetAtTime(target * target * 0.5, now, 0.4);
  }

  /** Call once per frame while in a world: fires the ambient events. */
  tick(dt: number): void {
    if (!this.kind) return;
    for (const timer of this.timers) {
      timer.next -= dt;
      if (timer.next > 0) continue;
      timer.next = timer.min + Math.random() * (timer.max - timer.min);
      this.event(timer.kind);
    }
    // The pad only starts once the context exists, which may be after setScene.
    if (!this.pad) {
      const g = audio.graph();
      if (g) this.startPad(this.kind);
    }
  }

  /** The motif for a discovery of a given size, in the current key. */
  motif(tier: DiscoveryTier): void {
    const g = audio.graph();
    if (!g || !g.enabled) return;
    const now = g.ctx.currentTime;
    if (now - this.lastMotif < 0.3) return;
    this.lastMotif = now;
    const key = KEYS[this.kind ?? this.lastKind];
    const base = key.root * 4; // two octaves up: the melody register
    const space = this.space(g.ctx, g.master);
    const pluck = (ratio: number, at: number, dur: number, peak: number, type: OscillatorType = 'sine') => {
      const osc = g.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = base * ratio;
      const gain = g.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(gain).connect(space);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.05);
    };
    const sc = key.scale;
    switch (tier) {
      case 'minor':
        pluck(sc[0]!, 0, 0.5, 0.05);
        break;
      case 'notable':
        pluck(sc[2]!, 0, 0.8, 0.07);
        pluck(sc[4]!, 0.18, 1.2, 0.07);
        break;
      case 'major':
        pluck(sc[0]!, 0, 1.1, 0.07);
        pluck(sc[2]!, 0.22, 1.1, 0.07);
        pluck(sc[4]!, 0.44, 1.4, 0.08);
        pluck(sc[7]!, 0.7, 2.4, 0.09, 'triangle');
        this.shimmer(g.ctx, space, base, sc, now + 0.9, 0.5);
        break;
      case 'event':
        pluck(sc[0]!, 0, 1.4, 0.08);
        pluck(sc[3]!, 0.25, 1.4, 0.08);
        pluck(sc[5]!, 0.5, 1.6, 0.09);
        pluck(sc[7]!, 0.75, 2.2, 0.09, 'triangle');
        pluck(sc[8]!, 1.1, 3.2, 0.1, 'triangle');
        pluck(sc[5]! * 0.5, 1.1, 3.6, 0.08);
        this.shimmer(g.ctx, space, base, sc, now + 1.3, 1.0);
        if (this.pad) {
          this.pad.gain.gain.setTargetAtTime(this.pad.gain.gain.value * 2.2, now, 0.5);
          this.pad.gain.gain.setTargetAtTime(KEYS[this.pad.kind ?? this.lastKind].level, now + 4, 1.5);
        }
        break;
    }
  }

  stop(): void {
    this.setScene(null);
  }

  // ── internals ──────────────────────────────────────────────────────────
  private startPad(kind: NonNullable<AmbienceKind>): void {
    const g = audio.graph();
    if (!g) return;
    const { ctx, master } = g;
    const key = KEYS[kind];
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(key.level, ctx.currentTime + 4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = key.cutoff;
    filter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = key.cutoff * 0.35;
    lfo.connect(lfoGain).connect(filter.frequency);
    const nodes: AudioNode[] = [lfo, lfoGain];
    for (const [ratio, type, level] of key.pad) {
      for (const detune of [-5, 6]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = key.root * ratio;
        osc.detune.value = detune;
        const og = ctx.createGain();
        og.gain.value = level * 0.5;
        osc.connect(og).connect(filter);
        osc.start();
        nodes.push(osc, og);
      }
    }
    // The pulse: a fifth above the root, throbbing, silent until tension rises.
    const pulse = ctx.createOscillator();
    pulse.type = 'triangle';
    pulse.frequency.value = key.root * 3;
    const pulseLfo = ctx.createOscillator();
    pulseLfo.frequency.value = 1.6;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.5;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0;
    const pulseMod = ctx.createGain();
    pulseMod.gain.value = 0.5;
    pulseLfo.connect(pulseDepth).connect(pulseMod.gain);
    pulse.connect(pulseMod).connect(pulseGain).connect(filter);
    pulse.start();
    pulseLfo.start();
    nodes.push(pulse, pulseLfo, pulseDepth, pulseMod, pulseGain);
    filter.connect(gain).connect(master);
    lfo.start();
    this.pad = { nodes, gain, filter, pulseGain, baseCutoff: key.cutoff, kind };
    this.setTension(this.tension + 0.001);
  }

  private stopPad(): void {
    const pad = this.pad;
    this.pad = null;
    if (!pad) return;
    const g = audio.graph();
    const now = g?.ctx.currentTime ?? 0;
    pad.gain.gain.cancelScheduledValues(now);
    pad.gain.gain.setValueAtTime(pad.gain.gain.value, now);
    pad.gain.gain.linearRampToValueAtTime(0, now + 1.2);
    setTimeout(() => {
      for (const n of pad.nodes) {
        const src = n as OscillatorNode;
        if (typeof src.stop === 'function') {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
        }
        n.disconnect();
      }
      pad.filter.disconnect();
      pad.gain.disconnect();
    }, 1400);
  }

  /** A feedback delay the motifs play into, so a few sines sound like a room. */
  private space(ctx: AudioContext, master: GainNode): AudioNode {
    if (this.space_ && this.space_.ctx === ctx) return this.space_.input;
    const input = ctx.createGain();
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.36;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    input.connect(master);
    input.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(wet).connect(master);
    this.space_ = { ctx, input };
    return input;
  }

  private shimmer(ctx: AudioContext, out: AudioNode, base: number, scale: number[], at: number, amount: number): void {
    for (let i = 0; i < 8; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * 2 * scale[(i * 3) % scale.length]!;
      const g = ctx.createGain();
      const t = at + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025 * amount, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 1.7);
    }
  }

  private event(kind: EventKind): void {
    const g = audio.graph();
    if (!g || !g.enabled) return;
    const { ctx, master } = g;
    const t = ctx.currentTime;
    const tone = (f0: number, f1: number, dur: number, peak: number, type: OscillatorType, at = 0) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t + at);
      osc.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(peak, t + at + dur * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      osc.connect(gain).connect(master);
      osc.start(t + at);
      osc.stop(t + at + dur + 0.05);
    };
    const noise = (lowHz: number, highHz: number, dur: number, peak: number, q = 0.7) => {
      const src = g.noise();
      if (!src) return;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(lowHz, t);
      bp.frequency.exponentialRampToValueAtTime(highHz, t + dur * 0.5);
      bp.frequency.exponentialRampToValueAtTime(lowHz, t + dur);
      bp.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + dur * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(gain).connect(master);
      src.start(t);
      src.stop(t + dur + 0.05);
    };
    const pan = 0.6 + Math.random() * 0.8;
    switch (kind) {
      case 'bird': {
        const f = 2200 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) tone(f * pan, f * pan * (1.25 + Math.random() * 0.3), 0.09, 0.02, 'sine', i * 0.14);
        break;
      }
      case 'crow':
        tone(620, 440, 0.26, 0.018, 'sawtooth');
        tone(600, 420, 0.22, 0.014, 'sawtooth', 0.34);
        break;
      case 'gust':
        noise(180, 700, 2.4 + Math.random() * 2, 0.05 + Math.random() * 0.04);
        break;
      case 'creak':
        tone(84, 70, 0.9, 0.03, 'sawtooth');
        noise(300, 900, 0.8, 0.02, 3);
        break;
      case 'drip': {
        const f = 1400 + Math.random() * 900;
        tone(f, f * 0.55, 0.11, 0.035, 'sine');
        tone(f * 0.98, f * 0.5, 0.09, 0.012, 'sine', 0.33);
        tone(f * 0.96, f * 0.5, 0.08, 0.005, 'sine', 0.66);
        break;
      }
      case 'rumble':
        noise(40, 90, 3.5, 0.12, 0.5);
        tone(38, 30, 3.0, 0.05, 'sine');
        break;
      case 'tick':
        noise(2000, 3500, 0.05, 0.03, 4);
        break;
    }
  }
}

export const music = new MusicEngine();
