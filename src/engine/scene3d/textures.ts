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
