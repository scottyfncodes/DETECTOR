/**
 * Procedural target placement.
 *
 * Fields are seeded, so a saved session regenerates identically, but a new
 * session at the same location produces different ground. Authored story
 * targets are never rolled here — they are inserted deliberately.
 */
import { getTarget } from '@/content/targets';
import type { FieldState, LocationDef, PlacedTarget, TargetDef } from '@/core/types';
import { clamp, intRange, mulberry32, range, weightedPick, type Rng } from '@/core/rng';

const MIN_SEPARATION = 155; // cm between targets
const MIN_FROM_START = 130; // cm — never spawn one under the player's boots
const MAX_DEPTH = 55;

export interface PlacementContext {
  /** Clues the player already holds — duplicate clue targets are suppressed. */
  heldClues: string[];
  /** Insert the first-run teaching target. */
  includeTutorial: boolean;
  /** Target ids already in the journal — a found cache is never seeded twice. */
  discovered?: string[];
}

export function generateField(
  location: LocationDef,
  seed: number,
  ctx: PlacementContext,
): FieldState {
  const rng = mulberry32(seed);
  const startX = location.bounds.w / 2;
  const startY = location.bounds.h / 2;

  const pool = buildPool(location, ctx.heldClues);
  const count = intRange(rng, location.targetCount[0], location.targetCount[1]);
  const placed: PlacedTarget[] = [];

  if (ctx.includeTutorial) {
    const def = getTarget('tgt_tut_penny');
    if (def) {
      // Placed at a comfortable walking distance, shallow, and on its own so
      // the very first signal the player hears is unmistakable.
      const angle = rng() * Math.PI * 2;
      const dist = 210;
      placed.push(
        makePlaced(rng, def, startX + Math.cos(angle) * dist, startY + Math.sin(angle) * dist, 1, true),
      );
    }
  }

  let guard = 0;
  while (placed.length < count + (ctx.includeTutorial ? 1 : 0) && guard < 600) {
    guard++;
    const def = weightedPick(rng, pool);
    if (!def) break;
    const spot = findSpot(rng, location, placed, startX, startY);
    if (!spot) continue;
    placed.push(makePlaced(rng, def, spot.x, spot.y, location.depthBias, false));
  }

  ensureSomethingWorthFinding(rng, location, placed, ctx.heldClues);

  const field: FieldState = {
    locationId: location.id,
    seed,
    targets: placed,
    playerX: startX,
    playerY: startY,
    holes: [],
    startedAt: Date.now(),
  };
  seedCaches(field, location, ctx.heldClues, ctx.discovered ?? []);
  return field;
}

/**
 * Knowledge changes the ground. A cache is an authored buried find at a
 * fixed spot that only exists in the field once the player holds the clue
 * pointing at it — so a place already searched clean becomes worth walking
 * again the moment a page names it. Safe to call repeatedly: a cache already
 * seeded, or already in the journal, is left alone. Returns what was added.
 */
export function seedCaches(
  field: FieldState,
  location: LocationDef,
  heldClues: readonly string[],
  discovered: readonly string[],
): PlacedTarget[] {
  const added: PlacedTarget[] = [];
  for (const cache of location.caches ?? []) {
    if (!heldClues.includes(cache.requiresClue)) continue;
    if (discovered.includes(cache.targetId)) continue;
    if (field.targets.some((t) => t.cacheId === cache.id)) continue;
    if (!getTarget(cache.targetId)) continue;
    // Anything rolled onto the cache's spot gives way — the cache was always there.
    field.targets = field.targets.filter(
      (t) => t.cacheId || Math.hypot(t.x - cache.x, t.y - cache.y) >= MIN_SEPARATION * 0.6,
    );
    const placed: PlacedTarget = {
      uid: `cache_${cache.id}`,
      targetId: cache.targetId,
      x: cache.x,
      y: cache.y,
      depth: cache.depthCm,
      baseCondition: cache.baseCondition,
      dug: false,
      cacheId: cache.id,
    };
    field.targets.push(placed);
    added.push(placed);
  }
  return added;
}

function buildPool(
  location: LocationDef,
  heldClues: string[],
): { item: TargetDef; weight: number }[] {
  const pool: { item: TargetDef; weight: number }[] = [];
  for (const entry of location.table) {
    const def = getTarget(entry.targetId);
    if (!def || def.authored || def.tutorial) continue;
    if (def.locations && !def.locations.includes(location.id)) continue;
    let weight = entry.weight;
    // A clue you already hold becomes near-worthless to find again.
    if (def.clueId && heldClues.includes(def.clueId)) weight *= 0.06;
    if (weight <= 0) continue;
    pool.push({ item: def, weight });
  }
  return pool;
}

function findSpot(
  rng: Rng,
  location: LocationDef,
  placed: PlacedTarget[],
  startX: number,
  startY: number,
): { x: number; y: number } | null {
  const margin = 90;
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = range(rng, margin, location.bounds.w - margin);
    const y = range(rng, margin, location.bounds.h - margin);
    if (Math.hypot(x - startX, y - startY) < MIN_FROM_START) continue;
    let ok = true;
    for (const p of placed) {
      if (Math.hypot(x - p.x, y - p.y) < MIN_SEPARATION) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }
  return null;
}

function makePlaced(
  rng: Rng,
  def: TargetDef,
  x: number,
  y: number,
  depthBias: number,
  tutorial: boolean,
): PlacedTarget {
  const depth = clamp(range(rng, def.depth[0], def.depth[1]) * depthBias, 1.5, MAX_DEPTH);
  // Time in the ground costs condition, and fragile things suffer more.
  const wear = def.fragility * range(rng, 4, 26) + range(rng, 0, 7) + depth * 0.15;
  return {
    uid: `t_${Math.floor(rng() * 0xffffffff).toString(36)}_${Math.floor(x)}_${Math.floor(y)}`,
    targetId: def.id,
    x: Math.round(x),
    y: Math.round(y),
    depth: Math.round(depth * 10) / 10,
    baseCondition: Math.round(clamp(100 - wear, 35, 100)),
    dug: false,
    ...(tutorial ? { tutorial: true as const } : {}),
  };
}

/**
 * Junk is the point, but a field of nothing but junk is a bad session.
 * If the roll produced no keepers, upgrade one slot from the location's own
 * non-common entries — still location-appropriate, still random.
 */
function ensureSomethingWorthFinding(
  rng: Rng,
  location: LocationDef,
  placed: PlacedTarget[],
  heldClues: string[],
): void {
  const keepers = placed.filter((p) => {
    const def = getTarget(p.targetId);
    return def && def.rarity !== 'common' && !p.tutorial;
  });
  if (keepers.length >= 1) return;

  const better = buildPool(location, heldClues).filter((e) => e.item.rarity !== 'common');
  if (!better.length) return;
  const swap = placed.find((p) => !p.tutorial);
  if (!swap) return;
  const def = weightedPick(rng, better);
  if (!def) return;
  const replacement = makePlaced(rng, def, swap.x, swap.y, location.depthBias, false);
  Object.assign(swap, replacement, { uid: swap.uid });
}

/** Remaining undug targets — used for "field cleared" messaging. */
export function remainingTargets(field: FieldState): number {
  return field.targets.filter((t) => !t.dug).length;
}
