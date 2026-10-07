/**
 * Turning a find into a permanent record: journal entry, clue, chain
 * completion, unlocks and funds.
 *
 * Two things produce a find: digging one up (resolveDiscovery) and completing
 * an assembly (systems/assembly.ts, via applyDiscoveryRecord below). Both are
 * pure functions of (save, record) so the whole progression step is testable.
 */
import { getClue } from '@/content/clues';
import { getLocation } from '@/content/locations';
import { getTool } from '@/content/equipment';
import type {
  ClueDef,
  DiscoveryRecord,
  LocationDef,
  MysteryChain,
  SaveData,
  TargetDef,
  ToolDef,
} from '@/core/types';
import { newlyCompleted } from './mystery';
import { uid } from '@/core/rng';

export interface ExtractionInput {
  def: TargetDef;
  condition: number;
  depthCm: number;
  locationId: string;
  tutorial?: boolean;
}

export interface DiscoveryOutcome {
  record: DiscoveryRecord;
  def: TargetDef;
  clue: ClueDef | null;
  /** Held clues that share a symbol with the new clue — "wait, that matters". */
  connections: ClueDef[];
  /** Chains completed by this find. */
  chains: MysteryChain[];
  unlockedLocations: LocationDef[];
  unlockedAdventures: string[];
  /** First time this kind of object has ever been found. */
  firstOfKind: boolean;
  fundsGained: number;
  /** A found tool that came with the find (the surveyor's compass). */
  equipmentGained: ToolDef | null;
}

/**
 * How big a moment a discovery is. The contrast matters: a bottle cap gets
 * a glance, a clue gets a held breath, a completed chain gets the room.
 *
 *  minor   — common, no clue: in and out.
 *  notable — a real find, nothing to connect yet.
 *  major   — a clue, a connection, a very rare object, or a new tool.
 *  event   — a chain completes, somewhere unlocks, or a legendary comes up.
 */
export type DiscoveryTier = 'minor' | 'notable' | 'major' | 'event';

export function discoveryTier(outcome: DiscoveryOutcome): DiscoveryTier {
  if (outcome.chains.length || outcome.unlockedLocations.length || outcome.def.rarity === 'legendary') return 'event';
  if (outcome.clue || outcome.connections.length || outcome.def.rarity === 'veryRare' || outcome.equipmentGained) return 'major';
  if (outcome.def.rarity === 'common' && !outcome.firstOfKind) return 'minor';
  if (outcome.def.rarity === 'common' && outcome.def.category === 'junk') return 'minor';
  return 'notable';
}

/**
 * Applies a already-built DiscoveryRecord to a save: adds it to the journal,
 * grants its clue (and reports any symbol connections), resolves newly
 * completed chains and their unlocks, and credits funds. Shared by digging
 * something up and by assembling a composite artifact.
 */
export function applyDiscoveryRecord(
  save: SaveData,
  record: DiscoveryRecord,
  def: TargetDef,
  grantsEquipment?: string,
): { save: SaveData; outcome: DiscoveryOutcome } {
  const firstOfKind = !save.discoveries.some((d) => d.targetId === def.id);
  const tool = grantsEquipment ? getTool(grantsEquipment) ?? null : null;
  const equipmentGained = tool && !save.ownedEquipment.includes(tool.id) ? tool : null;

  const clue = def.clueId ? (getClue(def.clueId) ?? null) : null;
  const isNewClue = !!clue && !save.clues.includes(clue.id);

  // A connection is any other clue the player already holds that shares this
  // one's symbol — the moment two "unrelated" finds turn out not to be.
  const connections =
    isNewClue && clue
      ? save.clues
          .map((id) => getClue(id))
          .filter((c): c is ClueDef => !!c && c.symbol === clue.symbol && c.id !== clue.id)
      : [];

  const clues = isNewClue && clue ? [...save.clues, clue.id] : save.clues;

  const chains = newlyCompleted(clues, save.chainsComplete);
  const unlockedLocations: LocationDef[] = [];
  const unlockedAdventures: string[] = [];
  const unlocked = [...save.unlockedLocations];
  const adventures = { ...save.adventures };

  // A page that names exactly where to stand opens that ground on its own.
  if (isNewClue && clue?.opens && !unlocked.includes(clue.opens)) {
    unlocked.push(clue.opens);
    const loc = getLocation(clue.opens);
    if (loc) unlockedLocations.push(loc);
  }

  for (const chain of chains) {
    if (chain.unlocksLocation && !unlocked.includes(chain.unlocksLocation)) {
      unlocked.push(chain.unlocksLocation);
      const loc = getLocation(chain.unlocksLocation);
      if (loc) unlockedLocations.push(loc);
    }
    if (chain.unlocksAdventure) {
      adventures[chain.unlocksAdventure] = adventures[chain.unlocksAdventure] ?? 'available';
      unlockedAdventures.push(chain.unlocksAdventure);
    }
  }

  const nextSave: SaveData = {
    ...save,
    discoveries: [record, ...save.discoveries].slice(0, 500),
    clues,
    chainsComplete: chains.length ? [...save.chainsComplete, ...chains.map((c) => c.id)] : save.chainsComplete,
    unlockedLocations: unlocked,
    adventures,
    ownedEquipment: equipmentGained ? [...save.ownedEquipment, equipmentGained.id] : save.ownedEquipment,
    money: save.money + record.value,
    stats: {
      ...save.stats,
      finds: save.stats.finds + 1,
      bestCondition: Math.max(save.stats.bestCondition, record.condition),
    },
    flags: {
      ...save.flags,
      tutorialFound: save.flags.tutorialFound || !!record.tutorial,
    },
  };

  return {
    save: nextSave,
    outcome: {
      record,
      def,
      clue: isNewClue ? clue : null,
      connections,
      chains,
      unlockedLocations,
      unlockedAdventures,
      firstOfKind,
      fundsGained: record.value,
      equipmentGained,
    },
  };
}

export function resolveDiscovery(
  save: SaveData,
  input: ExtractionInput,
): { save: SaveData; outcome: DiscoveryOutcome } {
  const { def, locationId } = input;
  const condition = Math.round(Math.max(0, Math.min(100, input.condition)));

  const record: DiscoveryRecord = {
    uid: uid('find'),
    targetId: def.id,
    condition,
    depthCm: Math.round(input.depthCm * 10) / 10,
    locationId,
    foundAt: Date.now(),
    // Condition drives value: a damaged artifact is worth less, always.
    value: Math.round(def.value * (0.35 + 0.65 * (condition / 100))),
    ...(input.tutorial ? { tutorial: true as const } : {}),
  };

  return applyDiscoveryRecord(save, record, def);
}

export interface ObservationInput {
  def: TargetDef;
  locationId: string;
  /** A found tool handed over with the find. */
  grantsEquipment?: string;
}

/**
 * A find that comes from looking rather than digging: a wall carving, a
 * fragment lying in the open. Always pristine and at the surface — there is
 * no excavation step — but it goes through the exact same journal/clue/unlock
 * pipeline as a dug-up target.
 */
export function resolveObservation(
  save: SaveData,
  input: ObservationInput,
): { save: SaveData; outcome: DiscoveryOutcome } {
  const { def, locationId } = input;
  const record: DiscoveryRecord = {
    uid: uid('find'),
    targetId: def.id,
    condition: 100,
    depthCm: 0,
    locationId,
    foundAt: Date.now(),
    value: def.value,
  };
  return applyDiscoveryRecord(save, record, def, input.grantsEquipment);
}

export function conditionLabel(condition: number): string {
  if (condition >= 92) return 'Exceptional';
  if (condition >= 78) return 'Good';
  if (condition >= 60) return 'Fair';
  if (condition >= 40) return 'Worn';
  if (condition >= 20) return 'Poor';
  return 'Damaged';
}
