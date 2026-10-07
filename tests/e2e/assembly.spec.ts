import { expect, test } from '@playwright/test';
import { readSave } from './helpers';

/**
 * The tablet-assembly thread: three ordinary-looking shards, found in the two
 * starting locations, turn out to be one object. This seeds a save with all
 * three shards already dug up (finding them for real is exercised by the
 * placement/detection unit tests and the core-loop e2e) and plays the
 * assembly → unlock → puzzle → reward sequence for real.
 */
function shardRecord(targetId: string, uid: string) {
  return {
    uid,
    targetId,
    condition: 88,
    depthCm: 12,
    locationId: 'loc_old_park',
    foundAt: 1000,
    value: 7,
  };
}

const SEEDED_SAVE = {
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  discoveries: [
    shardRecord('tgt_shard_a', 'f1'),
    shardRecord('tgt_shard_b', 'f2'),
    shardRecord('tgt_shard_c', 'f3'),
  ],
  clues: ['clue_shard_a', 'clue_shard_b', 'clue_shard_c'],
  chainsComplete: ['chain_tablet'],
  unlockedLocations: ['loc_old_park', 'loc_old_railway'],
  detectorId: 'det_starter',
  ownedEquipment: ['det_starter', 'tool_scoop', 'tool_brush'],
  money: 0,
  stats: { sweeps: 0, signalsFound: 0, holesDug: 3, emptyHoles: 0, finds: 3, bestCondition: 88 },
  field: null,
  adventures: {},
  settings: { sound: false, haptics: false },
  flags: { seenIntro: true, tutorialFound: true },
  examined: [],
  assembled: [],
};

test.describe('assembling The Bound Tablet', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((save) => {
      if (!localStorage.getItem('detector.save.v1')) {
        localStorage.setItem('detector.save.v1', JSON.stringify(save));
      }
    }, SEEDED_SAVE);
    await page.goto('./?debug=1');
  });

  test('shows the "these belong together" moment, assembles, and unlocks the courtyard', async ({
    page,
  }) => {
    // The Journal reflects the seeded shard discoveries and the completed chain.
    await page.getByRole('button', { name: /journal/i }).first().click();
    await expect(page.getByTestId('journal-entry')).toHaveCount(3);

    await page.getByTestId('tab-assemble').click();
    const row = page.getByTestId('assembly-row');
    await expect(row).toBeVisible();
    await expect(row).toContainText('3/3');

    const assembleBtn = page.getByTestId('assemble-tgt_bound_tablet');
    await expect(assembleBtn).toBeVisible();
    await assembleBtn.click();

    // Assembly reuses the ordinary discovery ceremony.
    await expect(page.getByTestId('discovery-screen')).toBeVisible();
    await expect(page.getByTestId('discovery-name')).toHaveText(/bound tablet/i);
    // The chain completion + unlock banners fire in the same event.
    await expect(page.getByTestId('chain-banner')).toBeVisible();
    await expect(page.getByTestId('unlock-banner')).toContainText(/overgrown courtyard/i);

    const save = (await readSave(page)) as {
      discoveries: { targetId: string }[];
      assembled: string[];
      unlockedLocations: string[];
      clues: string[];
    };
    expect(save.assembled).toContain('tgt_bound_tablet');
    expect(save.discoveries.some((d) => d.targetId === 'tgt_bound_tablet')).toBe(true);
    expect(save.unlockedLocations).toContain('loc_courtyard');
    expect(save.clues).toContain('clue_tablet_assembled');

    // Back to the map: the courtyard is now a real, enterable card.
    await page.getByRole('button', { name: /back to the map/i }).click();
    await expect(page.getByTestId('location-loc_courtyard')).toBeVisible();
  });

  test('a piece thumbnail opens that piece\'s journal entry', async ({ page }) => {
    await page.getByRole('button', { name: /journal/i }).first().click();
    await page.getByTestId('tab-assemble').click();
    await page.getByTestId('piece-tgt_shard_a').click();
    await expect(page.getByRole('heading', { name: /carved shard|clay fragment/i })).toBeVisible();
  });
});

test.describe('the overgrown courtyard', () => {
  test.beforeEach(async ({ page }) => {
    const unlockedSave = {
      ...SEEDED_SAVE,
      discoveries: [
        ...SEEDED_SAVE.discoveries,
        {
          uid: 'f4',
          targetId: 'tgt_bound_tablet',
          condition: 88,
          depthCm: 0,
          locationId: 'loc_old_park',
          foundAt: 2000,
          value: 200,
        },
      ],
      clues: [...SEEDED_SAVE.clues, 'clue_tablet_assembled'],
      chainsComplete: [...SEEDED_SAVE.chainsComplete, 'chain_tablet_bound'],
      unlockedLocations: [...SEEDED_SAVE.unlockedLocations, 'loc_courtyard'],
      assembled: ['tgt_bound_tablet'],
    };
    await page.addInitScript((save) => {
      if (!localStorage.getItem('detector.save.v1')) {
        localStorage.setItem('detector.save.v1', JSON.stringify(save));
      }
    }, unlockedSave);
    await page.goto('./?debug=1');
  });

  test('a puzzle-only adventure: no mechanism, no escape, straight to the reward', async ({
    page,
  }) => {
    await page.getByTestId('location-loc_courtyard').click();
    await expect(page.getByRole('heading', { name: 'The Overgrown Courtyard' })).toBeVisible();
    await page.getByTestId('adventure-continue').click();
    await expect(page.getByRole('heading', { name: 'The Walls' })).toBeVisible();
    await page.getByRole('button', { name: /look at the flagstones/i }).click();
    await expect(page.getByRole('heading', { name: 'The Flagstones' })).toBeVisible();
    await page.getByRole('button', { name: /turn the stones/i }).click();

    // solution [0, 4, 2, 6], start [3, 1, 7, 5], 8 positions per dial.
    const clicks = [5, 3, 3, 1];
    for (let dial = 0; dial < clicks.length; dial++) {
      for (let turn = 0; turn < clicks[dial]!; turn++) {
        await page.getByTestId(`dial-${dial}`).click();
      }
    }
    await expect(page.getByTestId('puzzle-continue')).toBeVisible();
    await page.getByTestId('puzzle-continue').click();

    // No mechanism canvas, no escape — straight through to the outro.
    await expect(page.getByTestId('mechanism-canvas')).toHaveCount(0);
    await expect(page.getByTestId('escape-action')).toHaveCount(0);
    await expect(page.getByTestId('adventure-continue')).toBeVisible();
    await page.getByTestId('adventure-continue').click();

    await expect(page.getByTestId('discovery-screen')).toBeVisible();
    await expect(page.getByTestId('discovery-name')).toHaveText(/woven idol/i);

    const save = (await readSave(page)) as {
      discoveries: { targetId: string; condition: number }[];
      adventures: Record<string, string>;
      clues: string[];
    };
    expect(save.discoveries[0]!.targetId).toBe('tgt_courtyard_idol');
    expect(save.discoveries[0]!.condition).toBeGreaterThan(80);
    expect(save.adventures.adv_courtyard).toBe('complete');
    expect(save.clues).toContain('clue_courtyard');

    // The two "Woven Knot" threads (tablet + courtyard) now connect in the journal.
    // "View in journal" opens straight to the new find's own entry by design,
    // so close that sheet before switching to the Links tab underneath it.
    await page.getByRole('button', { name: /view in journal/i }).click();
    await page.getByRole('button', { name: /^close$/i }).click();
    await page.getByTestId('tab-connections').click();
    await expect(page.getByText(/woven knot/i).first()).toBeVisible();
  });
});
