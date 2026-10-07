/**
 * Grass as instanced crossed blades that lean in a slow wind. One draw call,
 * no per-blade objects, the lean done in the vertex shader from a single
 * time uniform — the field moves without costing the frame anything.
 */
import * as THREE from 'three';
import type { Terrain } from '@/systems/terrain';
import { mulberry32 } from '@/core/rng';

export interface GrassField {
  mesh: THREE.InstancedMesh;
  update(elapsed: number): void;
  dispose(): void;
}

function bladeTexture(color: string, tip: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, color);
  g.addColorStop(1, tip);
  ctx.fillStyle = g;
  for (const [x, w] of [
    [10, 5],
    [17, 4],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + w, 64);
    ctx.lineTo(x + w / 2 + 2, 2);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface GrassOptions {
  count: number;
  halfWidth: number;
  halfHeight: number;
  /** Field cm height function, or null for flat ground. */
  terrain: Terrain | null;
  color: string;
  tip: string;
  height: number;
  seed: number;
  /** Points (world metres) to keep clear — water, paths. */
  avoid?: { x: number; z: number; r: number }[];
}

export function buildGrass(opts: GrassOptions): GrassField {
  const geo = new THREE.PlaneGeometry(0.42, 0.42 * (opts.height / 0.42), 1, 2);
  geo.translate(0, (opts.height) / 2, 0);
  // Two crossed quads so a blade reads from every angle.
  const cross = geo.clone().rotateY(Math.PI / 2);
  const merged = mergeGeometries([geo, cross]);
  geo.dispose();
  cross.dispose();

  const mat = new THREE.MeshStandardMaterial({
    map: bladeTexture(opts.color, opts.tip),
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float lean = uv.y * uv.y;
          float gust = sin(uTime * 1.1 + ip.x * 0.35 + ip.z * 0.21) * 0.5 + sin(uTime * 2.3 + ip.z * 0.9) * 0.25;
          transformed.x += gust * 0.09 * lean;
          transformed.z += cos(uTime * 0.7 + ip.x * 0.5) * 0.04 * lean;
        }`,
      );
  };

  const mesh = new THREE.InstancedMesh(merged, mat, opts.count);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const rng = mulberry32(opts.seed >>> 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < opts.count && guard < opts.count * 4) {
    guard++;
    const x = (rng() * 2 - 1) * opts.halfWidth * 0.98;
    const z = (rng() * 2 - 1) * opts.halfHeight * 0.98;
    if (opts.avoid?.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
    const y = opts.terrain ? opts.terrain.heightAt((x + opts.halfWidth) * 100, (z + opts.halfHeight) * 100) : 0;
    p.set(x, y - 0.02, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    const sc = 0.7 + rng() * 0.7;
    s.set(sc, sc * (0.8 + rng() * 0.5), sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;

  return {
    mesh,
    update(elapsed) {
      uniforms.uTime.value = elapsed;
    },
    dispose() {
      merged.dispose();
      mat.map?.dispose();
      mat.dispose();
    },
  };
}

/** Minimal non-indexed merge for two small geometries with the same attributes. */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geos.map((g) => g.toNonIndexed());
  const names = ['position', 'normal', 'uv'] as const;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = (nonIndexed[0]!.getAttribute(name) as THREE.BufferAttribute).itemSize;
    const arrays = nonIndexed.map((g) => (g.getAttribute(name) as THREE.BufferAttribute).array as Float32Array);
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const data = new Float32Array(total);
    let offset = 0;
    for (const a of arrays) {
      data.set(a, offset);
      offset += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  for (const g of nonIndexed) g.dispose();
  return out;
}
