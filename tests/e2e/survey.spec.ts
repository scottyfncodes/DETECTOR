import { expect, test } from '@playwright/test';
import { readDetectorFrame, readExploreFrame, readSave } from './helpers';

/**
 * The Surveyor's trail, end to end at the systems boundary: holding page
 * one and the compass, walking into Old Park ground that was already
 * searched, the ground now has something new in it exactly where the page
 * said — and the heading strip is there to follow the bearing with. Also
 * the OBSERVE half of a landmark: standing at the dead oak and looking.
 */
function seededSave(overrides: Record<string, unknown>) {
  return {
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    discoveries: [
      { uid: 'p1', targetId: 'tgt_field_book_1', condition: 100, depthCm: 0, locationId: 'loc_silent_court', foundAt: 1, value: 10 },
    ],
    clues: ['clue_surveyor_1'],
    chainsComplete: [],
    unlockedLocations: ['loc_old_park', 'loc_old_railway', 'loc_silent_court'],
    detectorId: 'det_starter',
    ownedEquipment: ['det_starter', 'tool_scoop', 'tool_brush', 'tool_compass'],
    money: 0,
    stats: { sweeps: 0, signalsFound: 0, holesDug: 0, emptyHoles: 0, finds: 1, bestCondition: 100 },
    adventures: {},
    settings: { sound: false, haptics: false },
    flags: { seenIntro: true, tutorialFound: true },
    examined: [],
    assembled: [],
    siteProgress: [],
    ...overrides,
  };
}

test('a held page seeds its cache into ground already searched, and the compass is there to follow it', async ({ page }) => {
  // One stray junk target far away keeps this seeded field reusable; the
  // cache itself is NOT in the seed — the game has to put it there.
  await page.addInitScript(
    (save) => {
      if (localStorage.getItem('detector.save.v1')) return;
      localStorage.setItem('detector.save.v1', JSON.stringify(save));
    },
    seededSave({
      field: {
        locationId: 'loc_old_park',
        seed: 4242,
        targets: [{ uid: 'filler', targetId: 'tgt_bottle_cap', x: 1300, y: 1300, depth: 8, baseCondition: 80, dug: false }],
        // Standing a pace south of the spot page one describes, facing north.
        playerX: 556,
        playerY: 700,
        playerYaw: 0,
        holes: [],
        startedAt: 1,
      },
    }),
  );
  await page.goto('./?debug=1');

  // The map draws the page's pencil line and says, in words, that a page points here.
  await expect(page.getByTestId('survey-map')).toBeVisible();
  await expect(page.getByTestId('location-loc_old_park')).toContainText(/a page points here/i);

  await page.getByTestId('location-loc_old_park').click();
  await page.getByTestId('explore-canvas').waitFor();

  const save = (await readSave(page)) as { field: { targets: { targetId: string; cacheId?: string; x: number; y: number }[] } };
  const cache = save.field.targets.find((t) => t.cacheId === 'cache_park_tin');
  expect(cache, 'the cache should have been seeded on entry').toBeDefined();
  expect(cache!.targetId).toBe('tgt_survey_tin');
  expect(cache!.x).toBe(556);

  // The compass strip is on screen because the surveyor's compass is carried.
  await expect(page.getByTestId('compass')).toBeVisible();
  await expect(page.getByTestId('compass')).toContainText(/000°\s*N/);

  // Walk north onto the spot: the detector should hear the tin.
  await page.waitForTimeout(400);
  let best = 0;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const frame = await readDetectorFrame(page);
    if (frame) {
      best = Math.max(best, frame.signal);
      if (frame.dominant === 'cache_cache_park_tin' && frame.signal > 0.45) break;
      if (frame.y < 560) break;
    }
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    await page.keyboard.up('w');
    await page.waitForTimeout(60);
  }
  expect(best, 'the detector should pick up the tin where the page said').toBeGreaterThan(0.3);
});

test('a landmark offers its note once, by looking', async ({ page }) => {
  await page.addInitScript(
    (save) => {
      if (localStorage.getItem('detector.save.v1')) return;
      localStorage.setItem('detector.save.v1', JSON.stringify(save));
    },
    seededSave({
      field: {
        locationId: 'loc_old_park',
        seed: 7,
        targets: [{ uid: 'filler', targetId: 'tgt_bottle_cap', x: 1300, y: 1300, depth: 8, baseCondition: 80, dug: false }],
        // Directly south of the dead oak, facing it.
        playerX: 330,
        playerY: 620,
        playerYaw: 0,
        holes: [],
        startedAt: 1,
      },
    }),
  );
  await page.goto('./?debug=1');
  await page.getByTestId('location-loc_old_park').click();
  await page.getByTestId('explore-canvas').waitFor();

  const deadline = Date.now() + 30_000;
  let prompt: string | null = null;
  while (Date.now() < deadline) {
    const frame = await readExploreFrame(page);
    if (frame?.promptLabel) {
      prompt = frame.promptLabel;
      break;
    }
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.up('w');
  }
  expect(prompt).toBe('Look closer');
  await expect(page.getByTestId('place-chip')).toContainText(/dead oak/i);

  await page.getByTestId('site-interact').click();
  await expect(page.getByTestId('notice')).toContainText(/three short lines/);
  const save = (await readSave(page)) as { siteProgress: string[]; discoveries: unknown[] };
  expect(save.siteProgress).toContain('park_oak_seen');
  // A note is not a find.
  expect(save.discoveries).toHaveLength(1);

  await page.waitForTimeout(300);
  const after = await readExploreFrame(page);
  expect(after?.promptLabel).toBeNull();
});

test('a fresh arrival faces its composed opening view, and the arrival card plays over the world', async ({ page }) => {
  await page.addInitScript(
    (save) => {
      if (localStorage.getItem('detector.save.v1')) return;
      localStorage.setItem('detector.save.v1', JSON.stringify(save));
    },
    seededSave({
      field: {
        locationId: 'loc_old_park',
        seed: 11,
        targets: [{ uid: 'filler', targetId: 'tgt_bottle_cap', x: 1300, y: 1300, depth: 8, baseCondition: 80, dug: false }],
        // No saved facing: this is an arrival, not a return from a dig.
        playerX: 700,
        playerY: 700,
        holes: [],
        startedAt: 1,
      },
    }),
  );
  await page.goto('./?debug=1');
  await page.getByTestId('location-loc_old_park').click();
  await page.getByTestId('explore-canvas').waitFor();

  // The card waits for the world to be drawn, then names the place over it.
  await expect(page.locator('.title-card')).toContainText(/old park/i);
  const frame = await readExploreFrame(page);
  expect(frame).not.toBeNull();
  const bearing = (((frame!.yaw * 180) / Math.PI) % 360 + 360) % 360;
  expect(Math.abs(bearing - 215)).toBeLessThan(2);
  await expect(page.getByTestId('compass')).toContainText(/215°\s*SW/);
});
