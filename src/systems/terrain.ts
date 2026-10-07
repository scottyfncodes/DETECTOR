/**
 * The ground is not flat. A field's heightfield is pure maths over the
 * location (so the same place always has the same lie of the land, however
 * many times its targets are reseeded): broad value noise for the roll of
 * the ground, flattened where a landmark needs level footing, and raised
 * into mounds where a landmark is a mound.
 *
 * Heights are metres; positions are field centimetres, the same space every
 * PlacedTarget and LandmarkDef uses. engine/scene3d turns this into a mesh
 * and the explore loop reads it every frame to keep the camera on the ground.
 */
import type { LandmarkDef, LocationDef } from '@/core/types';
import { hashString } from './detection';

const AMPLITUDE: Record<LocationDef['ambience'], number> = {
  park: 0.42,
  railway: 0.55,
  mine: 1.15,
  ruins: 0.3,
};

/** Landmarks that must sit on level ground, and the metres of flat around them. */
const FLATTEN: Partial<Record<LandmarkDef['kind'], number>> = {
  pond: 3.2,
  path: 1.4,
  dedicationStone: 1.6,
  signalBox: 2.6,
  bufferStop: 2,
  rails: 1.6,
  headframe: 3,
  tunnelMouth: 3,
  bench: 1.4,
  timberFrame: 1.6,
};

/** Long landmarks that need level ground along their whole length (metres at scale 1). */
const FLATTEN_ALONG: Partial<Record<LandmarkDef['kind'], { length: number; width: number }>> = {
  rails: { length: 6, width: 1.6 },
  path: { length: 6, width: 1.6 },
};

/** Landmarks that ARE ground: a raised mound, height in metres at the centre. */
const MOUND: Partial<Record<LandmarkDef['kind'], { height: number; radius: number }>> = {
  spoilHeap: { height: 1.9, radius: 3.6 },
};

function noise2(seed: number) {
  // Hash-based lattice value noise; good enough for a few hundred samples a frame.
  const h = (ix: number, iy: number) => {
    let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

export interface Terrain {
  /** Height in metres at a field position (cm). */
  heightAt(x: number, y: number): number;
  amplitude: number;
}

export function buildTerrain(location: LocationDef): Terrain {
  const seed = hashString(location.id);
  const low = noise2(seed);
  const high = noise2(seed ^ 0x9e3779b9);
  const amplitude = AMPLITUDE[location.ambience];
  const landmarks = location.landmarks ?? [];
  const flats = landmarks
    .filter((l) => FLATTEN[l.kind])
    .map((l) => ({ x: l.x, y: l.y, r: FLATTEN[l.kind]! * (l.scale ?? 1) * 100 }));
  const strips = landmarks
    .filter((l) => FLATTEN_ALONG[l.kind])
    .map((l) => {
      const spec = FLATTEN_ALONG[l.kind]!;
      const half = (spec.length * (l.scale ?? 1) * 100) / 2;
      const rot = l.rotation ?? 0;
      return {
        ax: l.x - Math.cos(rot) * half,
        ay: l.y - Math.sin(rot) * half,
        bx: l.x + Math.cos(rot) * half,
        by: l.y + Math.sin(rot) * half,
        w: spec.width * 100,
      };
    });
  const mounds = landmarks
    .filter((l) => MOUND[l.kind])
    .map((l) => ({ x: l.x, y: l.y, h: MOUND[l.kind]!.height * (l.scale ?? 1), r: MOUND[l.kind]!.radius * (l.scale ?? 1) * 100 }));
  // Spawn sits at the plot centre: keep it level so the first steps feel sure.
  flats.push({ x: location.bounds.w / 2, y: location.bounds.h / 2, r: 260 });

  return {
    amplitude,
    heightAt(x, y) {
      const sx = x / 100;
      const sy = y / 100;
      let n = (low(sx * 0.11, sy * 0.11) - 0.5) * 2;
      n += (high(sx * 0.31, sy * 0.31) - 0.5) * 0.7;
      let hgt = n * amplitude;
      let flat = 1;
      for (const f of flats) {
        const d = Math.hypot(x - f.x, y - f.y);
        if (d < f.r) flat = Math.min(flat, smooth(d / f.r));
      }
      for (const st of strips) {
        const d = distToSegment(x, y, st.ax, st.ay, st.bx, st.by);
        if (d < st.w) flat = Math.min(flat, smooth(d / st.w));
      }
      hgt *= flat;
      for (const m of mounds) {
        const d = Math.hypot(x - m.x, y - m.y);
        if (d < m.r) {
          const t = 1 - d / m.r;
          hgt += m.h * t * t * (3 - 2 * t);
        }
      }
      return hgt;
    },
  };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy || 1e-6;
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}
