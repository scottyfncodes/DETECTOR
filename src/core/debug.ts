/**
 * Read-only introspection hook.
 *
 * Off by default. Enabled in dev, or in any build with `?debug=1`, where it
 * exposes `window.__detector` for automated tests and for debugging a field
 * without having to guess what the audio is telling you. It exposes state and
 * nothing else — there are no cheats in here, and gameplay never reads it.
 */
import { game } from './gameState';

export const DEBUG_ENABLED: boolean = (() => {
  try {
    if (import.meta.env?.DEV) return true;
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
  } catch {
    return false;
  }
})();

export interface DetectorFrame {
  x: number;
  y: number;
  coilX: number;
  coilY: number;
  facing: number;
  signal: number;
  pinpointing: boolean;
  /** uid of the strongest contributor, if any. */
  dominant: string | null;
}

export interface ExploreFrame {
  /** Metres, matching SiteDef coordinates. */
  x: number;
  z: number;
  yaw: number;
  /** Label of the single contextual prompt currently offered, if any. */
  promptLabel: string | null;
}

const frames: { detector?: DetectorFrame; explore?: ExploreFrame } = {};

export function publishDetectorFrame(frame: DetectorFrame): void {
  if (!DEBUG_ENABLED) return;
  frames.detector = frame;
}

export function publishExploreFrame(frame: ExploreFrame): void {
  if (!DEBUG_ENABLED) return;
  frames.explore = frame;
}

export function installDebug(): void {
  if (!DEBUG_ENABLED) return;
  (window as unknown as Record<string, unknown>).__detector = {
    state: () => game.get(),
    frames,
  };
}
