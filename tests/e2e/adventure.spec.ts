import { expect, test } from '@playwright/test';
import { readSave } from './helpers';

/**
 * The adventure sits behind a clue chain that takes a long session to finish,
 * so this seeds a save in the state that chain produces and then plays the
 * authored sequence for real: door puzzle, mechanism, escape, artifact.
 */
const SEEDED_SAVE = {
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  discoveries: [],
  clues: ['clue_badge', 'clue_survey', 'clue_token', 'clue_fragment', 'clue_mechanism'],
  chainsComplete: ['chain_survey', 'chain_sun'],
  unlockedLocations: ['loc_old_park', 'loc_old_railway', 'loc_abandoned_mine', 'loc_sealed_chamber'],
  detectorId: 'det_starter',
  ownedEquipment: ['det_starter', 'tool_scoop', 'tool_brush'],
  money: 0,
  stats: { sweeps: 0, signalsFound: 0, holesDug: 0, emptyHoles: 0, finds: 0, bestCondition: 0 },
  field: null,
  adventures: { adv_sealed_chamber: 'available' },
  settings: { sound: false, haptics: false },
  flags: { seenIntro: true, tutorialFound: true },
};

test.describe('the sealed chamber', () => {
  test.beforeEach(async ({ page }) => {
    // Seed before the app boots. Writing it afterwards and reloading does not
    // work: the game flushes its own save on pagehide and would overwrite it.
    await page.addInitScript((save) => {
      if (!localStorage.getItem('detector.save.v1')) {
        localStorage.setItem('detector.save.v1', JSON.stringify(save));
      }
    }, SEEDED_SAVE);
    await page.goto('./?debug=1');
  });

  test('door puzzle, mechanism, escape, artifact', async ({ page }) => {
    // The chamber is on the map because the clue chain opened it.
    await page.getByTestId('location-loc_sealed_chamber').click();

    // Intro, then the passage, then the door.
    await page.getByTestId('adventure-continue').click();
    await expect(page.getByRole('heading', { name: 'The Cut Passage' })).toBeVisible();
    await page.getByRole('button', { name: /follow the cut passage/i }).click();
    await expect(page.getByRole('heading', { name: 'The Door' })).toBeVisible();
    await page.getByRole('button', { name: /work the rings/i }).click();

    // ── the dial puzzle: three rays, evenly spaced ───────────────────
    await expect(page.getByTestId('puzzle-continue')).toHaveCount(0);
    for (let dial = 0; dial < 3; dial++) {
      for (let turn = 0; turn < 3; turn++) {
        await page.getByTestId(`dial-${dial}`).click();
      }
    }
    await expect(page.getByTestId('puzzle-continue')).toBeVisible();
    await page.getByTestId('puzzle-continue').click();

    // ── the mechanism ────────────────────────────────────────────────
    await expect(page.getByTestId('mechanism-canvas')).toBeVisible();
    await expect(page.getByTestId('tension')).toHaveText('0%');

    // Brush the plate until the numerals are legible.
    const canvas = page.getByTestId('mechanism-canvas');
    const box = (await canvas.boundingBox())!;
    for (let pass = 0; pass < 6; pass++) {
      const y = box.y + box.height * (0.4 + pass * 0.03);
      await page.mouse.move(box.x + box.width * 0.25, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, y, { steps: 14 });
      await page.mouse.up();
    }
    await expect(page.getByText(/release clamp/i)).toBeVisible();

    // Holding the wrong clamp first is punished, so go in order.
    for (const id of ['clamp_a', 'clamp_b', 'clamp_c']) {
      const clamp = page.getByTestId(`clamp-${id}`);
      const clampBox = (await clamp.boundingBox())!;
      await page.mouse.move(clampBox.x + clampBox.width / 2, clampBox.y + clampBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(1900);
      await page.mouse.up();
      await expect(clamp).toBeDisabled();
    }

    await expect(page.getByTestId('lift-artifact')).toBeVisible();
    await page.getByTestId('lift-artifact').click();

    // ── the escape ───────────────────────────────────────────────────
    for (let beat = 0; beat < 4; beat++) {
      const action = page.getByTestId('escape-action');
      await expect(action).toBeVisible();
      await action.click();
      await page.waitForTimeout(1000);
    }

    // ── outro and the artifact ───────────────────────────────────────
    await expect(page.getByTestId('adventure-continue')).toBeVisible();
    await page.getByTestId('adventure-continue').click();

    await expect(page.getByTestId('discovery-screen')).toBeVisible();
    await expect(page.getByTestId('discovery-name')).toHaveText(/three-pointed sun/i);

    const save = (await readSave(page)) as {
      discoveries: { targetId: string; condition: number }[];
      adventures: Record<string, string>;
    };
    expect(save.discoveries[0]!.targetId).toBe('tgt_sun_disc');
    expect(save.discoveries[0]!.condition).toBeGreaterThan(60);
    expect(save.adventures.adv_sealed_chamber).toBe('complete');

    // A completed chamber does not hand out a second artifact.
    await page.getByRole('button', { name: /back to the map/i }).click();
    await page.getByTestId('location-loc_sealed_chamber').click();
    await expect(page.getByText(/already emptied/i)).toBeVisible();
  });

  test('releasing a clamp out of order costs tension and condition', async ({ page }) => {
    await page.getByTestId('location-loc_sealed_chamber').click();
    await page.getByTestId('adventure-continue').click();
    await page.getByRole('button', { name: /follow the cut passage/i }).click();
    await page.getByRole('button', { name: /work the rings/i }).click();
    for (let dial = 0; dial < 3; dial++) {
      for (let turn = 0; turn < 3; turn++) await page.getByTestId(`dial-${dial}`).click();
    }
    await page.getByTestId('puzzle-continue').click();

    await expect(page.getByTestId('tension')).toHaveText('0%');
    const clamp = page.getByTestId('clamp-clamp_c');
    const clampBox = (await clamp.boundingBox())!;
    await page.mouse.move(clampBox.x + clampBox.width / 2, clampBox.y + clampBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1900);
    await page.mouse.up();

    await expect(page.getByTestId('tension')).not.toHaveText('0%');
    await expect(clamp).toBeEnabled();
  });
});
