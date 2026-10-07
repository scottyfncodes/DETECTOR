/**
 * Canvas-generated textures for the first-person renderer. Same rule as the
 * rest of the game: nothing is shipped as an image asset. Artifact sprites
 * reuse the exact 2D silhouette renderer the journal draws with, so a
 * carving looks the same in the world as it does once it's in your journal.
 */
import * as THREE from 'three';
import type { GroundPalette } from '@/core/types';
import { drawFind } from '@/engine/render/object';
import { groundTile, stoneTile } from '@/engine/render/textures';

function toTexture(canvas: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amt));
  return `#${(((1 << 24) + (mix(r) << 16) + (mix(g) << 8) + mix(b)) >>> 0).toString(16).slice(1)}`;
}

export function siteGroundTexture(groundColor: string, groundDetail: string, repeatUnits: number): THREE.CanvasTexture {
  const palette: GroundPalette = {
    base: groundColor,
    mid: groundDetail,
    light: lighten(groundDetail, 0.22),
    detail: lighten(groundColor, 0.35),
    haze: groundColor,
    sky: groundDetail,
    scatter: 'rubble',
  };
  return toTexture(groundTile(palette, 512, 11), [repeatUnits, repeatUnits]);
}

let stoneCanvas: HTMLCanvasElement | null = null;
export function stoneTexture(): THREE.CanvasTexture {
  if (!stoneCanvas) stoneCanvas = stoneTile(256, 55);
  return toTexture(stoneCanvas, [1.6, 1.6]);
}

/** The exact 2D find-art renderer, baked onto a square sprite for the 3D world. */
export function findSprite(silhouette: string, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  drawFind(ctx, silhouette, size / 2, size / 2, size * 0.42, { condition: 100, time: 1.4 });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function footprintsTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const boot = (cx: number, cy: number, rot: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(25,20,14,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.1, size * 0.065, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, size * 0.09, size * 0.085, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  boot(size * 0.36, size * 0.42, -0.18);
  boot(size * 0.6, size * 0.56, 0.12);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** A dark, unweathered patch of ground — the only warning a hazard gets. */
export function hazardDecalTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(10,9,7,0.55)');
  grad.addColorStop(0.7, 'rgba(10,9,7,0.28)');
  grad.addColorStop(1, 'rgba(10,9,7,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const a = (i / 5) * Math.PI * 2 + 0.4;
    ctx.moveTo(size / 2, size / 2);
    ctx.lineTo(size / 2 + Math.cos(a) * size * 0.4, size / 2 + Math.sin(a) * size * 0.4);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * A hole in the turf. An open one (something came out of it) is a dark
 * mouth ringed with spoil; a filled one (nothing there, or given up on) is a
 * lighter plug of turned soil. Either way the ground remembers.
 */
export function holeDecalTexture(found: boolean, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const spoil = ctx.createRadialGradient(c, c, size * 0.2, c, c, size * 0.5);
  spoil.addColorStop(0, 'rgba(78,60,40,0.8)');
  spoil.addColorStop(0.6, 'rgba(70,54,36,0.38)');
  spoil.addColorStop(1, 'rgba(70,54,36,0)');
  ctx.fillStyle = spoil;
  ctx.fillRect(0, 0, size, size);
  // Clods thrown clear of the hole.
  ctx.fillStyle = 'rgba(58,43,29,0.7)';
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const d = size * (0.26 + ((i * 37) % 17) / 90);
    ctx.beginPath();
    ctx.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, size * 0.012 + (i % 3) * 2, size * 0.009 + (i % 2) * 2, a, 0, Math.PI * 2);
    ctx.fill();
  }
  if (found) {
    const mouth = ctx.createRadialGradient(c, c, 0, c, c, size * 0.24);
    mouth.addColorStop(0, 'rgba(12,9,6,0.98)');
    mouth.addColorStop(0.7, 'rgba(26,19,12,0.95)');
    mouth.addColorStop(1, 'rgba(40,30,20,0)');
    ctx.fillStyle = mouth;
    ctx.beginPath();
    ctx.ellipse(c, c, size * 0.25, size * 0.21, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(96,78,54,0.7)';
    ctx.beginPath();
    ctx.ellipse(c, c, size * 0.2, size * 0.17, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.45)';
    ctx.lineWidth = size * 0.012;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The pinpoint mark: a heel-scuffed patch with a cross scratched into it, the
 * way a detectorist marks a spot before kneeling. Plain earth — it says where
 * you stood, never how strong the signal was.
 */
export function scratchMarkTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const scuff = ctx.createRadialGradient(c, c, size * 0.05, c, c, size * 0.42);
  scuff.addColorStop(0, 'rgba(92,72,50,0.55)');
  scuff.addColorStop(0.7, 'rgba(80,62,42,0.25)');
  scuff.addColorStop(1, 'rgba(80,62,42,0)');
  ctx.fillStyle = scuff;
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  const scratch = (a: number, len: number) => {
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    ctx.strokeStyle = 'rgba(28,21,14,0.85)';
    ctx.lineWidth = size * 0.035;
    ctx.beginPath();
    ctx.moveTo(c - dx, c - dy);
    ctx.quadraticCurveTo(c + dy * 0.08, c - dx * 0.08, c + dx, c + dy);
    ctx.stroke();
    // The lip of soil pushed up along each side of the groove.
    ctx.strokeStyle = 'rgba(150,124,92,0.45)';
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.moveTo(c - dx + dy * 0.06, c - dy - dx * 0.06);
    ctx.lineTo(c + dx + dy * 0.06, c + dy - dx * 0.06);
    ctx.stroke();
  };
  scratch(0.72, size * 0.24);
  scratch(-0.86, size * 0.21);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
