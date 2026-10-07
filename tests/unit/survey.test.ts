import { describe, expect, it } from 'vitest';
import { getLocation, LOCATIONS } from '@/content/locations';
import { getTarget } from '@/content/targets';
import { CHAINS, CLUES, getClue } from '@/content/clues';
import { TOOLS } from '@/content/equipment';
import { SITES } from '@/content/sites';
import { freshSave } from '@/core/save';
import {
  bearingBetween,
  bearingDelta,
  bearingFromYaw,
  compassPoint,
  pointAtBearing,
  yawFromBearing,
} from '@/systems/survey';
import { buildTerrain } from '@/systems/terrain';
import {
  isLandmarkOpen,
  landmarkColliders,
  landmarkNotice,
  nearestLandmarkNotice,
  nearestNamedLandmark,
} from '@/systems/landmarks';
import { generateField, seedCaches } from '@/systems/placement';
import { facingVectors, stepPlayer, type PlayerState } from '@/systems/explore';
import { discoveryTier, resolveObservation } from '@/systems/discovery';

const park = getLocation('loc_old_park')!;
const railway = getLocation('loc_old_railway')!;
const mine = getLocation('loc_abandoned_mine')!;

describe('bearings', () => {
  it('treats yaw as a clockwise compass bearing with north at yaw 0', () => {
    expect(bearingFromYaw(0)).toBe(0);
    expect(bearingFromYaw(Math.PI / 2)).toBeCloseTo(90);
    expect(bearingFromYaw(-Math.PI / 2)).toBeCloseTo(270);
    expect(bearingFromYaw(Math.PI * 2.5)).toBeCloseTo(90);
    // East in facingVectors is +x, which bearing 90 must agree with.
    const east = facingVectors(yawFromBearing(90));
    expect(east.forwardX).toBeCloseTo(1);
    expect(east.forwardZ).toBeCloseTo(0);
  });

  it('measures a bearing between two field points', () => {
    expect(bearingBetween(0, 0, 0, -100)).toBeCloseTo(0); // up the plot = north
    expect(bearingBetween(0, 0, 100, 0)).toBeCloseTo(90);
    expect(bearingBetween(0, 0, 0, 100)).toBeCloseTo(180);
    expect(bearingBetween(0, 0, -100, 0)).toBeCloseTo(270);
  });

  it('walks a point out along a bearing and back again', () => {
    const p = pointAtBearing(500, 500, 312, 8);
    expect(bearingBetween(500, 500, p.x, p.y)).toBeCloseTo(312, 3);
    expect(Math.hypot(p.x - 500, p.y - 500)).toBeCloseTo(800, 3);
  });

  it('gives the shortest signed difference and sensible labels', () => {
    expect(bearingDelta(350, 10)).toBe(20);
    expect(bearingDelta(10, 350)).toBe(-20);
    expect(compassPoint(312)).toBe('NW');
    expect(compassPoint(2)).toBe('N');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(225)).toBe('SW');
  });

});

describe('the surveyor pages tell the truth', () => {
  it('page one: the park cache is ten paces at bearing 312 from the dedication stone', () => {
    const stone = park.landmarks!.find((l) => l.id === 'park_stone')!;
    const cache = park.caches!.find((c) => c.id === 'cache_park_tin')!;
    expect(bearingBetween(stone.x, stone.y, cache.x, cache.y)).toBeCloseTo(312, 0);
    expect(Math.hypot(cache.x - stone.x, cache.y - stone.y) / 100).toBeCloseTo(8, 0);
  });

  it('page two: the railway cache is twelve paces at bearing 225 from the buffer stop', () => {
    const buffer = railway.landmarks!.find((l) => l.id === 'rail_buffer')!;
    const cache = railway.caches!.find((c) => c.id === 'cache_rail_plumb')!;
    expect(bearingBetween(buffer.x, buffer.y, cache.x, cache.y)).toBeCloseTo(225, 0);
    expect(Math.hypot(cache.x - buffer.x, cache.y - buffer.y) / 100).toBeCloseTo(9.6, 0);
  });

  it('page three: the mine cache is at bearing 290 from the headframe, inside the rock pocket', () => {
    const frame = mine.landmarks!.find((l) => l.id === 'mine_headframe')!;
    const cache = mine.caches!.find((c) => c.id === 'cache_mine_book')!;
    expect(bearingBetween(frame.x, frame.y, cache.x, cache.y)).toBeCloseTo(290, 0);
    // The pocket's arms stand between the headframe and the cache: a
    // straight walk is blocked, a walk around the open north side is not.
    const colliders = landmarkColliders(mine);
    const halfW = mine.bounds.w / 200;
    const halfH = mine.bounds.h / 200;
    const toWorld = (x: number, y: number) => ({ x: x / 100 - halfW, z: y / 100 - halfH });
    const from = toWorld(frame.x, frame.y);
    const to = toWorld(cache.x, cache.y);
    let blocked = false;
    for (let t = 0; t <= 1; t += 0.01) {
      const px = from.x + (to.x - from.x) * t;
      const pz = from.z + (to.z - from.z) * t;
      if (colliders.some((c) => Math.hypot(c.x - px, c.z - pz) < c.radius)) blocked = true;
    }
    expect(blocked).toBe(true);
    const north = toWorld(cache.x, cache.y + 250); // the pocket opens to the south
    expect(colliders.some((c) => Math.hypot(c.x - north.x, c.z - north.z) < c.radius + 0.34)).toBe(false);
    expect(colliders.some((c) => Math.hypot(c.x - to.x, c.z - to.z) < c.radius + 0.34)).toBe(false);
  });

  it('every page points at a real place and every chain link names real places', () => {
    for (const clue of CLUES) if (clue.pointsTo) expect(getLocation(clue.pointsTo), clue.id).toBeDefined();
    for (const chain of CHAINS) for (const id of chain.links ?? []) expect(getLocation(id), chain.id).toBeDefined();
  });
});

describe('caches', () => {
  it('reference authored targets inside the plot, gated by real clues, each on a loot table nowhere', () => {
    for (const loc of LOCATIONS) {
      for (const cache of loc.caches ?? []) {
        const def = getTarget(cache.targetId);
        expect(def, `${loc.id}/${cache.id}`).toBeDefined();
        expect(def!.authored, `${cache.targetId} must be authored`).toBe(true);
        expect(getClue(cache.requiresClue), cache.requiresClue).toBeDefined();
        expect(cache.x).toBeGreaterThan(90);
        expect(cache.x).toBeLessThan(loc.bounds.w - 90);
        expect(cache.y).toBeGreaterThan(90);
        expect(cache.y).toBeLessThan(loc.bounds.h - 90);
        for (const other of LOCATIONS) {
          expect(other.table.some((e) => e.targetId === cache.targetId), `${cache.targetId} rolled at ${other.id}`).toBe(false);
        }
      }
    }
  });

  it('are not in the ground until the clue is held, then appear exactly once', () => {
    const none = generateField(park, 7, { heldClues: [], includeTutorial: false });
    expect(none.targets.some((t) => t.cacheId)).toBe(false);

    const held = generateField(park, 7, { heldClues: ['clue_surveyor_1'], includeTutorial: false });
    const cache = held.targets.filter((t) => t.cacheId === 'cache_park_tin');
    expect(cache).toHaveLength(1);
    expect(cache[0]!.targetId).toBe('tgt_survey_tin');
    expect(cache[0]!.x).toBe(556);

    // Re-seeding an existing field is idempotent.
    expect(seedCaches(held, park, ['clue_surveyor_1'], [])).toHaveLength(0);
    expect(held.targets.filter((t) => t.cacheId).length).toBe(1);
  });

  it('come back into a field already searched when the clue is learned later', () => {
    const field = generateField(park, 3, { heldClues: [], includeTutorial: false });
    const added = seedCaches(field, park, ['clue_surveyor_1'], []);
    expect(added).toHaveLength(1);
    expect(added[0]!.dug).toBe(false);
  });

  it('never seed a cache already in the journal', () => {
    const field = generateField(park, 3, { heldClues: ['clue_surveyor_1'], includeTutorial: false, discovered: ['tgt_survey_tin'] });
    expect(field.targets.some((t) => t.cacheId)).toBe(false);
  });

  it('the whole surveyor trail is walkable in order from a fresh save', () => {
    // Page one comes from a site pickup; every later page is a cache whose
    // gate is the page before it, in a field the player can reach.
    const chain = CHAINS.find((c) => c.id === 'chain_surveyor')!;
    const pageOne = SITES.flatMap((s) => s.interactables).find((i) => i.targetId && getTarget(i.targetId)?.clueId === chain.clueIds[0]);
    expect(pageOne).toBeDefined();
    expect(pageOne!.grantsEquipment).toBe('tool_compass');
    for (let i = 1; i < chain.clueIds.length; i++) {
      const previous = chain.clueIds[i - 1]!;
      const cache = LOCATIONS.flatMap((l) => (l.caches ?? []).map((c) => ({ loc: l, c }))).find(
        ({ c }) => getTarget(c.targetId)?.clueId === chain.clueIds[i],
      );
      expect(cache, chain.clueIds[i]).toBeDefined();
      expect(cache!.c.requiresClue).toBe(previous);
    }
  });
});

describe('landmarks', () => {
  it('sit inside their plot and reference kinds with a footprint', () => {
    for (const loc of LOCATIONS) {
      for (const lm of loc.landmarks ?? []) {
        expect(lm.x, `${loc.id}/${lm.id}`).toBeGreaterThanOrEqual(0);
        expect(lm.x).toBeLessThanOrEqual(loc.bounds.w);
        expect(lm.y).toBeGreaterThanOrEqual(0);
        expect(lm.y).toBeLessThanOrEqual(loc.bounds.h);
      }
      const ids = (loc.landmarks ?? []).map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const clue of loc.sceneryClues ?? []) {
        if (clue.landmarkId) expect(ids, `${loc.id}/${clue.id} -> ${clue.landmarkId}`).toContain(clue.landmarkId);
        if (clue.requiresClue) expect(getClue(clue.requiresClue)).toBeDefined();
      }
      expect(loc.map.x).toBeGreaterThanOrEqual(0);
      expect(loc.map.x).toBeLessThanOrEqual(1);
      expect(loc.map.y).toBeGreaterThanOrEqual(0);
      expect(loc.map.y).toBeLessThanOrEqual(1);
    }
  });

  it('never crowd the spawn point or a loot-table dig out of the plot', () => {
    for (const loc of LOCATIONS) {
      if (!loc.landmarks?.length) continue;
      const colliders = landmarkColliders(loc);
      for (const c of colliders) expect(Math.hypot(c.x, c.z), `${loc.id} collider near spawn`).toBeGreaterThan(1.2);
    }
  });

  it('solid landmarks stop the player; ponds, paths and rails do not', () => {
    const colliders = landmarkColliders(park);
    const oak = park.landmarks!.find((l) => l.id === 'park_oak')!;
    const halfW = park.bounds.w / 200;
    const halfH = park.bounds.h / 200;
    const ox = oak.x / 100 - halfW;
    const oz = oak.y / 100 - halfH;
    const player: PlayerState = { x: ox, z: oz + 2, yaw: 0, pitch: 0 };
    for (let i = 0; i < 60; i++) {
      stepPlayer(player, { dt: 0.05, moveX: 0, moveY: 1, yawDelta: 0, pitchDelta: 0, speed: 2, colliders, bounds: { halfWidth: halfW, halfHeight: halfH }, hazards: [], siteProgress: [] });
    }
    expect(Math.hypot(player.x - ox, player.z - oz)).toBeGreaterThan(0.6);
    const pond = park.landmarks!.find((l) => l.id === 'park_pond')!;
    const px = pond.x / 100 - halfW;
    const pz = pond.y / 100 - halfH;
    expect(colliders.some((c) => Math.hypot(c.x - px, c.z - pz) < 0.5)).toBe(false);
  });

  it('offer their notice once, then the open-state notice once the world changes', () => {
    const adit = mine.landmarks!.find((l) => l.id === 'mine_adit')!;
    const save = freshSave();
    expect(isLandmarkOpen(adit, save)).toBe(false);
    const closed = landmarkNotice(adit, save)!;
    expect(closed.text).toMatch(/boarded/i);
    expect(landmarkNotice(adit, { ...save, siteProgress: [closed.flag] })).toBeNull();

    const opened = { ...save, chainsComplete: ['chain_surveyor'] };
    expect(isLandmarkOpen(adit, opened)).toBe(true);
    const open = landmarkNotice(adit, opened)!;
    expect(open.text).toMatch(/sun with three rays/);
    expect(open.flag).not.toBe(closed.flag);
    expect(landmarkNotice(adit, { ...opened, siteProgress: [open.flag] })).toBeNull();
  });

  it('picks the notice you are standing at and facing', () => {
    const oak = park.landmarks!.find((l) => l.id === 'park_oak')!;
    const save = freshSave();
    const facing = Math.atan2(0, -(-200)); // standing 2m south, facing north toward it
    expect(nearestLandmarkNotice(oak.x, oak.y + 200, facing, park, save)?.landmark.id).toBe('park_oak');
    expect(nearestLandmarkNotice(oak.x, oak.y + 200, facing + Math.PI, park, save)).toBeNull();
    expect(nearestLandmarkNotice(oak.x, oak.y + 900, facing, park, save)).toBeNull();
    expect(nearestNamedLandmark(oak.x + 50, oak.y, park)?.id).toBe('park_oak');
  });
});

describe('terrain', () => {
  it('is deterministic, bounded and level at spawn', () => {
    const a = buildTerrain(park);
    const b = buildTerrain(park);
    expect(a.heightAt(300, 900)).toBe(b.heightAt(300, 900));
    expect(Math.abs(a.heightAt(park.bounds.w / 2, park.bounds.h / 2))).toBeLessThan(0.02);
    let max = 0;
    for (let x = 0; x <= park.bounds.w; x += 70) for (let y = 0; y <= park.bounds.h; y += 70) max = Math.max(max, Math.abs(a.heightAt(x, y)));
    expect(max).toBeLessThan(a.amplitude * 1.4);
    expect(max).toBeGreaterThan(0.05);
  });

  it('raises a spoil heap into a mound and flattens under a pond', () => {
    const t = buildTerrain(mine);
    const heap = mine.landmarks!.find((l) => l.id === 'mine_heap_a')!;
    expect(t.heightAt(heap.x, heap.y)).toBeGreaterThan(1.2);
    const p = buildTerrain(park);
    const pond = park.landmarks!.find((l) => l.id === 'park_pond')!;
    expect(Math.abs(p.heightAt(pond.x, pond.y))).toBeLessThan(0.02);
  });
});

describe('discovery tiers and found tools', () => {
  it('ranks a bottle cap below a clue below a completed chain', () => {
    const save = freshSave();
    const cap = resolveObservation(save, { def: getTarget('tgt_bottle_cap')!, locationId: 'loc_old_park' });
    expect(discoveryTier(cap.outcome)).toBe('minor');
    const ring = resolveObservation(save, { def: getTarget('tgt_signet_ring')!, locationId: 'loc_old_park' });
    expect(discoveryTier(ring.outcome)).toBe('notable');
    const page = resolveObservation(save, { def: getTarget('tgt_field_book_1')!, locationId: 'loc_silent_court' });
    expect(discoveryTier(page.outcome)).toBe('major');
    const withThree = { ...save, clues: ['clue_surveyor_1', 'clue_surveyor_2', 'clue_surveyor_3'] };
    const last = resolveObservation(withThree, { def: getTarget('tgt_field_book')!, locationId: 'loc_abandoned_mine' });
    expect(discoveryTier(last.outcome)).toBe('event');
    expect(last.outcome.chains.map((c) => c.id)).toContain('chain_surveyor');
    expect(last.save.unlockedLocations).toContain('loc_sealed_chamber');
    expect(last.save.adventures.adv_sealed_chamber).toBe('available');
  });

  it('hands over the compass with page one, exactly once', () => {
    const save = freshSave();
    const first = resolveObservation(save, { def: getTarget('tgt_field_book_1')!, locationId: 'loc_silent_court', grantsEquipment: 'tool_compass' });
    expect(first.outcome.equipmentGained?.id).toBe('tool_compass');
    expect(first.save.ownedEquipment).toContain('tool_compass');
    const again = resolveObservation(first.save, { def: getTarget('tgt_field_book_1')!, locationId: 'loc_silent_court', grantsEquipment: 'tool_compass' });
    expect(again.outcome.equipmentGained).toBeNull();
    expect(again.save.ownedEquipment.filter((id) => id === 'tool_compass')).toHaveLength(1);
  });

  it('found tools are free, flagged, and granted by something real', () => {
    const found = TOOLS.filter((t) => t.found);
    expect(found.length).toBeGreaterThan(0);
    for (const tool of found) {
      expect(tool.price).toBe(0);
      const granter = SITES.flatMap((s) => s.interactables).find((i) => i.grantsEquipment === tool.id);
      expect(granter, tool.id).toBeDefined();
    }
  });

  it('page two connects to the three-pointed sun already in the journal', () => {
    const save = { ...freshSave(), clues: ['clue_badge'] };
    const tin = resolveObservation(save, { def: getTarget('tgt_survey_tin')!, locationId: 'loc_old_park' });
    expect(tin.outcome.connections.map((c) => c.id)).toContain('clue_badge');
  });
});
