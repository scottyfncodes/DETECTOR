/**
 * The Silent Court — the first first-person site.
 *
 * A small, walled ruin. Two matching carvings on opposite walls are the
 * game's first "wait, I've seen this" moment that happens entirely on foot:
 * no digging required, just looking. A buried stone hand (found the ordinary
 * way, with the detector) fits an empty socket on the court's broken statue,
 * which opens onto the payoff — a relic that was sitting twelve metres away
 * the whole time. One hazard, unmarked, discovered by getting too close to it
 * rather than by any UI telling you it is there.
 */
import type { SiteDef } from './types';

export const SILENT_COURT: SiteDef = {
  id: 'site_silent_court',
  name: 'The Silent Court',
  subtitle: 'Roofless colonnade, no record of use',
  radius: 17,
  skyTop: '#6f86a3',
  skyBottom: '#d6c79c',
  fogColor: '#aeae8c',
  fogNear: 14,
  fogFar: 60,
  groundColor: '#3a3f2c',
  groundDetail: '#565c3e',
  ambience: 'ruins',
  spawn: { x: 0, y: 0, z: 15.5 },
  spawnYaw: 0,

  intro: [
    'THE SILENT COURT',
    'Four low walls, roofless, holding a square of ground nobody has touched in a long time.',
    'Walk. Look. Some of what matters here only matters once you stop and actually look at it.',
  ],

  props: [
    // Perimeter walls, with a gap on the south side for the entrance.
    { id: 'wall_north', kind: 'wall', position: { x: 0, y: 0, z: -15 }, scale: [3.3, 1, 1] },
    { id: 'wall_west', kind: 'wall', position: { x: -15, y: 0, z: 0 }, rotationY: Math.PI / 2, scale: [3.3, 1, 1] },
    { id: 'wall_east', kind: 'wall', position: { x: 15, y: 0, z: 0 }, rotationY: Math.PI / 2, scale: [3.3, 1, 1] },
    { id: 'wall_south_a', kind: 'wall', position: { x: -8, y: 0, z: 15 }, scale: [1.3, 1, 1] },
    { id: 'wall_south_b', kind: 'wall', position: { x: 8, y: 0, z: 15 }, scale: [1.3, 1, 1] },
    { id: 'entrance_arch', kind: 'archway', position: { x: 0, y: 0, z: 15 } },

    // Corner columns, broken.
    { id: 'col_break_nw', kind: 'columnBroken', position: { x: -10, y: 0, z: -10 } },
    { id: 'col_break_ne', kind: 'columnBroken', position: { x: 10, y: 0, z: -10 } },
    // The flagstone the pedestal comes up through, laid flush, easy to miss.
    { id: 'pedestal_slab', kind: 'stairStep', position: { x: 2.4, y: 0, z: -11.2 }, scale: [0.6, 0.4, 2], solid: false },
    { id: 'col_break_sw', kind: 'columnBroken', position: { x: -10, y: 0, z: 10 } },
    { id: 'col_break_se', kind: 'columnBroken', position: { x: 10, y: 0, z: 10 } },

    // Two columns still standing, flanking the approach to the dais.
    { id: 'col_a', kind: 'column', position: { x: -3, y: 0, z: -6 } },
    { id: 'col_b', kind: 'column', position: { x: 3, y: 0, z: -6 } },

    // Scatter and obstacles.
    { id: 'rubble_a', kind: 'rubble', position: { x: 6, y: 0, z: 4 } },
    { id: 'rubble_b', kind: 'rubble', position: { x: -6, y: 0, z: -3 } },
    { id: 'rubble_c', kind: 'rubble', position: { x: 2, y: 0, z: 9 } },
    { id: 'rock_a', kind: 'rock', position: { x: -12, y: 0, z: 6 } },
    { id: 'rock_b', kind: 'rock', position: { x: 11, y: 0, z: -3 } },

    // A modern supply crate, dropped and left — the "someone else was here" seed.
    { id: 'crate_a', kind: 'crate', position: { x: 4, y: 0, z: 12.5 } },

    // Steps up to the dais. Decorative only — not solid.
    { id: 'step_1', kind: 'stairStep', position: { x: 0, y: 0, z: -1.5 }, solid: false },
    { id: 'step_2', kind: 'stairStep', position: { x: 0, y: 0, z: -2.6 }, solid: false },
    { id: 'step_3', kind: 'stairStep', position: { x: 0, y: 0, z: -3.7 }, solid: false },

    // The statue itself — broken at the wrist, missing whatever it once held.
    { id: 'statue', kind: 'statueBody', position: { x: 0, y: 0, z: -9 } },
  ],

  interactables: [
    {
      id: 'notice_footprints',
      kind: 'notice',
      prompt: 'Look closer',
      position: { x: 3, y: 0, z: 12 },
      range: 2.4,
      visual: 'footprints',
      flavor:
        'Boot prints in the dust, and they are not yours. Someone else has been walking this ground — recently.',
      setsFlagOnUse: 'court_seen_footprints',
      hideOnFlag: 'court_seen_footprints',
    },
    {
      // The "someone else was here" seed, finally picked up: the crate holds
      // their compass and the first page of their field book. The compass is
      // what turns every bearing already written in the journal into a
      // direction you can walk.
      id: 'crate_open',
      kind: 'pickup',
      prompt: 'Open the crate',
      position: { x: 4, y: 0, z: 12.5 },
      range: 2.4,
      visual: 'crate',
      targetId: 'tgt_field_book_1',
      grantsEquipment: 'tool_compass',
      setsFlagOnUse: 'court_crate_opened',
    },
    {
      id: 'carving_west',
      kind: 'observe',
      prompt: 'Look closer',
      position: { x: -13.6, y: 0, z: -2 },
      range: 2.6,
      visual: 'carving',
      rotationY: Math.PI / 2,
      targetId: 'tgt_court_carving_west',
    },
    {
      id: 'carving_east',
      kind: 'observe',
      prompt: 'Look closer',
      position: { x: 13.6, y: 0, z: 2 },
      range: 2.6,
      visual: 'carving',
      rotationY: -Math.PI / 2,
      targetId: 'tgt_court_carving_east',
    },
    {
      id: 'shard_pickup',
      kind: 'pickup',
      prompt: 'Take it',
      position: { x: -6, y: 0, z: 6 },
      range: 2,
      visual: 'potteryShard',
      targetId: 'tgt_court_shard',
    },
    {
      id: 'notice_statue',
      kind: 'notice',
      prompt: 'Look closer',
      position: { x: 0, y: 0, z: -7.6 },
      range: 2.6,
      visual: 'statueBody',
      flavor:
        "The figure's right arm reaches out, ending at a broken wrist. Whatever fit into that hand is gone — but broken things get buried, not destroyed.",
      setsFlagOnUse: 'court_seen_statue',
      hideOnFlag: 'court_seen_statue',
    },
    {
      id: 'hand_socket',
      kind: 'fit',
      prompt: 'Fit the hand',
      position: { x: 0, y: 0, z: -8.6 },
      range: 2.4,
      visual: 'statueBody',
      requiresTargetId: 'tgt_court_hand',
      setsFlagOnUse: 'court_hand_fitted',
      hideOnFlag: 'court_hand_fitted',
      flavor: 'The stone hand settles into the socket. Somewhere ahead, stone grinds against stone.',
    },
    {
      id: 'relic_pedestal',
      kind: 'pickup',
      prompt: 'Take the idol',
      position: { x: 2.4, y: 0, z: -11.2 },
      range: 2.4,
      visual: 'relicPedestal',
      requiresFlag: 'court_hand_fitted',
      targetId: 'tgt_court_relic',
    },
  ],

  hazards: [
    {
      id: 'cistern',
      position: { x: -9, y: 0, z: 3 },
      radius: 2.1,
      warning: 'The ground gives here — a collapsed cistern, hidden under old growth. Stay back from the edge.',
    },
  ],

  detectorDigs: [
    {
      id: 'dig_court_hand',
      position: { x: 4, y: 0, z: -5 },
      targetId: 'tgt_court_hand',
      depthCm: 24,
      baseCondition: 82,
    },
  ],
};
