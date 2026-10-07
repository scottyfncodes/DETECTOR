import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { decalYaw, groundDecalGeometry } from '@/engine/scene3d/marks';

describe('groundDecalGeometry', () => {
  const slope = (x: number, z: number) => 0.3 * x + 0.1 * z + 2;

  it('lays every vertex on the ground beneath it, just above the turf', () => {
    const cx = 4;
    const cz = -3;
    const geo = groundDecalGeometry(1.4, cx, cz, slope, 0.7, 6, 0.02);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    expect(pos.count).toBe(49);
    for (let i = 0; i < pos.count; i++) {
      const wx = cx + pos.getX(i);
      const wz = cz + pos.getZ(i);
      expect(pos.getY(i)).toBeCloseTo(slope(wx, wz) + 0.02, 6);
    }
  });

  it('keeps its footprint centred on the spot at any rotation', () => {
    const geo = groundDecalGeometry(1, 0, 0, () => 0, 1.1);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 6);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 6);
  });
});

describe('decalYaw', () => {
  it('is stable for a spot and stays within one turn', () => {
    expect(decalYaw(3.2, -7.5)).toBe(decalYaw(3.2, -7.5));
    for (const [x, z] of [[0, 0], [-9, -9], [12.5, 3], [-0.4, 8]] as const) {
      const a = decalYaw(x, z);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(Math.PI * 2);
    }
  });
});
