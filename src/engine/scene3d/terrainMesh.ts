/**
 * The ground as a mesh: systems/terrain.ts decides the height at any point,
 * this turns it into vertices with painted colour (slopes darker, hollows
 * cooler, crests catching the light) over the location's own tile texture.
 */
import * as THREE from 'three';
import type { GroundPalette, LocationDef } from '@/core/types';
import type { Terrain } from '@/systems/terrain';
import { groundTile } from '@/engine/render/textures';

function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amt));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${(((1 << 24) + (r << 16) + (g << 8) + b) >>> 0).toString(16).slice(1)}`;
}

function toTexture(canvas: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function buildTerrainMesh(location: LocationDef, terrain: Terrain, palette: GroundPalette): THREE.Mesh {
  const w = location.bounds.w / 100;
  const h = location.bounds.h / 100;
  // A skirt of extra ground past the plot so the edge of the world is never a
  // visible cliff — it just rolls on into the fog.
  const skirt = 18;
  const segs = 96;
  const geo = new THREE.PlaneGeometry(w + skirt * 2, h + skirt * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Field cm for the height function; clamp so the skirt extends the edge rather than inventing new hills.
    const fx = Math.max(0, Math.min(location.bounds.w, (x + w / 2) * 100));
    const fy = Math.max(0, Math.min(location.bounds.h, (z + h / 2) * 100));
    const y = terrain.heightAt(fx, fy);
    pos.setY(i, y);
    // Brightness only: hollows a shade darker, crests a shade lighter, so
    // the lie of the land reads even where the texture is uniform.
    const t = Math.max(0, Math.min(1, 0.5 + y / (terrain.amplitude * 2.2)));
    const tint = 0.78 + t * 0.5;
    tmp.setRGB(tint, tint * (1 - (t - 0.5) * 0.06), tint * (1 - (t - 0.5) * 0.1));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const repeat = Math.max(6, Math.round((w + skirt * 2) / 2.6));
  // The tile palette is authored for the old top-down view, where the ground
  // was lit flat; under a real sun it needs lifting a full step.
  const lit: GroundPalette = {
    ...palette,
    base: palette.mid,
    mid: palette.light,
    light: lighten(palette.light, 0.3),
    detail: lighten(palette.detail, 0.25),
  };
  const mat = new THREE.MeshStandardMaterial({
    map: toTexture(groundTile(lit, 512, 11), repeat),
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
  });
  mat.color.setRGB(1.35, 1.35, 1.35);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
