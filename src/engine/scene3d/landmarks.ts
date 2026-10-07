/**
 * What each LandmarkKind looks like. Every landmark is primitives and canvas
 * textures, composed for silhouette first: a dead oak reads as a dead oak
 * from thirty metres away in fog, before any detail resolves. This is the
 * only file that knows what a headframe is made of; everything upstream of
 * it sees a LandmarkDef.
 */
import * as THREE from 'three';
import type { LandmarkDef } from '@/core/types';
import { mulberry32, type Rng } from '@/core/rng';
import { hashString } from '@/systems/detection';
import { findSprite, stoneTexture } from './textures';

export interface Materials {
  stone: THREE.Material;
  bark: THREE.Material;
  wood: THREE.Material;
  iron: THREE.Material;
  rust: THREE.Material;
  foliage: THREE.Material;
  pine: THREE.Material;
  water: THREE.Material;
  dirt: THREE.Material;
  brick: THREE.Material;
  dark: THREE.Material;
  glass: THREE.Material;
}

export function makeMaterials(tint: { foliage: string; dirt: string }): Materials {
  const flat = (color: string, roughness = 0.95, metalness = 0): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  return {
    stone: new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.96, metalness: 0.02 }),
    bark: flat('#4e3d2e', 1),
    wood: flat('#7a6650', 0.9),
    iron: flat('#4a4a4e', 0.55, 0.45),
    rust: flat('#7a4e36', 0.8, 0.25),
    foliage: flat(tint.foliage, 1),
    pine: flat('#3f6a44', 1),
    water: new THREE.MeshStandardMaterial({ color: '#223433', roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.86 }),
    dirt: flat(tint.dirt, 1),
    brick: flat('#8a6250', 0.95),
    dark: new THREE.MeshStandardMaterial({ color: '#07060a', roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: '#1b2126', roughness: 0.2, metalness: 0.3, emissive: '#101418', emissiveIntensity: 0.3 }),
  };
}

export function disposeMaterials(m: Materials): void {
  for (const mat of Object.values(m)) {
    (mat as THREE.MeshStandardMaterial).map?.dispose();
    mat.dispose();
  }
}

export interface BuiltLandmark {
  group: THREE.Group;
  /** Where a scenery clue attached to this landmark should be drawn (local space). */
  clueAnchor: THREE.Object3D;
  /** Open/closed state, where the kind has one. */
  setOpen(open: boolean): void;
  /** Per-frame motion, where the kind has any. */
  update?(dt: number, elapsed: number): void;
}

export interface LandmarkContext {
  materials: Materials;
  /** Height of the ground in metres at a field point (cm). */
  heightAt(xCm: number, yCm: number): number;
  /** World x/z of the landmark's own position. */
  wx: number;
  wz: number;
  /** Field cm of the landmark's own position. */
  fx: number;
  fy: number;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rTop: number, rBot: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, segs = 8): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), mat);
  m.position.set(x, y, z);
  return m;
}

function rock(r: number, mat: THREE.Material, rng: Rng): THREE.Mesh {
  const m = mesh(new THREE.IcosahedronGeometry(r, 0), mat);
  m.scale.set(1 + rng() * 0.6, 0.6 + rng() * 0.6, 1 + rng() * 0.6);
  m.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
  return m;
}

export function buildLandmark(def: LandmarkDef, ctx: LandmarkContext): BuiltLandmark {
  const M = ctx.materials;
  const s = def.scale ?? 1;
  const rng = mulberry32(hashString(def.id));
  const group = new THREE.Group();
  const groundY = ctx.heightAt(ctx.fx, ctx.fy);
  group.position.set(ctx.wx, groundY, ctx.wz);
  group.rotation.y = -(def.rotation ?? 0);
  const clueAnchor = new THREE.Object3D();
  clueAnchor.position.set(0, 1.1, 0.6);
  group.add(clueAnchor);
  let setOpen: (open: boolean) => void = () => {};
  let update: ((dt: number, elapsed: number) => void) | undefined;

  switch (def.kind) {
    case 'deadOak': {
      const trunk = cyl(0.22 * s, 0.46 * s, 4.4 * s, M.bark, 0, 2.2 * s, 0, 9);
      group.add(trunk);
      const branch = (len: number, r: number, y: number, yaw: number, tilt: number) => {
        const b = cyl(r * 0.35, r, len, M.bark, 0, 0, 0, 6);
        b.geometry.translate(0, len / 2, 0);
        b.position.set(0, y, 0);
        b.rotation.set(tilt, yaw, 0, 'YXZ');
        group.add(b);
        for (let i = 0; i < 2; i++) {
          const twig = cyl(0.02 * s, r * 0.5, len * 0.55, M.bark, 0, 0, 0, 5);
          twig.geometry.translate(0, (len * 0.55) / 2, 0);
          twig.position.set(0, len * (0.55 + i * 0.3), 0);
          twig.rotation.set(0.5 + rng() * 0.6, rng() * Math.PI * 2, 0);
          b.add(twig);
        }
      };
      branch(2.6 * s, 0.14 * s, 2.6 * s, 0.3, 0.9);
      branch(2.2 * s, 0.12 * s, 3.1 * s, 2.3, 1.0);
      branch(2.9 * s, 0.13 * s, 3.5 * s, 4.1, 0.7);
      branch(1.8 * s, 0.1 * s, 4.1 * s, 1.4, 0.5);
      branch(1.6 * s, 0.09 * s, 4.3 * s, 5.2, 0.4);
      // Roots breaking the ground.
      for (let i = 0; i < 5; i++) {
        const root = cyl(0.05 * s, 0.16 * s, 0.9 * s, M.bark, 0, 0, 0, 5);
        root.geometry.translate(0, 0.45 * s, 0);
        root.rotation.set(Math.PI / 2 - 0.25, (i / 5) * Math.PI * 2 + 0.3, 0, 'YXZ');
        root.position.y = 0.05;
        group.add(root);
      }
      clueAnchor.position.set(0, 1.1 * s, 0.5 * s);
      break;
    }
    case 'tree': {
      group.add(cyl(0.14 * s, 0.22 * s, 2.2 * s, M.bark, 0, 1.1 * s, 0, 7));
      const blobs = [
        [0, 2.9, 0, 1.45],
        [0.8, 2.4, 0.3, 1.0],
        [-0.7, 2.6, -0.4, 1.05],
        [0.2, 3.6, -0.5, 0.9],
      ];
      for (const [x, y, z, r] of blobs) {
        const m = mesh(new THREE.IcosahedronGeometry(r * s, 1), M.foliage);
        m.position.set(x * s, y * s, z * s);
        m.rotation.set(rng(), rng(), rng());
        group.add(m);
      }
      break;
    }
    case 'pine': {
      group.add(cyl(0.1 * s, 0.2 * s, 2 * s, M.bark, 0, 1 * s, 0, 7));
      for (let i = 0; i < 3; i++) {
        const cone = mesh(new THREE.ConeGeometry((1.4 - i * 0.3) * s, 2.2 * s, 7), M.pine);
        cone.position.y = (2 + i * 1.25) * s;
        cone.rotation.y = i * 0.4;
        group.add(cone);
      }
      break;
    }
    case 'bench': {
      for (const x of [-0.75, 0.75]) {
        group.add(box(0.1, 0.45, 0.5, M.iron, x, 0.225, 0));
        group.add(box(0.1, 0.5, 0.08, M.iron, x, 0.7, -0.22));
      }
      for (const z of [-0.18, 0, 0.18]) group.add(box(1.7, 0.05, 0.14, M.wood, 0, 0.47, z));
      for (const y of [0.62, 0.78, 0.94]) group.add(box(1.7, 0.1, 0.05, M.wood, 0, y, -0.24));
      clueAnchor.position.set(0, 0.75, -0.2);
      break;
    }
    case 'lampPost': {
      group.add(cyl(0.05, 0.09, 3.4, M.iron, 0, 1.7, 0, 7));
      group.add(cyl(0.16, 0.2, 0.25, M.iron, 0, 0.12, 0, 8));
      const head = box(0.42, 0.5, 0.42, M.iron, 0, 3.55, 0);
      group.add(head);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.34, 0.3),
        new THREE.MeshStandardMaterial({ color: '#2a2418', emissive: '#f0b060', emissiveIntensity: 0.9, roughness: 0.4 }),
      );
      glass.position.set(0, 3.5, 0);
      group.add(glass);
      const light = new THREE.PointLight(0xffb060, 1.6, 7, 1.8);
      light.position.set(0, 3.4, 0);
      group.add(light);
      let phase = rng() * 10;
      update = (dt, elapsed) => {
        phase += dt;
        light.intensity = 1.4 + Math.sin(elapsed * 9 + phase) * 0.08 + Math.sin(elapsed * 23 + phase * 3) * 0.06;
      };
      break;
    }
    case 'ironFence': {
      const len = 6 * s;
      const posts = Math.round(len / 1.5);
      for (let i = 0; i <= posts; i++) {
        const x = -len / 2 + (i / posts) * len;
        const y = ctx.heightAt(ctx.fx + Math.cos(def.rotation ?? 0) * x * 100, ctx.fy + Math.sin(def.rotation ?? 0) * x * 100) - groundY;
        group.add(cyl(0.035, 0.045, 1.2, M.iron, x, y + 0.6, 0, 6));
        const finial = mesh(new THREE.ConeGeometry(0.06, 0.16, 5), M.iron);
        finial.position.set(x, y + 1.26, 0);
        group.add(finial);
      }
      for (const y of [0.35, 1.0]) group.add(box(len, 0.04, 0.04, M.iron, 0, y, 0));
      for (let i = 0; i < posts * 4; i++) {
        const x = -len / 2 + ((i + 0.5) / (posts * 4)) * len;
        group.add(cyl(0.012, 0.012, 0.95, M.iron, x, 0.7, 0, 4));
      }
      break;
    }
    case 'pond': {
      const r = 2.6 * s;
      const water = new THREE.Mesh(new THREE.CircleGeometry(r, 28), M.water);
      water.rotation.x = -Math.PI / 2;
      water.position.y = -0.04;
      water.receiveShadow = true;
      group.add(water);
      const bed = new THREE.Mesh(new THREE.CircleGeometry(r * 1.08, 28), M.dirt);
      bed.rotation.x = -Math.PI / 2;
      bed.position.y = -0.09;
      group.add(bed);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + rng() * 0.3;
        const rr = r * (0.98 + rng() * 0.12);
        const st = rock(0.12 + rng() * 0.16, M.stone, rng);
        st.position.set(Math.cos(a) * rr, 0.02, Math.sin(a) * rr);
        group.add(st);
      }
      const reeds: THREE.Mesh[] = [];
      for (let i = 0; i < 18; i++) {
        const a = rng() * Math.PI * 2;
        const rr = r * (0.75 + rng() * 0.28);
        const reed = cyl(0.008, 0.016, 0.7 + rng() * 0.6, M.pine, Math.cos(a) * rr, 0.3, Math.sin(a) * rr, 4);
        reed.geometry.translate(0, 0.35, 0);
        reed.position.y = -0.05;
        reed.castShadow = false;
        group.add(reed);
        reeds.push(reed);
      }
      const waterMat = M.water as THREE.MeshStandardMaterial;
      update = (_dt, elapsed) => {
        waterMat.roughness = 0.1 + Math.sin(elapsed * 0.8) * 0.04;
        for (let i = 0; i < reeds.length; i++) reeds[i]!.rotation.z = Math.sin(elapsed * 1.3 + i) * 0.08;
      };
      break;
    }
    case 'path': {
      const len = 6 * s;
      const steps = Math.round(len / 0.55);
      for (let i = 0; i <= steps; i++) {
        const x = -len / 2 + (i / steps) * len;
        const rot = def.rotation ?? 0;
        const y = ctx.heightAt(ctx.fx + Math.cos(rot) * x * 100, ctx.fy + Math.sin(rot) * x * 100) - groundY;
        const patch = new THREE.Mesh(new THREE.CircleGeometry(0.55 + rng() * 0.25, 10), M.dirt);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(x, y + 0.015, (rng() - 0.5) * 0.3);
        patch.scale.set(1.5, 1, 1);
        patch.receiveShadow = true;
        group.add(patch);
      }
      break;
    }
    case 'dedicationStone': {
      const slab = box(1.1, 0.26, 0.8, M.stone, 0, 0.12, 0);
      slab.rotation.x = -0.28;
      group.add(slab);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.62),
        new THREE.MeshStandardMaterial({ color: '#8d877c', roughness: 0.9 }),
      );
      face.position.set(0, 0.255, 0.0);
      face.rotation.x = -Math.PI / 2 - 0.28;
      group.add(face);
      clueAnchor.position.set(0, 0.45, 0.05);
      clueAnchor.rotation.x = -Math.PI / 2 - 0.28;
      break;
    }
    case 'rails': {
      const len = 6 * s;
      const sleepers = Math.round(len / 0.7);
      for (let i = 0; i <= sleepers; i++) {
        const x = -len / 2 + (i / sleepers) * len;
        const rot = def.rotation ?? 0;
        const y = ctx.heightAt(ctx.fx + Math.cos(rot) * x * 100, ctx.fy + Math.sin(rot) * x * 100) - groundY;
        if (rng() < 0.12) continue; // a few rotted away entirely
        const sl = box(0.24, 0.12, 1.5, M.wood, x, y + 0.06, 0);
        sl.rotation.y = (rng() - 0.5) * 0.06;
        group.add(sl);
      }
      for (const z of [-0.5, 0.5]) {
        const rail = box(len, 0.1, 0.07, M.rust, 0, 0.17, z);
        group.add(rail);
      }
      const ballast = new THREE.Mesh(new THREE.PlaneGeometry(len + 1, 2.4), M.dirt);
      ballast.rotation.x = -Math.PI / 2;
      ballast.position.y = 0.012;
      ballast.receiveShadow = true;
      group.add(ballast);
      break;
    }
    case 'bufferStop': {
      for (const z of [-0.5, 0.5]) {
        const beam = box(1.6, 0.16, 0.16, M.rust, 0, 0.55, z);
        beam.rotation.z = 0.55;
        group.add(beam);
        group.add(box(0.16, 1.0, 0.16, M.rust, 0.45, 0.5, z));
      }
      const head = box(0.3, 0.5, 1.5, M.rust, 0.5, 1.0, 0);
      group.add(head);
      const plate = box(0.08, 0.36, 1.1, new THREE.MeshStandardMaterial({ color: '#7a1f1a', roughness: 0.8 }), 0.7, 1.0, 0);
      group.add(plate);
      clueAnchor.position.set(0.76, 1.0, 0);
      clueAnchor.rotation.y = Math.PI / 2;
      break;
    }
    case 'signalBox': {
      group.add(box(2.6, 1.3, 2.4, M.brick, 0, 0.65, 0));
      group.add(box(2.8, 1.5, 2.6, M.wood, 0, 2.05, 0));
      // Windows all round the upper storey.
      for (const z of [-1.31, 1.31]) group.add(box(2.1, 0.9, 0.04, M.glass, 0, 2.15, z));
      for (const x of [-1.41, 1.41]) group.add(box(0.04, 0.9, 1.9, M.glass, x, 2.15, 0));
      const roofL = box(1.7, 0.1, 3.0, M.dark, -0.72, 3.0, 0);
      roofL.rotation.z = 0.42;
      group.add(roofL);
      const roofR = box(1.7, 0.1, 3.0, M.dark, 0.72, 3.0, 0);
      roofR.rotation.z = -0.42;
      group.add(roofR);
      // Stairs down the front.
      for (let i = 0; i < 6; i++) group.add(box(0.8, 0.08, 0.3, M.wood, 1.7, 1.3 - i * 0.22, 1.0 + i * 0.3));
      clueAnchor.position.set(-0.9, 0.95, 1.22);
      break;
    }
    case 'waterTower': {
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const leg = cyl(0.08, 0.11, 5.4, M.rust, x * 0.95, 2.7, z * 0.95, 6);
        leg.rotation.set(z * 0.09, 0, -x * 0.09);
        group.add(leg);
      }
      for (const y of [1.6, 3.4]) {
        group.add(box(2.1, 0.06, 0.06, M.rust, 0, y, -0.95));
        group.add(box(2.1, 0.06, 0.06, M.rust, 0, y, 0.95));
        group.add(box(0.06, 0.06, 2.1, M.rust, -0.95, y, 0));
        group.add(box(0.06, 0.06, 2.1, M.rust, 0.95, y, 0));
      }
      group.add(cyl(1.5, 1.5, 2.3, M.rust, 0, 6.5, 0, 14));
      for (const y of [5.6, 6.5, 7.4]) group.add(cyl(1.55, 1.55, 0.08, M.iron, 0, y, 0, 14));
      const roof = mesh(new THREE.ConeGeometry(1.7, 0.8, 14), M.dark);
      roof.position.y = 8.05;
      group.add(roof);
      const spout = cyl(0.08, 0.08, 2.4, M.rust, 1.2, 5.0, 0, 6);
      spout.rotation.z = 1.1;
      group.add(spout);
      break;
    }
    case 'sleeperPile': {
      for (let i = 0; i < 8; i++) {
        const layer = Math.floor(i / 3);
        const sl = box(2.2, 0.18, 0.24, M.wood, (rng() - 0.5) * 0.3, 0.09 + layer * 0.19, -0.45 + (i % 3) * 0.42 + (rng() - 0.5) * 0.1);
        sl.rotation.y = layer % 2 ? Math.PI / 2 + (rng() - 0.5) * 0.15 : (rng() - 0.5) * 0.15;
        group.add(sl);
      }
      break;
    }
    case 'wreckedCart': {
      const body = new THREE.Group();
      body.add(box(2.0, 0.12, 1.1, M.wood, 0, 0.06, 0));
      for (const z of [-0.55, 0.55]) body.add(box(2.0, 0.7, 0.08, M.wood, 0, 0.4, z));
      for (const x of [-1, 1]) body.add(box(0.08, 0.7, 1.1, M.wood, x, 0.4, 0));
      for (const x of [-0.7, 0.7]) {
        for (const z of [-0.65, 0.65]) {
          const wheel = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10), M.rust);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(x, -0.1, z);
          body.add(wheel);
        }
      }
      body.rotation.z = 1.35;
      body.position.set(0, 0.6, 0);
      group.add(body);
      clueAnchor.position.set(0.3, 0.9, 0.7);
      break;
    }
    case 'headframe': {
      const h = 8.5 * s;
      for (const [x, z] of [
        [-1.3, -1.3],
        [1.3, -1.3],
        [1.3, 1.3],
        [-1.3, 1.3],
      ]) {
        const leg = cyl(0.1, 0.16, h, M.wood, x * 0.9, h / 2, z * 0.9, 6);
        leg.rotation.set(-z * 0.1, 0, x * 0.1);
        group.add(leg);
      }
      for (let i = 1; i < 4; i++) {
        const y = (h * i) / 4;
        const span = 2.2 - i * 0.4;
        group.add(box(span, 0.12, 0.12, M.wood, 0, y, -span / 2));
        group.add(box(span, 0.12, 0.12, M.wood, 0, y, span / 2));
        group.add(box(0.12, 0.12, span, M.wood, -span / 2, y, 0));
        group.add(box(0.12, 0.12, span, M.wood, span / 2, y, 0));
      }
      group.add(box(1.0, 0.3, 1.0, M.wood, 0, h, 0));
      for (const z of [-0.3, 0.3]) {
        const sheave = mesh(new THREE.TorusGeometry(0.75, 0.08, 8, 20), M.iron);
        sheave.position.set(0, h + 0.75, z);
        group.add(sheave);
        for (let k = 0; k < 6; k++) {
          const spoke = box(1.4, 0.04, 0.04, M.iron, 0, h + 0.75, z);
          spoke.rotation.z = (k / 6) * Math.PI;
          group.add(spoke);
        }
      }
      // The cable, slack, running down to a winch drum.
      const cable = cyl(0.025, 0.025, h + 0.6, M.dark, 0.78, (h + 0.6) / 2, 0, 4);
      group.add(cable);
      group.add(cyl(0.4, 0.4, 1.2, M.iron, 2.4, 0.4, 0, 10).rotateZ(Math.PI / 2));
      group.add(box(2.6, 0.2, 2.6, M.stone, 0, 0.1, 0));
      group.add(box(1.6, 0.05, 1.6, M.dark, 0, 0.21, 0));
      break;
    }
    case 'spoilHeap': {
      // The mound itself is terrain; this scatters the rubble on its flanks.
      const r = 3.6 * s;
      for (let i = 0; i < 22; i++) {
        const a = rng() * Math.PI * 2;
        const d = r * (0.2 + rng() * 0.55);
        const fx = ctx.fx + Math.cos(a) * d * 100;
        const fy = ctx.fy + Math.sin(a) * d * 100;
        const st = rock(0.14 + rng() * 0.32, M.stone, rng);
        st.position.set(Math.cos(a) * d, ctx.heightAt(fx, fy) - groundY - 0.05, Math.sin(a) * d);
        st.castShadow = i % 3 === 0;
        group.add(st);
      }
      break;
    }
    case 'tunnelMouth': {
      // A dark cut into the cliff behind, framed in timber.
      group.add(box(2.6, 3.0, 2.2, M.dark, 0, 1.5, -1.3));
      for (const x of [-1.2, 1.2]) group.add(box(0.3, 2.9, 0.3, M.wood, x, 1.45, 0));
      group.add(box(3.0, 0.36, 0.4, M.wood, 0, 3.0, 0));
      const boards = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const b = box(2.5, 0.28, 0.06, M.wood, 0, 0.35 + i * 0.52, 0.1);
        b.rotation.z = (rng() - 0.5) * 0.08;
        boards.add(b);
      }
      group.add(boards);
      const stacked = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const b = box(2.5, 0.28, 0.06, M.wood, 2.0, 0.14 + i * 0.07, 0.6 + i * 0.03);
        b.rotation.x = Math.PI / 2 - 0.12;
        b.rotation.z = (rng() - 0.5) * 0.06;
        stacked.add(b);
      }
      stacked.visible = false;
      group.add(stacked);
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        new THREE.MeshStandardMaterial({ map: findSprite('token'), transparent: true, alphaTest: 0.1, roughness: 0.9 }),
      );
      mark.position.set(0, 3.0, 0.22);
      mark.visible = false;
      group.add(mark);
      setOpen = (open) => {
        boards.visible = !open;
        stacked.visible = open;
        mark.visible = open;
      };
      clueAnchor.position.set(0, 1.4, 0.4);
      break;
    }
    case 'cliffWall': {
      const len = 6 * s;
      const base = box(len, 4.6, 1.3, M.stone, 0, 2.3, 0);
      group.add(base);
      const count = Math.max(3, Math.round(len / 1.3));
      for (let i = 0; i < count; i++) {
        const x = -len / 2 + ((i + 0.5) / count) * len;
        const st = rock(0.9 + rng() * 0.7, M.stone, rng);
        st.position.set(x, 3.2 + rng() * 1.4, (rng() - 0.5) * 0.9);
        group.add(st);
        const foot = rock(0.4 + rng() * 0.5, M.stone, rng);
        foot.position.set(x + (rng() - 0.5) * 0.6, 0.15, 0.9 + rng() * 0.5);
        group.add(foot);
      }
      break;
    }
    case 'timberFrame': {
      for (const x of [-0.7, 0.7]) group.add(box(0.26, 2.4, 0.26, M.wood, x, 1.2, 0));
      group.add(box(1.9, 0.3, 0.3, M.wood, 0, 2.5, 0));
      const brace = box(0.1, 1.1, 0.1, M.wood, -0.35, 1.95, 0.05);
      brace.rotation.z = 0.7;
      group.add(brace);
      clueAnchor.position.set(0.7, 1.4, 0.15);
      break;
    }
    case 'boulder': {
      const st = rock(0.9 * s, M.stone, rng);
      st.position.y = 0.45 * s;
      group.add(st);
      const small = rock(0.35 * s, M.stone, rng);
      small.position.set(0.9 * s, 0.15, 0.4 * s);
      group.add(small);
      break;
    }
  }

  return { group, clueAnchor, setOpen, update };
}
