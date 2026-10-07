import type { DetectorDef, ToolDef } from '@/core/types';

/**
 * Progression is equipment and knowledge, not experience points.
 * Funds come only from the field value of real finds — junk pays nothing.
 */
export const DETECTORS: DetectorDef[] = [
  {
    id: 'det_starter',
    name: 'Starter Detector',
    tagline: 'Entry-level coil. Honest about metal, vague about everything else.',
    reach: 62,
    depthCapacity: 22,
    discrimination: 0.35,
    stability: 0.45,
    coilWidth: 26,
    price: 0,
  },
  {
    id: 'det_field',
    name: 'Field Detector',
    tagline: 'Deeper ground, steadier tone. The obvious first upgrade.',
    reach: 74,
    depthCapacity: 29,
    discrimination: 0.5,
    stability: 0.62,
    coilWidth: 30,
    price: 140,
  },
  {
    id: 'det_precision',
    name: 'Precision Detector',
    tagline: 'Tight signal envelope. Tells you where, not just whether.',
    reach: 70,
    depthCapacity: 31,
    discrimination: 0.72,
    stability: 0.8,
    coilWidth: 22,
    price: 420,
  },
  {
    id: 'det_deep',
    name: 'Deep Scanner',
    tagline: 'A big coil for deep iron and deeper oddities.',
    reach: 96,
    depthCapacity: 42,
    discrimination: 0.55,
    stability: 0.68,
    coilWidth: 38,
    price: 900,
  },
  {
    id: 'det_advanced',
    name: 'Advanced Detector',
    tagline: 'Depth, discrimination and a tone you can trust.',
    reach: 92,
    depthCapacity: 46,
    discrimination: 0.9,
    stability: 0.92,
    coilWidth: 30,
    price: 1800,
  },
];

export const TOOLS: ToolDef[] = [
  {
    id: 'tool_scoop',
    name: 'Hand Scoop',
    kind: 'scoop',
    tagline: 'Moves dirt fast. Does not care what it hits.',
    power: 1,
    risk: 1,
    radius: 26,
    price: 0,
  },
  {
    id: 'tool_brush',
    name: 'Field Brush',
    kind: 'brush',
    tagline: 'Slow, safe, and the only thing you should use near an edge.',
    power: 0.55,
    risk: 0.012,
    radius: 18,
    price: 0,
  },
  {
    id: 'tool_pick',
    name: 'Precision Pick',
    kind: 'pick',
    tagline: 'Breaks up packed ground in a small area. Sharp end, sharp consequences.',
    power: 1.45,
    risk: 1.35,
    radius: 13,
    price: 70,
  },
  {
    id: 'tool_fine_brush',
    name: 'Fine Sable Brush',
    kind: 'brush',
    tagline: 'Lifts dirt off an artifact without ever touching it hard.',
    power: 0.82,
    risk: 0.004,
    radius: 20,
    price: 160,
  },
  {
    id: 'tool_compass',
    name: "Surveyor's Compass",
    kind: 'compass',
    tagline: 'Found, not bought. Every bearing in your journal is a direction you can now actually walk.',
    power: 0,
    risk: 0,
    radius: 0,
    price: 0,
    found: true,
    reveals: 'Bearings. The heading strip appears at the top of the world while you carry it.',
  },
  {
    id: 'tool_pinpointer',
    name: 'Pinpointer',
    kind: 'pinpointer',
    tagline: 'Handheld probe. In the hole, it tells you which way to dig.',
    power: 0,
    risk: 0,
    radius: 0,
    price: 90,
  },
];

const DETECTOR_INDEX = new Map(DETECTORS.map((d) => [d.id, d]));
const TOOL_INDEX = new Map(TOOLS.map((t) => [t.id, t]));

export function getDetector(id: string): DetectorDef {
  return DETECTOR_INDEX.get(id) ?? DETECTORS[0]!;
}

export function getTool(id: string): ToolDef | undefined {
  return TOOL_INDEX.get(id);
}
