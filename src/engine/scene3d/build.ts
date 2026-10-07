/**
 * Turns a SiteDef into a THREE.Scene. All geometry is primitives + canvas
 * textures — no model files. This is the only file that knows what a
 * PropKind looks like; everything upstream of it just sees data.
 */
import * as THREE from 'three';
import type { PropKind, SiteDef, SiteInteractable, SiteProp } from '@/content/sites/types';
import { PROP_FOOTPRINT } from '@/systems/explore';
import { ATMOSPHERE, buildSky, type SkyRig } from './atmosphere';
import { buildGrass, type GrassField } from './grass';
import { findSprite, footprintsTexture, hazardDecalTexture, siteGroundTexture, stoneTexture } from './textures';

export const PROP_HEIGHT: Record<PropKind, number> = {
  wall: 2.6,
  column: 3,
  columnBroken: 1.4,
  rubble: 0.65,
  rock: 0.8,
  archway: 3.2,
  cliff: 4.5,
  crate: 0.7,
  stairStep: 0.2,
  statueBody: 2.2,
};

/** Visuals that get their own mesh. A PropKind-valued `visual` reuses the nearby prop instead. */
const RENDERED_VISUALS = new Set(['carving', 'potteryShard', 'handFragment', 'footprints', 'relicPedestal', 'serpentIdol']);

export interface BuiltSite {
  scene: THREE.Scene;
  /** Interactable id -> its mesh, for visibility toggling as flags change. */
  interactableMeshes: Map<string, THREE.Object3D>;
  sky: SkyRig;
  /** Per-frame motion: clouds, grass, any running rise. */
  update(dt: number, elapsed: number): void;
  /**
   * Raises an interactable's mesh out of the ground over `seconds` — the
   * pedestal that was under the dais the whole time. Returns a promise that
   * resolves when it is fully up.
   */
  rise(interactableId: string, depth: number, seconds: number): Promise<void>;
  dispose(): void;
}

export function buildSiteScene(site: SiteDef): BuiltSite {
  const scene = new THREE.Scene();
  const atmo = ATMOSPHERE[site.ambience ?? 'ruins'];
  const sky = buildSky(scene, atmo, site.radius, { skyTop: site.skyTop, skyBottom: site.skyBottom, fog: site.fogColor });
  scene.fog = new THREE.Fog(new THREE.Color(site.fogColor).getHex(), site.fogNear, site.fogFar);

  const groundSize = site.radius * 2.6 + 30;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({
      map: siteGroundTexture(site.groundColor, site.groundDetail, Math.max(4, Math.round(groundSize / 4))),
      roughness: 1,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const stoneMaterial = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.96, metalness: 0.02 });
  for (const prop of site.props) buildProp(scene, prop, stoneMaterial);

  const grass: GrassField | null =
    site.ambience === 'ruins' || site.ambience === 'park'
      ? buildGrass({
          count: 900,
          halfWidth: site.radius + 8,
          halfHeight: site.radius + 8,
          terrain: null,
          color: '#536b3c',
          tip: '#b3bf78',
          height: 0.26,
          seed: 0x5173,
          avoid: [{ x: site.spawn.x, z: site.spawn.z, r: 1.2 }, ...site.props.filter((p) => p.kind === 'stairStep' || p.kind === 'statueBody').map((p) => ({ x: p.position.x, z: p.position.z, r: 1.6 }))],
        })
      : null;
  if (grass) scene.add(grass.mesh);

  const interactableMeshes = new Map<string, THREE.Object3D>();
  for (const it of site.interactables) {
    const mesh = buildInteractable(it);
    if (mesh) {
      scene.add(mesh);
      interactableMeshes.set(it.id, mesh);
    }
  }

  const rises: { obj: THREE.Object3D; from: number; to: number; t: number; seconds: number; done: () => void }[] = [];

  for (const hz of site.hazards) {
    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(hz.radius * 1.05, 24),
      new THREE.MeshBasicMaterial({ map: hazardDecalTexture(), transparent: true, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(hz.position.x, 0.02, hz.position.z);
    scene.add(decal);
  }

  return {
    scene,
    interactableMeshes,
    sky,
    update(dt, elapsed) {
      sky.update(dt, elapsed);
      grass?.update(elapsed);
      for (let i = rises.length - 1; i >= 0; i--) {
        const r = rises[i]!;
        r.t = Math.min(r.seconds, r.t + dt);
        const k = r.t / r.seconds;
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        r.obj.position.y = r.from + (r.to - r.from) * eased;
        if (r.t >= r.seconds) {
          rises.splice(i, 1);
          r.done();
        }
      }
    },
    rise(interactableId, depth, seconds) {
      const obj = interactableMeshes.get(interactableId);
      if (!obj) return Promise.resolve();
      obj.visible = true;
      const to = obj.position.y;
      obj.position.y = to - depth;
      return new Promise<void>((done) => rises.push({ obj, from: to - depth, to, t: 0, seconds, done }));
    },
    dispose: () => {
      sky.dispose();
      grass?.dispose();
      disposeObject(scene);
    },
  };
}

/** Exported so buildField.ts can scatter the same low-poly props as decoration. */
export function buildProp(scene: THREE.Scene, prop: SiteProp, stoneMaterial: THREE.Material): void {
  const footprint = PROP_FOOTPRINT[prop.kind];
  const height = PROP_HEIGHT[prop.kind];
  const scale = prop.scale ?? [1, 1, 1];
  const w = footprint.w * scale[0];
  const h = height * scale[1];
  const d = footprint.d * scale[2];

  const group = new THREE.Group();
  group.position.set(prop.position.x, prop.position.y, prop.position.z);
  group.rotation.y = prop.rotationY ?? 0;

  switch (prop.kind) {
    case 'column':
    case 'columnBroken': {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry((w / 2) * 0.85, (w / 2) * 0.95, h, 10), stoneMaterial);
      mesh.position.y = h / 2;
      group.add(mesh);
      break;
    }
    case 'rubble':
    case 'rock': {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(w, d) / 2, 0), stoneMaterial);
      mesh.position.y = h / 2;
      mesh.scale.set(1, h / Math.max(w, d), 1);
      mesh.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.4);
      group.add(mesh);
      break;
    }
    case 'archway': {
      const postW = 0.5;
      const spacing = 1.6 * scale[0];
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, h, postW * 1.1), stoneMaterial);
        post.position.set((s * spacing) / 2, h / 2, 0);
        group.add(post);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(spacing + postW * 1.4, 0.55, 0.7), stoneMaterial);
      lintel.position.set(0, h - 0.28, 0);
      group.add(lintel);
      break;
    }
    case 'crate': {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.85 }),
      );
      mesh.position.y = h / 2;
      group.add(mesh);
      break;
    }
    case 'stairStep': {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMaterial);
      mesh.position.y = h / 2;
      group.add(mesh);
      break;
    }
    case 'statueBody': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.55, w * 0.62, 0.3, 10), stoneMaterial);
      base.position.y = 0.15;
      group.add(base);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.62, w * 0.5), stoneMaterial);
      torso.position.y = 0.3 + (h * 0.62) / 2;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(w * 0.22, 10, 8), stoneMaterial);
      head.position.y = 0.3 + h * 0.62 + w * 0.2;
      group.add(head);
      // The intact left arm, angled down — the right is simply absent.
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.1, w * 0.12, h * 0.42, 7), stoneMaterial);
      arm.position.set(-w * 0.42, 0.3 + h * 0.45, 0);
      arm.rotation.z = 0.5;
      group.add(arm);
      break;
    }
    case 'wall':
    case 'cliff':
    default: {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMaterial);
      mesh.position.y = h / 2;
      group.add(mesh);
      break;
    }
  }

  group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = prop.kind !== 'stairStep';
      m.receiveShadow = true;
    }
  });
  scene.add(group);
}

/** Exported so buildField.ts can render scenery-clue sprites the same way. */
export function billboardMesh(map: THREE.Texture, size: number, transparent = true): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map, transparent, alphaTest: 0.12, roughness: 0.8, side: THREE.DoubleSide }),
  );
}

function buildInteractable(it: SiteInteractable): THREE.Object3D | null {
  if (!RENDERED_VISUALS.has(it.visual)) return null;

  const group = new THREE.Group();
  group.position.set(it.position.x, it.position.y, it.position.z);
  group.rotation.y = it.rotationY ?? 0;

  switch (it.visual) {
    case 'carving': {
      const mesh = billboardMesh(findSprite('carving'), 1.15);
      mesh.position.y = 1.3;
      group.add(mesh);
      break;
    }
    case 'potteryShard': {
      const mesh = billboardMesh(findSprite('potteryShard'), 0.5);
      mesh.position.y = 0.3;
      mesh.rotation.x = -0.35;
      group.add(mesh);
      break;
    }
    case 'handFragment': {
      const mesh = billboardMesh(findSprite('handFragment'), 0.6);
      mesh.position.y = 0.32;
      mesh.rotation.x = -0.3;
      group.add(mesh);
      break;
    }
    case 'footprints': {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ map: footprintsTexture(), transparent: true, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.015;
      group.add(mesh);
      break;
    }
    case 'serpentIdol': {
      const mesh = billboardMesh(findSprite('serpentIdol'), 0.55);
      mesh.position.y = 0.9;
      group.add(mesh);
      break;
    }
    case 'relicPedestal': {
      const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 2.0, 10), stoneMat);
      base.position.y = -0.2;
      base.castShadow = true;
      group.add(base);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.12, 10), stoneMat);
      cap.position.y = 0.82;
      group.add(cap);
      const idol = billboardMesh(findSprite('serpentIdol'), 0.5);
      idol.position.y = 0.95;
      group.add(idol);
      break;
    }
  }

  return group;
}

/** Exported so buildField.ts (and the camera-anchored detector prop) can reuse the same cleanup. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
}

function disposeMaterial(mat: THREE.Material): void {
  const withMap = mat as THREE.MeshStandardMaterial;
  withMap.map?.dispose();
  mat.dispose();
}

/**
 * A first-person detector, held out ahead and to one side. `coilSwing` is a
 * separate pivot the caller animates (rotation.y) to visually sweep the coil
 * side to side — the same physical motion the signal model already assumes.
 */
export interface DetectorProp {
  root: THREE.Group;
  coilSwing: THREE.Group;
}

export function buildDetectorProp(): DetectorProp {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.5, metalness: 0.4 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8, metalness: 0.1 });
  const coilMetal = new THREE.MeshStandardMaterial({ color: 0x232220, roughness: 0.55, metalness: 0.35 });
  const coilFace = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 0.9, side: THREE.DoubleSide });

  // Upper shaft + grip, fixed relative to the camera (the forearm holding it).
  const upperShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.5, 8), metal);
  upperShaft.position.set(0.26, -0.28, -0.42);
  upperShaft.rotation.set(Math.PI * 0.32, 0, 0.08);
  root.add(upperShaft);

  const gripMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8), grip);
  gripMesh.position.set(0.24, -0.06, -0.28);
  gripMesh.rotation.set(Math.PI * 0.32, 0, 0.08);
  root.add(gripMesh);

  // Everything below the pivot sweeps side to side.
  const coilSwing = new THREE.Group();
  coilSwing.position.set(0.3, -0.48, -0.58);
  root.add(coilSwing);

  const lowerShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 8), metal);
  lowerShaft.position.set(-0.06, -0.24, -0.28);
  lowerShaft.rotation.set(Math.PI * 0.4, 0, 0);
  coilSwing.add(lowerShaft);

  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.024, 8, 20), coilMetal);
  coil.position.set(-0.13, -0.42, -0.62);
  coil.rotation.set(Math.PI / 2 + 0.18, 0, 0);
  coilSwing.add(coil);

  const coilFill = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), coilFace);
  coilFill.position.copy(coil.position);
  coilFill.rotation.copy(coil.rotation);
  coilSwing.add(coilFill);

  root.name = 'detectorProp';
  return { root, coilSwing };
}
