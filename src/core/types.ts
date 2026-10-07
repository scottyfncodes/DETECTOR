/**
 * UNEARTH — shared content & state types.
 *
 * Nothing in here imports from the UI layer. Content (src/content) is pure
 * data that conforms to these shapes; systems (src/systems) transform it.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'veryRare' | 'legendary';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'veryRare', 'legendary'];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  veryRare: 'Very Rare',
  legendary: 'Legendary',
};

/**
 * Material class drives the detector's tone and how confidently the detector
 * can pre-identify a target before it is dug.
 */
export type MaterialClass =
  | 'ferrous'
  | 'nonFerrous'
  | 'silver'
  | 'gold'
  | 'bronze'
  | 'stone'
  | 'organic'
  | 'unknown';

export type TargetCategory =
  | 'junk'
  | 'coin'
  | 'tool'
  | 'personal'
  | 'jewelry'
  | 'military'
  | 'relic'
  | 'artifact';

export type Significance = 'none' | 'minor' | 'notable' | 'major' | 'unknown';

/** A single findable thing. Purely data — never referenced by name in systems. */
export interface TargetDef {
  id: string;
  name: string;
  category: TargetCategory;
  material: MaterialClass;
  /** Human-facing material string, e.g. "Silver (.900)" or "Unknown alloy". */
  materialName: string;
  rarity: Rarity;
  /** Approximate era shown in the journal. Undefined reads as "Unknown". */
  era?: string;
  /** Burial depth range in centimetres. */
  depth: [number, number];
  /** Relative physical size, 0..1. Bigger targets read from further away. */
  size: number;
  /** Secondary reward. Deliberately small numbers; discovery is the reward. */
  value: number;
  significance: Significance;
  /** 0 = indestructible, 1 = breathe on it wrong and it's gone. */
  fragility: number;
  /** 0..1 — how much dirt/debris sits on top of it. */
  excavationDifficulty: number;
  /** Journal description. */
  description: string;
  /** One-line flavour shown on the discovery card. */
  discoveryText: string;
  /** Discovering this target grants this clue. */
  clueId?: string;
  /** Which silhouette renderer draws it during excavation. */
  silhouette: string;
  /** If set, this target only appears at these locations. */
  locations?: string[];
  /** Authored story targets are never rolled from a random table. */
  authored?: boolean;
  /** Marks first-run teaching content so it can be told apart from real finds. */
  tutorial?: boolean;

  /**
   * Progressive identification. When set, the discovery card and journal show
   * this name instead of `name` until the player examines the entry (opens
   * its journal detail sheet) at least once — "UNKNOWN METAL FRAGMENT" before,
   * the real name after. Absent means the object is identified on sight.
   */
  unidentifiedName?: string;
  /** Extra context revealed only once the player has examined the find. */
  examineText?: string;

  /**
   * Fragment/assembly system. A piece names the composite artifact it belongs
   * to; the composite lists the piece ids it is built from. A composite is
   * never rolled onto a loot table (it has no `locations`) — it is produced
   * by systems/assembly.ts once every piece has been discovered.
   */
  pieceOf?: string;
  /** Set only on a composite target: the piece target ids required to assemble it. */
  assemblyOf?: string[];
}

export interface LocationDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  /** Plot size in centimetres. */
  bounds: { w: number; h: number };
  /** How many targets are seeded per session. */
  targetCount: [number, number];
  /** Weighted loot table. Weights are relative, not percentages. */
  table: { targetId: string; weight: number }[];
  /** Multiplies rolled depth. Older ground buries things deeper. */
  depthBias: number;
  /** 0..1 — how stubborn the dirt is during excavation. */
  hardness: number;
  ground: GroundPalette;
  ambience: 'park' | 'railway' | 'mine' | 'ruins';
  /** Locked locations show as ??? on the map until a mystery unlocks them. */
  lockedBy?: string;
  /** What the map says about it while it is still unknown. */
  lockedHint?: string;
  /** Authored adventure hosted at this location, if any. */
  adventureId?: string;
  /** A first-person 3D site hosted at this location, if any (see content/sites). */
  siteId?: string;
  /**
   * Fixed, always-visible surface details found by looking rather than
   * digging — the OBSERVE half of the field alongside the detector's SEARCH.
   * Most need no gating: walk up, look, done. A few only make sense once
   * you know something (see SceneryClue.requiresClue).
   */
  sceneryClues?: SceneryClue[];
  /**
   * Authored, memorable features of the ground: the dead oak, the signal
   * box, the headframe. They are navigation (a bearing has to be taken
   * FROM somewhere), environmental storytelling (walk up and look closer),
   * and the skeleton the whole field is dressed around.
   */
  landmarks?: LandmarkDef[];
  /**
   * Knowledge-gated buried finds. A cache sits at a fixed spot and is only
   * ever seeded into the ground once the player holds the clue that points
   * at it — the ground has not changed, but what the player knows has.
   */
  caches?: CacheDef[];
  /** Where this place sits on the survey map, 0..1 across the sheet. */
  map: { x: number; y: number };
}

export type LandmarkKind =
  | 'deadOak'
  | 'tree'
  | 'pine'
  | 'bench'
  | 'lampPost'
  | 'ironFence'
  | 'pond'
  | 'path'
  | 'dedicationStone'
  | 'rails'
  | 'bufferStop'
  | 'signalBox'
  | 'waterTower'
  | 'sleeperPile'
  | 'wreckedCart'
  | 'headframe'
  | 'spoilHeap'
  | 'tunnelMouth'
  | 'cliffWall'
  | 'timberFrame'
  | 'boulder';

/** A notice attached to a landmark: look closer, read a line, remember it. */
export interface LandmarkNotice {
  prompt: string;
  text: string;
  /** Added to save.siteProgress on use; the prompt disappears after. */
  flag: string;
  /** Alternate line once the landmark is in its `open` state. */
  openText?: string;
  openFlag?: string;
}

export interface LandmarkDef {
  id: string;
  kind: LandmarkKind;
  /** Position within the plot, centimetres — the same space as PlacedTarget. */
  x: number;
  y: number;
  /** Radians. */
  rotation?: number;
  scale?: number;
  /** Shown in the HUD chip when standing nearby. */
  name?: string;
  notice?: LandmarkNotice;
  /**
   * A landmark can change state once the player knows enough: a boarded
   * adit stands open once either chain is complete. The builder for each
   * kind decides what "open" looks like.
   */
  openWhen?: { chains?: string[]; flags?: string[] };
  /** How close the player must stand for the notice, in metres. */
  range?: number;
}

export interface CacheDef {
  id: string;
  targetId: string;
  x: number;
  y: number;
  depthCm: number;
  baseCondition: number;
  /** The clue that makes this spot worth going to. Seeded only once held. */
  requiresClue: string;
}

/** A surface-level, look-don't-dig find fixed at one spot in a detecting field. */
export interface SceneryClue {
  id: string;
  /** Contextual button label, e.g. "Look closer". */
  prompt: string;
  /** Position within the location's bounds, in centimetres — PlacedTarget's space. */
  x: number;
  y: number;
  /** How close the player must stand, in metres. */
  range: number;
  /** The TargetDef this grants on use — its own `silhouette` draws the in-world sprite. */
  targetId: string;
  /** If set, the clue is not offered (and not drawn) until the player holds this clue. */
  requiresClue?: string;
  /** If set, this clue is drawn as part of that landmark rather than as a standalone sprite. */
  landmarkId?: string;
}

export interface GroundPalette {
  /** Base soil / grass colours, dark to light. */
  base: string;
  mid: string;
  light: string;
  /** Scatter detail colour (grass tufts, gravel, sleepers). */
  detail: string;
  /** Fog / vignette tint at the edge of the plot. */
  haze: string;
  sky: string;
  scatter: 'grass' | 'gravel' | 'rubble';
}

export interface ClueDef {
  id: string;
  chainId: string;
  /** Short symbol name used to visually link clues together. */
  symbol: string;
  title: string;
  text: string;
  /**
   * A clue that names a place, even one the player cannot enter yet. The
   * survey map draws what is known: a pencil line toward it, and where.
   */
  pointsTo?: string;
}

export interface MysteryChain {
  id: string;
  name: string;
  /** Every clue in the chain must be held for the chain to complete. */
  clueIds: string[];
  /** Shown while incomplete. */
  hint: string;
  completeTitle: string;
  completeText: string;
  unlocksLocation?: string;
  unlocksAdventure?: string;
  /** Places this chain ties together, drawn on the map once it completes. */
  links?: string[];
}

export interface DetectorDef {
  id: string;
  name: string;
  tagline: string;
  /** Lateral reach in centimetres where signal falls to ~half. */
  reach: number;
  /** Depth in centimetres beyond which signal drops off hard. */
  depthCapacity: number;
  /** 0..1 — how truthfully the material readout reports. */
  discrimination: number;
  /** 0..1 — higher means less signal noise. */
  stability: number;
  /** Coil width in centimetres — wider sweeps cover more ground per pass. */
  coilWidth: number;
  price: number;
}

export interface ToolDef {
  id: string;
  name: string;
  kind: 'scoop' | 'brush' | 'pick' | 'pinpointer' | 'compass';
  tagline: string;
  /** Dirt removed per unit of drag. */
  power: number;
  /** Multiplies damage dealt on contact with an artifact. */
  risk: number;
  /** Effective radius in excavation pixels. */
  radius: number;
  price: number;
  /** Found in the world, never bought: the kit screen only shows it once held. */
  found?: boolean;
  /** What holding it lets the player read that they could not before. */
  reveals?: string;
}

/** A target that has actually been placed in the ground for this session. */
export interface PlacedTarget {
  uid: string;
  targetId: string;
  /** Position in centimetres within the location bounds. */
  x: number;
  y: number;
  /** Depth in centimetres. */
  depth: number;
  /** Per-instance condition before excavation (ground wear). */
  baseCondition: number;
  dug: boolean;
  tutorial?: boolean;
  /** Set when this target was seeded from a LocationDef cache, not rolled. */
  cacheId?: string;
}

export interface FieldState {
  locationId: string;
  seed: number;
  targets: PlacedTarget[];
  /** Player position in centimetres, persisted so a refresh resumes in place. */
  playerX: number;
  playerY: number;
  /** Holes already dug, so the ground remembers where you've been. */
  holes: { x: number; y: number; found: boolean }[];
  startedAt: number;
}

export interface DiscoveryRecord {
  uid: string;
  targetId: string;
  /** 0..100 */
  condition: number;
  depthCm: number;
  locationId: string;
  foundAt: number;
  value: number;
  /** True when the find came from first-run teaching content. */
  tutorial?: boolean;
}

export interface GameStats {
  sweeps: number;
  signalsFound: number;
  holesDug: number;
  emptyHoles: number;
  finds: number;
  bestCondition: number;
}

export type AdventureStatus = 'locked' | 'available' | 'complete';

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  discoveries: DiscoveryRecord[];
  clues: string[];
  chainsComplete: string[];
  unlockedLocations: string[];
  detectorId: string;
  ownedEquipment: string[];
  money: number;
  stats: GameStats;
  field: FieldState | null;
  adventures: Record<string, AdventureStatus>;
  settings: { sound: boolean; haptics: boolean };
  flags: { seenIntro: boolean; tutorialFound: boolean };
  /** Target ids whose journal entry has been opened at least once. */
  examined: string[];
  /** Composite target ids that have been assembled from their pieces. */
  assembled: string[];
  /**
   * One-off world-state flags for first-person sites (content/sites): a
   * statue's hand fitted, a mechanism triggered, a hazard disarmed. Generic
   * on purpose — a site's own content decides what each flag means.
   */
  siteProgress: string[];
}
