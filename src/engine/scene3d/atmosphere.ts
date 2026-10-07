/**
 * Light, sky and air for every first-person space. One table per ambience so
 * a park at golden hour, an overcast railway cutting and a mine at dusk feel
 * like three different afternoons rather than three tints of the same one.
 * Sites may override the sky colours; the lighting rig itself is shared.
 */
import * as THREE from 'three';
import type { AmbienceKind } from '@/engine/audio';

export interface Atmosphere {
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  sunColor: string;
  sunIntensity: number;
  /** Unit-ish direction the light comes FROM. */
  sunDir: [number, number, number];
  sunGlow: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambient: number;
  fog: string;
  /** Fog near/far as multiples of the space's half-extent. */
  fogNear: number;
  fogFar: number;
  cloudColor: string;
  clouds: number;
}

export const ATMOSPHERE: Record<NonNullable<AmbienceKind>, Atmosphere> = {
  park: {
    skyTop: '#5f86a8',
    skyHorizon: '#c9c0a0',
    skyBottom: '#8d9a78',
    sunColor: '#ffd9a6',
    sunIntensity: 1.9,
    sunDir: [-0.55, 0.42, 0.45],
    sunGlow: '#ffe6b8',
    hemiSky: '#9fb3c4',
    hemiGround: '#3b4a2c',
    hemiIntensity: 1.05,
    ambient: 0.14,
    fog: '#b7b79a',
    fogNear: 1.1,
    fogFar: 3.2,
    cloudColor: '#f2e9d6',
    clouds: 7,
  },
  railway: {
    skyTop: '#6a7076',
    skyHorizon: '#b0a79a',
    skyBottom: '#7d7a70',
    sunColor: '#e9e3d4',
    sunIntensity: 1.1,
    sunDir: [-0.3, 0.6, 0.35],
    sunGlow: '#d9d5c8',
    hemiSky: '#9c9b96',
    hemiGround: '#3b332b',
    hemiIntensity: 1.15,
    ambient: 0.16,
    fog: '#a39d91',
    fogNear: 0.9,
    fogFar: 2.8,
    cloudColor: '#c8c3ba',
    clouds: 10,
  },
  mine: {
    skyTop: '#2f3444',
    skyHorizon: '#a07a5a',
    skyBottom: '#4e4341',
    sunColor: '#ffb07a',
    sunIntensity: 2.0,
    sunDir: [0.7, 0.3, 0.35],
    sunGlow: '#ff9d5c',
    hemiSky: '#8c8498',
    hemiGround: '#3a302c',
    hemiIntensity: 1.2,
    ambient: 0.22,
    fog: '#5e4f4a',
    fogNear: 0.7,
    fogFar: 2.3,
    cloudColor: '#8f7a74',
    clouds: 5,
  },
  ruins: {
    skyTop: '#7488a0',
    skyHorizon: '#d8caa4',
    skyBottom: '#9b9a78',
    sunColor: '#ffe3b8',
    sunIntensity: 1.7,
    sunDir: [-0.6, 0.55, 0.3],
    sunGlow: '#fff0cc',
    hemiSky: '#aeb9c0',
    hemiGround: '#414632',
    hemiIntensity: 1.1,
    ambient: 0.14,
    fog: '#b8b596',
    fogNear: 1,
    fogFar: 3,
    cloudColor: '#f0e9da',
    clouds: 6,
  },
  chamber: {
    skyTop: '#101014',
    skyHorizon: '#2a2024',
    skyBottom: '#120f10',
    sunColor: '#ffb07a',
    sunIntensity: 0.6,
    sunDir: [0.2, 0.9, 0.2],
    sunGlow: '#000000',
    hemiSky: '#302a34',
    hemiGround: '#120f10',
    hemiIntensity: 0.5,
    ambient: 0.05,
    fog: '#17121a',
    fogNear: 0.4,
    fogFar: 1.4,
    cloudColor: '#000000',
    clouds: 0,
  },
};

export interface SkyRig {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

function gradientTexture(stops: [number, string][]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [t, c] of stops) grad.addColorStop(t, c);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function glowTexture(color: string, size = 256, inner = 0.08): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color.replace(/^#/, '#') + 'aa');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function cloudTexture(color: string, seed: number, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < 14; i++) {
    const x = size * (0.2 + rnd() * 0.6);
    const y = (size / 2) * (0.35 + rnd() * 0.4);
    const r = size * (0.07 + rnd() * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color + 'cc');
    g.addColorStop(0.6, color + '55');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Sky dome, sun glow, drifting clouds, and the whole lighting rig. The
 * shadow camera is sized to the space so landmarks throw real shadows on
 * the ground without the map being wasted on empty distance.
 */
export function buildSky(
  scene: THREE.Scene,
  atmo: Atmosphere,
  halfExtent: number,
  override?: { skyTop?: string; skyBottom?: string; fog?: string },
): SkyRig {
  const group = new THREE.Group();
  const top = override?.skyTop ?? atmo.skyTop;
  const bottom = override?.skyBottom ?? atmo.skyBottom;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 24, 16),
    new THREE.MeshBasicMaterial({
      map: gradientTexture([
        [0, top],
        [0.42, top],
        [0.5, atmo.skyHorizon],
        [0.56, bottom],
        [1, bottom],
      ]),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  sky.renderOrder = -10;
  group.add(sky);

  const dir = new THREE.Vector3(...atmo.sunDir).normalize();
  if (atmo.sunGlow !== '#000000') {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(atmo.sunGlow), fog: false, depthWrite: false, transparent: true, opacity: 0.95 }),
    );
    glow.position.copy(dir).multiplyScalar(300);
    glow.scale.set(170, 170, 1);
    group.add(glow);
    const disc = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture('#ffffff', 128, 0.4), fog: false, depthWrite: false, transparent: true }),
    );
    disc.position.copy(dir).multiplyScalar(305);
    disc.scale.set(26, 26, 1);
    group.add(disc);
  }

  const clouds: { sprite: THREE.Sprite; speed: number }[] = [];
  for (let i = 0; i < atmo.clouds; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: cloudTexture(atmo.cloudColor, 17 + i * 13), fog: false, depthWrite: false, transparent: true, opacity: 0.55 }),
    );
    const angle = (i / Math.max(1, atmo.clouds)) * Math.PI * 2 + 0.7;
    const elev = 0.18 + ((i * 37) % 10) / 40;
    sprite.position.set(Math.cos(angle) * 260, 60 + elev * 160, Math.sin(angle) * 260);
    const w = 90 + ((i * 53) % 7) * 14;
    sprite.scale.set(w, w * 0.5, 1);
    group.add(sprite);
    clouds.push({ sprite, speed: 0.6 + ((i * 29) % 5) * 0.25 });
  }

  const hemi = new THREE.HemisphereLight(new THREE.Color(atmo.hemiSky), new THREE.Color(atmo.hemiGround), atmo.hemiIntensity);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(atmo.sunColor), atmo.sunIntensity);
  sun.position.copy(dir).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const reach = halfExtent + 3;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(sun.target);
  group.add(new THREE.AmbientLight(0xffffff, atmo.ambient));

  scene.fog = new THREE.Fog(new THREE.Color(override?.fog ?? atmo.fog).getHex(), halfExtent * atmo.fogNear, halfExtent * atmo.fogFar);
  scene.add(group);

  return {
    group,
    sun,
    update(dt) {
      for (const c of clouds) {
        const p = c.sprite.position;
        const a = Math.atan2(p.z, p.x) + dt * 0.004 * c.speed;
        const r = Math.hypot(p.x, p.z);
        p.x = Math.cos(a) * r;
        p.z = Math.sin(a) * r;
      }
    },
    dispose() {
      group.traverse((obj) => {
        const m = (obj as THREE.Mesh).material as THREE.Material | undefined;
        const withMap = m as THREE.MeshBasicMaterial | undefined;
        withMap?.map?.dispose();
        m?.dispose?.();
        (obj as THREE.Mesh).geometry?.dispose?.();
      });
    },
  };
}
