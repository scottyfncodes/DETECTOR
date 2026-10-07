import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  clearSave,
  freshSave,
  loadSave,
  migrate,
  sanitize,
  writeSave,
  type StorageLike,
} from '@/core/save';

function memory(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('save round trip', () => {
  it('starts a new game when storage is empty', () => {
    const result = loadSave(memory());
    expect(result.outcome).toBe('new');
    expect(result.save.version).toBe(SAVE_VERSION);
    expect(result.save.discoveries).toEqual([]);
    expect(result.save.unlockedLocations).toContain('loc_old_park');
  });

  it('persists and restores progress', () => {
    const storage = memory();
    const save = freshSave();
    save.money = 120;
    save.clues = ['clue_badge'];
    save.discoveries = [
      {
        uid: 'f1',
        targetId: 'tgt_silver_coin',
        condition: 77,
        depthCm: 12.5,
        locationId: 'loc_old_railway',
        foundAt: 1000,
        value: 30,
      },
    ];
    expect(writeSave(save, storage)).toBe(true);

    const loaded = loadSave(storage);
    expect(loaded.outcome).toBe('loaded');
    expect(loaded.save.money).toBe(120);
    expect(loaded.save.clues).toEqual(['clue_badge']);
    expect(loaded.save.discoveries).toHaveLength(1);
    expect(loaded.save.discoveries[0]!.condition).toBe(77);
  });

  it('restores an in-progress field so a refresh resumes the same ground', () => {
    const storage = memory();
    const save = freshSave();
    save.field = {
      locationId: 'loc_old_park',
      seed: 4242,
      playerX: 700,
      playerY: 650,
      holes: [{ x: 100, y: 120, found: true }],
      startedAt: 5,
      targets: [
        {
          uid: 't1',
          targetId: 'tgt_old_coin',
          x: 300,
          y: 400,
          depth: 11,
          baseCondition: 88,
          dug: false,
        },
      ],
    };
    writeSave(save, storage);
    const loaded = loadSave(storage).save;
    expect(loaded.field?.seed).toBe(4242);
    expect(loaded.field?.targets[0]!.targetId).toBe('tgt_old_coin');
    expect(loaded.field?.playerX).toBe(700);
    expect(loaded.field?.holes).toHaveLength(1);
  });

  it('remembers which way the player faced, and ignores a facing that is not a number', () => {
    const storage = memory();
    const save = freshSave();
    save.field = { locationId: 'loc_old_park', seed: 1, playerX: 700, playerY: 650, playerYaw: 2.5, holes: [], startedAt: 5, targets: [] };
    writeSave(save, storage);
    expect(loadSave(storage).save.field?.playerYaw).toBe(2.5);
    const bad = sanitize({ ...save, field: { ...save.field, playerYaw: 'north' } });
    expect(bad.field?.playerYaw).toBeUndefined();
  });

  it('keeps its own key, apart from anything else served from the same origin', () => {
    expect(SAVE_KEY).toBe('detector.save.v1');
    expect(BACKUP_KEY).not.toMatch(/^unearth\./);
  });

  it('persists examined and assembled progress', () => {
    const storage = memory();
    const save = freshSave();
    save.examined = ['tgt_shard_a', 'tgt_shard_a', 'tgt_shard_b'];
    save.assembled = ['tgt_bound_tablet'];
    writeSave(save, storage);
    const loaded = loadSave(storage).save;
    // sanitize dedupes via strArray, same as clues/unlockedLocations.
    expect(loaded.examined.sort()).toEqual(['tgt_shard_a', 'tgt_shard_b']);
    expect(loaded.assembled).toEqual(['tgt_bound_tablet']);
  });

  it('starts a fresh save with no examined or assembled entries', () => {
    expect(freshSave().examined).toEqual([]);
    expect(freshSave().assembled).toEqual([]);
  });

  it('clears a save on request', () => {
    const storage = memory();
    writeSave(freshSave(), storage);
    clearSave(storage);
    expect(loadSave(storage).outcome).toBe('new');
  });
});

describe('bad save data never crashes the game', () => {
  it('recovers from unparseable JSON and keeps the wreckage', () => {
    const storage = memory({ [SAVE_KEY]: '{ this is not json' });
    const result = loadSave(storage);
    expect(result.outcome).toBe('recovered');
    expect(result.save.discoveries).toEqual([]);
    expect(storage.getItem(BACKUP_KEY)).toBe('{ this is not json');
  });

  it('recovers when the save is not an object', () => {
    expect(loadSave(memory({ [SAVE_KEY]: '"a string"' })).outcome).toBe('recovered');
    expect(loadSave(memory({ [SAVE_KEY]: '[1,2,3]' })).outcome).toBe('recovered');
    expect(loadSave(memory({ [SAVE_KEY]: 'null' })).outcome).toBe('recovered');
    expect(loadSave(memory({ [SAVE_KEY]: '' })).outcome).toBe('new');
  });

  it('refuses to guess at a save from a newer build', () => {
    const future = JSON.stringify({ version: SAVE_VERSION + 5, discoveries: [], money: 9 });
    const storage = memory({ [SAVE_KEY]: future });
    const result = loadSave(storage);
    expect(result.outcome).toBe('recovered');
    expect(result.save.money).toBe(0);
    expect(storage.getItem(BACKUP_KEY)).toBe(future);
  });

  it('repairs a save full of rubbish values', () => {
    const junk = {
      version: 1,
      discoveries: [
        null,
        'nope',
        { targetId: 'tgt_old_coin', condition: 5000, depthCm: -12, foundAt: 'yesterday' },
        { condition: 50 },
      ],
      clues: ['clue_badge', 'clue_badge', 42, null],
      chainsComplete: 'not-an-array',
      unlockedLocations: null,
      detectorId: 99,
      money: -500,
      stats: { finds: 'lots', holesDug: NaN },
      field: { locationId: 'loc_old_park', targets: [{ x: 'left' }], holes: 'none' },
      adventures: { adv_sealed_chamber: 'exploded' },
      settings: { sound: 'yes' },
      flags: null,
    };
    const save = sanitize(junk);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.discoveries).toHaveLength(1);
    expect(save.discoveries[0]!.condition).toBe(100);
    expect(save.discoveries[0]!.depthCm).toBe(0);
    expect(save.clues).toEqual(['clue_badge']);
    expect(save.chainsComplete).toEqual([]);
    expect(save.unlockedLocations).toContain('loc_old_park');
    expect(save.detectorId).toBe('det_starter');
    expect(save.money).toBe(0);
    expect(save.stats.finds).toBe(1);
    expect(save.stats.holesDug).toBe(0);
    expect(save.field?.targets).toEqual([]);
    expect(save.field?.holes).toEqual([]);
    expect(save.adventures).toEqual({});
    expect(save.settings.sound).toBe(true);
    expect(save.flags.seenIntro).toBe(false);
  });

  it('loads an old save saved before examined/assembled existed without crashing', () => {
    // Simulates a save.v1 written by a build that pre-dates the assembly system.
    const oldSave = {
      version: 1,
      discoveries: [],
      clues: [],
      chainsComplete: [],
      unlockedLocations: ['loc_old_park'],
      detectorId: 'det_starter',
      ownedEquipment: ['det_starter'],
      money: 0,
      field: null,
      adventures: {},
      settings: { sound: true, haptics: true },
      flags: { seenIntro: true, tutorialFound: true },
      // no `examined`, no `assembled`
    };
    const save = sanitize(oldSave);
    expect(save.examined).toEqual([]);
    expect(save.assembled).toEqual([]);
  });

  it('always keeps the starting kit and locations available', () => {
    const save = sanitize({ version: 1, ownedEquipment: [], unlockedLocations: [] });
    expect(save.ownedEquipment).toContain('det_starter');
    expect(save.ownedEquipment).toContain('tool_scoop');
    expect(save.ownedEquipment).toContain('tool_brush');
    expect(save.unlockedLocations).toContain('loc_old_park');
  });

  it('drops a field with no location rather than half-loading it', () => {
    expect(sanitize({ version: 1, field: { seed: 1 } }).field).toBeNull();
    expect(sanitize({ version: 1, field: 'nope' }).field).toBeNull();
  });

  it('survives a storage that throws on every call', () => {
    const hostile: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    const result = loadSave(hostile);
    expect(result.outcome).toBe('new');
    expect(writeSave(freshSave(), hostile)).toBe(false);
    expect(() => clearSave(hostile)).not.toThrow();
  });

  it('runs versions through the migration chain', () => {
    const { raw, migrated } = migrate({ version: SAVE_VERSION, money: 5 });
    expect(migrated).toBe(false);
    expect(raw.money).toBe(5);
  });

  it('caps runaway history so a save cannot grow without bound', () => {
    const holes = Array.from({ length: 300 }, (_, i) => ({ x: i, y: i, found: false }));
    const save = sanitize({
      version: 1,
      field: { locationId: 'loc_old_park', targets: [], holes },
    });
    expect(save.field!.holes.length).toBeLessThanOrEqual(64);
  });
});
