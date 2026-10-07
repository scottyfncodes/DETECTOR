/**
 * First-person site schema.
 *
 * A site is a small, bounded, hand-composed 3D archaeological space. It is
 * still data — everything the 3D engine draws and everything the player can
 * do comes from a SiteDef, the same "content is data" discipline the rest of
 * the game follows. A second site is a new file of this shape plus one line
 * in index.ts, not new engine code.
 */
import type { AmbienceKind } from '@/engine/audio';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Static dressing geometry. Solid props block the player's movement. */
export type PropKind =
  | 'wall'
  | 'column'
  | 'columnBroken'
  | 'rubble'
  | 'rock'
  | 'archway'
  | 'cliff'
  | 'crate'
  | 'stairStep'
  | 'statueBody';

export interface SiteProp {
  id: string;
  kind: PropKind;
  position: Vec3;
  /** Radians. */
  rotationY?: number;
  scale?: [number, number, number];
  /** Defaults to true for every kind except stairStep. */
  solid?: boolean;
}

/** Extra shapes an interactable can render itself as, beyond a PropKind. */
export type InteractableVisual =
  | PropKind
  | 'carving'
  | 'potteryShard'
  | 'handFragment'
  | 'footprints'
  | 'relicPedestal'
  | 'serpentIdol';

export type InteractionKind = 'observe' | 'pickup' | 'fit' | 'notice';

export interface SiteInteractable {
  id: string;
  kind: InteractionKind;
  /** Contextual button label, e.g. "Look closer", "Take it", "Fit the hand". */
  prompt: string;
  position: Vec3;
  /** How close the player must stand, in metres. */
  range: number;
  visual: InteractableVisual;
  rotationY?: number;
  scale?: [number, number, number];
  /** For 'observe' / 'pickup' / 'notice': the TargetDef this grants. */
  targetId?: string;
  /** For 'pickup': a found tool (content/equipment.ts, `found: true`) this also hands over. */
  grantsEquipment?: string;
  /** For 'fit': the target id that must already be discovered to enable this. */
  requiresTargetId?: string;
  /** Interactable only appears/works once this site-progress flag is set. */
  requiresFlag?: string;
  /** Interactable disappears once this site-progress flag is set. */
  hideOnFlag?: string;
  /** On successful use, this flag is added to save.siteProgress. */
  setsFlagOnUse?: string;
  /** Short diegetic line shown over the world on use (not a discovery). */
  flavor?: string;
}

export interface HazardZone {
  id: string;
  /** Centre of the danger area. */
  position: Vec3;
  /** Radius in metres. */
  radius: number;
  /** While this site-progress flag is set, the hazard no longer triggers. */
  disarmedByFlag?: string;
  /** Shown when the player is pushed back out. */
  warning: string;
}

/** A buried, metal-detector-findable object placed at a fixed spot. */
export interface DetectorDig {
  id: string;
  position: Vec3;
  targetId: string;
  depthCm: number;
  baseCondition: number;
}

export interface SiteDef {
  id: string;
  name: string;
  subtitle: string;
  /** Half-extent of the walkable ground, metres, centred at the origin. */
  radius: number;
  skyTop: string;
  skyBottom: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  groundColor: string;
  groundDetail: string;
  ambience: AmbienceKind;
  spawn: Vec3;
  /** Radians; 0 faces -Z. */
  spawnYaw: number;
  props: SiteProp[];
  interactables: SiteInteractable[];
  hazards: HazardZone[];
  detectorDigs: DetectorDig[];
  /** Shown once, briefly, the first time the player enters. */
  intro: string[];
}
