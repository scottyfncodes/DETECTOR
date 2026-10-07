/**
 * Turns a detecting LocationDef into a THREE.Scene — the open-field sibling
 * of build.ts's buildSiteScene. No buried target is ever rendered (that
 * would defeat the entire point of sweeping for one); the ground, the sky,
 * the grass, the landmarks and any fixed scenery clues are real geometry.
 *
 * World space is centred on the plot: PlacedTarget/SceneryClue/LandmarkDef
 * coordinates (centimetres, origin at one corner) map to world metres via
 * `/100 - half-extent`. Height comes from systems/terrain.ts.
 */
import * as THREE from 'three';
import type { LocationDef, SaveData } from '@/core/types';
import { getTarget } from '@/content/targets';
import { buildTerrain, type Terrain } from '@/systems/terrain';
import { landmarkColliders, isLandmarkOpen } from '@/systems/landmarks';
import type { Collider } from '@/systems/explore';
import { ATMOSPHERE, buildSky, type SkyRig } from './atmosphere';
import { buildTerrainMesh } from './terrainMesh';
import { buildGrass, type GrassField } from './grass';
import { buildLandmark, disposeMaterials, makeMaterials, type BuiltLandmark } from './landmarks';
import { billboardMesh, disposeObject } from './build';
import { findSprite } from './textures';
import { buildHoleLayer, buildPinpointMark, type HoleLayer, type PinpointMark } from './marks';

export interface BuiltField {
  scene: THREE.Scene;
  halfWidth: number;
  halfHeight: number;
  terrain: Terrain;
  colliders: Collider[];
  sky: SkyRig;
  /** Scenery clue id -> its mesh. */
  sceneryMeshes: Map<string, THREE.Object3D>;
  /** Landmark id -> what was built for it. */
  landmarks: Map<string, BuiltLandmark>;
  /** Holes the player has dug here, laid on the turf. */
  holes: HoleLayer;
  /** The scratch left where the player last pinpointed. */
  pinpointMark: PinpointMark;
  /** Lays every saved hole (field centimetres) onto the ground. */
  showHoles(holes: readonly { x: number; y: number; found: boolean }[]): void;
  /** Re-reads which landmarks should stand open for the current save. */
  refreshStates(save: Pick<SaveData, 'chainsComplete' | 'siteProgress'>): void;
  /** Per-frame motion: wind, water, lamps, clouds. */
  update(dt: number, elapsed: number): void;
  /** Ground height in world metres at a world position. */
  groundAt(x: number, z: number): number;
  dispose(): void;
}

/** cm (field space, origin at a corner) -> metres (world space, origin at plot centre). */
export function fieldToWorld(cm: number, halfExtent: number): number {
  return cm / 100 - halfExtent;
}

/** The inverse of fieldToWorld — world metres back to field centimetres. */
export function worldToField(metres: number, halfExtent: number): number {
  return (metres + halfExtent) * 100;
}

const GRASS: Record<LocationDef['ambience'], { count: number; color: string; tip: string; height: number } | null> = {
  park: { count: 2200, color: '#4a6b33', tip: '#b7cf6a', height: 0.34 },
  railway: { count: 650, color: '#6b6245', tip: '#c2b07a', height: 0.3 },
  mine: { count: 160, color: '#4a4238', tip: '#8a7c60', height: 0.22 },
  ruins: { count: 900, color: '#536b3c', tip: '#b3bf78', height: 0.28 },
};

export function buildFieldScene(location: LocationDef, seed: number): BuiltField {
  const halfWidth = location.bounds.w / 200;
  const halfHeight = location.bounds.h / 200;
  const palette = location.ground;
  const terrain = buildTerrain(location);
  const groundAt = (x: number, z: number) => terrain.heightAt(worldToField(x, halfWidth), worldToField(z, halfHeight));

  const scene = new THREE.Scene();
  const atmo = ATMOSPHERE[location.ambience];
  const sky = buildSky(scene, atmo, Math.max(halfWidth, halfHeight));

  const ground = buildTerrainMesh(location, terrain, palette);
  scene.add(ground);

  const materials = makeMaterials({ foliage: location.ambience === 'park' ? '#5e8a42' : '#5c7046', dirt: palette.mid });

  const landmarks = new Map<string, BuiltLandmark>();
  const avoid: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: 1.2 }];
  for (const def of location.landmarks ?? []) {
    const wx = fieldToWorld(def.x, halfWidth);
    const wz = fieldToWorld(def.y, halfHeight);
    const built = buildLandmark(def, {
      materials,
      heightAt: (x, y) => terrain.heightAt(x, y),
      wx,
      wz,
      fx: def.x,
      fy: def.y,
    });
    scene.add(built.group);
    landmarks.set(def.id, built);
    if (def.kind === 'pond') avoid.push({ x: wx, z: wz, r: 2.9 * (def.scale ?? 1) });
    if (def.kind === 'path') avoid.push({ x: wx, z: wz, r: 0.9 });
    if (def.kind === 'rails') avoid.push({ x: wx, z: wz, r: 0.1 });
  }

  const grassSpec = GRASS[location.ambience];
  let grass: GrassField | null = null;
  if (grassSpec) {
    grass = buildGrass({
      count: grassSpec.count,
      halfWidth: halfWidth + 6,
      halfHeight: halfHeight + 6,
      terrain,
      color: grassSpec.color,
      tip: grassSpec.tip,
      height: grassSpec.height,
      seed: seed ^ 0x51a55,
      avoid,
    });
    scene.add(grass.mesh);
  }

  const sceneryMeshes = new Map<string, THREE.Object3D>();
  for (const clue of location.sceneryClues ?? []) {
    const def = getTarget(clue.targetId);
    if (!def) continue;
    const host = clue.landmarkId ? landmarks.get(clue.landmarkId) : undefined;
    if (host) {
      const sprite = billboardMesh(findSprite(def.silhouette), 0.5);
      sprite.castShadow = false;
      host.clueAnchor.add(sprite);
      sceneryMeshes.set(clue.id, sprite);
    } else {
      const mesh = billboardMesh(findSprite(def.silhouette), 1.0);
      const wx = fieldToWorld(clue.x, halfWidth);
      const wz = fieldToWorld(clue.y, halfHeight);
      mesh.position.set(wx, groundAt(wx, wz) + 1.0, wz);
      scene.add(mesh);
      sceneryMeshes.set(clue.id, mesh);
    }
  }

  const colliders = landmarkColliders(location);
  const holes = buildHoleLayer(scene, groundAt);
  const pinpointMark = buildPinpointMark(scene, groundAt);

  return {
    scene,
    halfWidth,
    halfHeight,
    terrain,
    colliders,
    sky,
    sceneryMeshes,
    landmarks,
    holes,
    pinpointMark,
    showHoles(list) {
      for (const h of list) holes.add(fieldToWorld(h.x, halfWidth), fieldToWorld(h.y, halfHeight), h.found);
    },
    refreshStates(save) {
      for (const def of location.landmarks ?? []) {
        landmarks.get(def.id)?.setOpen(isLandmarkOpen(def, save));
      }
    },
    update(dt, elapsed) {
      sky.update(dt, elapsed);
      grass?.update(elapsed);
      for (const built of landmarks.values()) built.update?.(dt, elapsed);
      pinpointMark.update(dt);
    },
    groundAt,
    dispose: () => {
      holes.dispose();
      pinpointMark.dispose();
      sky.dispose();
      grass?.dispose();
      disposeMaterials(materials);
      disposeObject(scene);
    },
  };
}
