/**
 * What the player leaves on the ground: the holes they've dug, and the
 * scratch they make when they pinpoint. Both lie on the rolling terrain
 * rather than floating over it, and neither carries any information the
 * player didn't put there — no glow, no tone colour, no strength.
 */
import * as THREE from 'three';
import { holeDecalTexture, scratchMarkTexture } from './textures';

type GroundAt = (x: number, z: number) => number;

/** Sits just above the turf so the decal never z-fights the terrain mesh. */
const DECAL_LIFT = 0.018;

/**
 * Builds a square decal of `size` metres centred on (cx, cz) whose every
 * vertex follows the ground beneath it. Vertex positions are local to the
 * centre so the mesh can be placed at (cx, 0, cz).
 */
export function groundDecalGeometry(
  size: number,
  cx: number,
  cz: number,
  groundAt: GroundAt,
  yaw = 0,
  segments = 6,
  lift = DECAL_LIFT,
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  if (yaw) geometry.rotateY(yaw);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, groundAt(cx + pos.getX(i), cz + pos.getZ(i)) + lift);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Stable per-spot rotation so no two holes share an outline. */
export function decalYaw(x: number, z: number): number {
  const a = (x * 13.7 + z * 7.1) % (Math.PI * 2);
  return a < 0 ? a + Math.PI * 2 : a;
}

function decalMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

export interface HoleLayer {
  /** Adds a hole at a world position. */
  add(x: number, z: number, found: boolean): void;
  readonly count: number;
  dispose(): void;
}

export function buildHoleLayer(scene: THREE.Scene, groundAt: GroundAt): HoleLayer {
  const foundTex = holeDecalTexture(true);
  const filledTex = holeDecalTexture(false);
  const foundMat = decalMaterial(foundTex);
  const filledMat = decalMaterial(filledTex);
  const meshes: THREE.Mesh[] = [];
  return {
    add(x, z, found) {
      const geometry = groundDecalGeometry(1.4, x, z, groundAt, decalYaw(x, z), 6, DECAL_LIFT + meshes.length * 0.0004);
      const mesh = new THREE.Mesh(geometry, found ? foundMat : filledMat);
      mesh.position.set(x, 0, z);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      scene.add(mesh);
      meshes.push(mesh);
    },
    get count() {
      return meshes.length;
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        scene.remove(m);
      }
      meshes.length = 0;
      foundMat.dispose();
      filledMat.dispose();
      foundTex.dispose();
      filledTex.dispose();
    },
  };
}

export interface PinpointMark {
  /** Scratches the mark at a world position (re-lays it on the ground there). */
  place(x: number, z: number): void;
  setVisible(on: boolean): void;
  /** Fades in when placed and out when cleared, rather than popping. */
  update(dt: number): void;
  readonly visible: boolean;
  dispose(): void;
}

export function buildPinpointMark(scene: THREE.Scene, groundAt: GroundAt): PinpointMark {
  const tex = scratchMarkTexture();
  const material = decalMaterial(tex);
  material.opacity = 0;
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  mesh.visible = false;
  scene.add(mesh);
  let wanted = false;
  let at: { x: number; z: number } | null = null;
  return {
    place(x, z) {
      if (at && Math.hypot(at.x - x, at.z - z) < 0.01) return;
      at = { x, z };
      mesh.geometry.dispose();
      mesh.geometry = groundDecalGeometry(0.62, x, z, groundAt, decalYaw(x, z), 4, DECAL_LIFT + 0.004);
      mesh.position.set(x, 0, z);
    },
    setVisible(on) {
      wanted = on;
      if (on) mesh.visible = true;
    },
    update(dt) {
      const target = wanted ? 1 : 0;
      material.opacity += (target - material.opacity) * Math.min(1, dt * (wanted ? 10 : 3));
      if (!wanted && material.opacity < 0.01) {
        material.opacity = 0;
        mesh.visible = false;
      }
    },
    get visible() {
      return mesh.visible;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      tex.dispose();
      scene.remove(mesh);
    },
  };
}
