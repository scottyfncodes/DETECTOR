/**
 * Landmarks as the systems see them: what blocks the player, what offers a
 * "look closer", and which state a landmark is in. Pure data in, pure data
 * out — engine/scene3d/landmarks.ts decides what each kind looks like.
 */
import type { LandmarkDef, LandmarkKind, LocationDef, SaveData } from '@/core/types';
import type { Collider } from './explore';

export interface Footprint {
  /** Collision radius in metres at scale 1; 0 = walk straight through. */
  radius: number;
  /** For long things (fences, rails, cliffs): length in metres along +x before rotation. */
  length?: number;
}

export const LANDMARK_FOOTPRINT: Record<LandmarkKind, Footprint> = {
  deadOak: { radius: 0.55 },
  tree: { radius: 0.4 },
  pine: { radius: 0.38 },
  bench: { radius: 0.55 },
  lampPost: { radius: 0.22 },
  ironFence: { radius: 0.25, length: 6 },
  pond: { radius: 0 },
  path: { radius: 0 },
  dedicationStone: { radius: 0.5 },
  rails: { radius: 0 },
  bufferStop: { radius: 0.9 },
  signalBox: { radius: 1.6 },
  waterTower: { radius: 1.4 },
  sleeperPile: { radius: 1.1 },
  wreckedCart: { radius: 1.2 },
  headframe: { radius: 1.6 },
  spoilHeap: { radius: 0 },
  tunnelMouth: { radius: 1.1, length: 5 },
  cliffWall: { radius: 0.7, length: 6 },
  timberFrame: { radius: 0.5 },
  boulder: { radius: 0.9 },
};

/** cm (field space) -> metres (world space, origin at plot centre). */
function toWorld(cm: number, halfExtentMetres: number): number {
  return cm / 100 - halfExtentMetres;
}

/** Colliders for every solid landmark, in world metres. */
export function landmarkColliders(location: LocationDef): Collider[] {
  const halfW = location.bounds.w / 200;
  const halfH = location.bounds.h / 200;
  const out: Collider[] = [];
  for (const lm of location.landmarks ?? []) {
    const fp = LANDMARK_FOOTPRINT[lm.kind];
    if (fp.radius <= 0) continue;
    const scale = lm.scale ?? 1;
    const cx = toWorld(lm.x, halfW);
    const cz = toWorld(lm.y, halfH);
    if (fp.length) {
      const len = fp.length * scale;
      const r = fp.radius;
      const count = Math.max(1, Math.round(len / (r * 1.5)));
      const rot = lm.rotation ?? 0;
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count - 0.5;
        out.push({ x: cx + Math.cos(rot) * t * len, z: cz + Math.sin(rot) * t * len, radius: r });
      }
    } else {
      out.push({ x: cx, z: cz, radius: fp.radius * scale });
    }
  }
  return out;
}

/** Whether a landmark with an `openWhen` has reached its open state. */
export function isLandmarkOpen(lm: LandmarkDef, save: Pick<SaveData, 'chainsComplete' | 'siteProgress'>): boolean {
  if (!lm.openWhen) return false;
  const byChain = (lm.openWhen.chains ?? []).some((c) => save.chainsComplete.includes(c));
  const byFlag = (lm.openWhen.flags ?? []).some((f) => save.siteProgress.includes(f));
  return byChain || byFlag;
}

export interface LandmarkPrompt {
  landmark: LandmarkDef;
  prompt: string;
  text: string;
  flag: string;
}

/** The notice a landmark currently offers, if it has one left to give. */
export function landmarkNotice(
  lm: LandmarkDef,
  save: Pick<SaveData, 'chainsComplete' | 'siteProgress'>,
): LandmarkPrompt | null {
  const n = lm.notice;
  if (!n) return null;
  const open = isLandmarkOpen(lm, save);
  if (open && n.openText && n.openFlag) {
    if (save.siteProgress.includes(n.openFlag)) return null;
    return { landmark: lm, prompt: n.prompt, text: n.openText, flag: n.openFlag };
  }
  if (save.siteProgress.includes(n.flag)) return null;
  return { landmark: lm, prompt: n.prompt, text: n.text, flag: n.flag };
}

/**
 * The single landmark notice the player is standing at and roughly facing,
 * same rule as systems/explore.ts nearestInteractable. Positions in field cm.
 */
export function nearestLandmarkNotice(
  xCm: number,
  yCm: number,
  yaw: number,
  location: LocationDef,
  save: Pick<SaveData, 'chainsComplete' | 'siteProgress'>,
  maxAngle = 0.95,
): LandmarkPrompt | null {
  let best: LandmarkPrompt | null = null;
  let bestDist = Infinity;
  for (const lm of location.landmarks ?? []) {
    const offer = landmarkNotice(lm, save);
    if (!offer) continue;
    const dx = (lm.x - xCm) / 100;
    const dz = (lm.y - yCm) / 100;
    const dist = Math.hypot(dx, dz);
    const range = lm.range ?? 2.8;
    if (dist > range) continue;
    if (dist > 0.6) {
      const angleToTarget = Math.atan2(dx, -dz);
      let diff = Math.abs(angleToTarget - yaw);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > maxAngle) continue;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = offer;
    }
  }
  return best;
}

/** The named landmark the player is near enough to be "at", for the HUD chip. */
export function nearestNamedLandmark(xCm: number, yCm: number, location: LocationDef, within = 4): LandmarkDef | null {
  let best: LandmarkDef | null = null;
  let bestDist = within;
  for (const lm of location.landmarks ?? []) {
    if (!lm.name) continue;
    const d = Math.hypot(lm.x - xCm, lm.y - yCm) / 100;
    const reach = within * Math.max(1, (lm.scale ?? 1) * 0.8);
    if (d < reach && d < bestDist + (reach - within)) {
      bestDist = d;
      best = lm;
    }
  }
  return best;
}
