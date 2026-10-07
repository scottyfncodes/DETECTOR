/**
 * Versioned local save.
 *
 * Two rules drive this file:
 *  1. A corrupt, truncated, or foreign save must never crash the game.
 *  2. The schema has to be able to grow, so every load runs through
 *     migrations and then a field-by-field sanitiser against defaults.
 */
import type { AdventureStatus, DiscoveryRecord, FieldState, GameStats, SaveData } from './types';

export const SAVE_KEY = 'unearth.save.v1';
export const BACKUP_KEY = 'unearth.save.rejected';
export const SAVE_VERSION = 1;

export const DEFAULT_DETECTOR = 'det_starter';

export function freshSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    discoveries: [],
    clues: [],
    chainsComplete: [],
    unlockedLocations: ['loc_old_park', 'loc_old_railway', 'loc_silent_court'],
    detectorId: DEFAULT_DETECTOR,
    ownedEquipment: [DEFAULT_DETECTOR, 'tool_scoop', 'tool_brush'],
    money: 0,
    stats: freshStats(),
    field: null,
    adventures: {},
    settings: { sound: true, haptics: true },
    flags: { seenIntro: false, tutorialFound: false },
    examined: [],
    assembled: [],
    siteProgress: [],
  };
}

export function freshStats(): GameStats {
  return { sweeps: 0, signalsFound: 0, holesDug: 0, emptyHoles: 0, finds: 0, bestCondition: 0 };
}

/** Migrations run in order for any save older than SAVE_VERSION. */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // Example shape for future schema changes:
  // 1: (raw) => ({ ...raw, version: 2, newField: [] }),
};

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

function sanitizeDiscovery(v: unknown, index: number): DiscoveryRecord | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const targetId = str(r.targetId, '');
  if (!targetId) return null;
  return {
    uid: str(r.uid, `rec_${index}`),
    targetId,
    condition: num(r.condition, 100, 0, 100),
    depthCm: num(r.depthCm, 0, 0, 500),
    locationId: str(r.locationId, 'loc_old_park'),
    foundAt: num(r.foundAt, Date.now(), 0),
    value: num(r.value, 0, 0),
    ...(r.tutorial === true ? { tutorial: true as const } : {}),
  };
}

function sanitizeField(v: unknown): FieldState | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const locationId = str(r.locationId, '');
  if (!locationId) return null;
  const rawTargets = Array.isArray(r.targets) ? r.targets : [];
  const targets = rawTargets
    .map((t, i) => {
      if (!t || typeof t !== 'object') return null;
      const tr = t as Record<string, unknown>;
      const targetId = str(tr.targetId, '');
      if (!targetId) return null;
      return {
        uid: str(tr.uid, `tgt_${i}`),
        targetId,
        x: num(tr.x, 0),
        y: num(tr.y, 0),
        depth: num(tr.depth, 10, 0, 500),
        baseCondition: num(tr.baseCondition, 100, 0, 100),
        dug: bool(tr.dug, false),
        ...(tr.tutorial === true ? { tutorial: true as const } : {}),
        ...(typeof tr.cacheId === 'string' && tr.cacheId ? { cacheId: tr.cacheId } : {}),
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const rawHoles = Array.isArray(r.holes) ? r.holes : [];
  const holes = rawHoles
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .map((h) => ({ x: num(h.x, 0), y: num(h.y, 0), found: bool(h.found, false) }))
    .slice(-64);

  return {
    locationId,
    seed: num(r.seed, 1, 0) >>> 0,
    targets,
    playerX: num(r.playerX, 0),
    playerY: num(r.playerY, 0),
    holes,
    startedAt: num(r.startedAt, Date.now(), 0),
  };
}

function sanitizeAdventures(v: unknown): Record<string, AdventureStatus> {
  const out: Record<string, AdventureStatus> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (value === 'locked' || value === 'available' || value === 'complete') out[key] = value;
  }
  return out;
}

/** Coerces anything into a valid SaveData, keeping whatever was salvageable. */
export function sanitize(raw: unknown): SaveData {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const statsRaw = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
  const settingsRaw = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const flagsRaw = (r.flags && typeof r.flags === 'object' ? r.flags : {}) as Record<string, unknown>;

  const discoveries = (Array.isArray(r.discoveries) ? r.discoveries : [])
    .map(sanitizeDiscovery)
    .filter((d): d is DiscoveryRecord => d !== null);

  const unlocked = strArray(r.unlockedLocations);
  for (const id of base.unlockedLocations) if (!unlocked.includes(id)) unlocked.push(id);

  const owned = strArray(r.ownedEquipment);
  for (const id of base.ownedEquipment) if (!owned.includes(id)) owned.push(id);

  return {
    version: SAVE_VERSION,
    createdAt: num(r.createdAt, base.createdAt, 0),
    updatedAt: num(r.updatedAt, base.updatedAt, 0),
    discoveries,
    clues: strArray(r.clues),
    chainsComplete: strArray(r.chainsComplete),
    unlockedLocations: unlocked,
    detectorId: str(r.detectorId, DEFAULT_DETECTOR),
    ownedEquipment: owned,
    money: num(r.money, 0, 0),
    stats: {
      sweeps: num(statsRaw.sweeps, 0, 0),
      signalsFound: num(statsRaw.signalsFound, 0, 0),
      holesDug: num(statsRaw.holesDug, 0, 0),
      emptyHoles: num(statsRaw.emptyHoles, 0, 0),
      finds: num(statsRaw.finds, discoveries.length, 0),
      bestCondition: num(statsRaw.bestCondition, 0, 0, 100),
    },
    field: sanitizeField(r.field),
    adventures: sanitizeAdventures(r.adventures),
    settings: {
      sound: bool(settingsRaw.sound, true),
      haptics: bool(settingsRaw.haptics, true),
    },
    flags: {
      seenIntro: bool(flagsRaw.seenIntro, false),
      tutorialFound: bool(flagsRaw.tutorialFound, false),
    },
    examined: strArray(r.examined),
    assembled: strArray(r.assembled),
    siteProgress: strArray(r.siteProgress),
  };
}

export interface LoadResult {
  save: SaveData;
  /** 'new' | 'loaded' | 'migrated' | 'recovered' — surfaced for tests & debugging. */
  outcome: 'new' | 'loaded' | 'migrated' | 'recovered';
}

export function migrate(raw: Record<string, unknown>): { raw: Record<string, unknown>; migrated: boolean } {
  let current = raw;
  let migrated = false;
  let version = typeof current.version === 'number' ? current.version : 0;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    current = step(current);
    migrated = true;
    version = typeof current.version === 'number' ? current.version : version + 1;
  }
  return { raw: current, migrated };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

let fallbackStore: StorageLike | null = null;

/** localStorage, or an in-memory stand-in in private mode / SSR / tests. */
export function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__unearth_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    /* storage blocked — fall through */
  }
  if (!fallbackStore) fallbackStore = memoryStorage();
  return fallbackStore;
}

export function loadSave(storage: StorageLike = defaultStorage()): LoadResult {
  let text: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { save: freshSave(), outcome: 'new' };
  }
  if (!text) return { save: freshSave(), outcome: 'new' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    keepRejected(storage, text);
    return { save: freshSave(), outcome: 'recovered' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    keepRejected(storage, text);
    return { save: freshSave(), outcome: 'recovered' };
  }

  const raw = parsed as Record<string, unknown>;
  const version = typeof raw.version === 'number' ? raw.version : 0;

  // A save from a future build: don't guess at its shape, park it and start clean.
  if (version > SAVE_VERSION) {
    keepRejected(storage, text);
    return { save: freshSave(), outcome: 'recovered' };
  }

  const { raw: migratedRaw, migrated } = migrate(raw);
  const save = sanitize(migratedRaw);
  return { save, outcome: migrated ? 'migrated' : 'loaded' };
}

function keepRejected(storage: StorageLike, text: string): void {
  try {
    storage.setItem(BACKUP_KEY, text.slice(0, 100_000));
  } catch {
    /* nothing else to do */
  }
}

export function writeSave(save: SaveData, storage: StorageLike = defaultStorage()): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...save, updatedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: StorageLike = defaultStorage()): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
