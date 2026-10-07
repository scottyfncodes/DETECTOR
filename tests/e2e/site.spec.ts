import { expect, test } from '@playwright/test';
import { readExploreFrame, readSave } from './helpers';

/**
 * The Silent Court — the first first-person site. Confirms the whole new
 * path actually works end to end: entering from the map renders a real WebGL
 * scene, the real movement controls move the player, standing near something
 * offers exactly one contextual prompt, and using it goes through the same
 * journal/clue pipeline as a dig.
 *
 * Walks straight ahead on purpose (spawn already faces the statue dead-on, no
 * turning needed) rather than steering toward an off-axis target: this
 * environment's synthetic keyboard input has enough timing jitter that a
 * precise multi-turn walk is a flaky way to prove the interaction pipeline
 * works, when a dead-ahead walk proves the same wiring far more reliably.
 */
const SHOTS = 'test-results/screens';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('detector.save.v1')) return;
    localStorage.setItem(
      'detector.save.v1',
      JSON.stringify({
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        discoveries: [],
        clues: [],
        chainsComplete: [],
        unlockedLocations: ['loc_old_park', 'loc_old_railway', 'loc_silent_court'],
        detectorId: 'det_starter',
        ownedEquipment: ['det_starter', 'tool_scoop', 'tool_brush'],
        money: 0,
        stats: { sweeps: 0, signalsFound: 0, holesDug: 0, emptyHoles: 0, finds: 0, bestCondition: 0 },
        field: null,
        adventures: {},
        settings: { sound: false, haptics: false },
        flags: { seenIntro: true, tutorialFound: true },
        examined: [],
        assembled: [],
        siteProgress: [],
      }),
    );
  });
});

test('walks in, renders the 3D world, and a dead-ahead notice goes through the site-flag pipeline', async ({
  page,
}) => {
  await page.goto('./?debug=1');
  await page.getByTestId('location-loc_silent_court').click();
  await page.screenshot({ path: `${SHOTS}/30-site-intro.png` });

  await page.getByTestId('explore-begin').click();
  await expect(page.getByTestId('explore-canvas')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/31-site-spawn.png` });

  const spawnFrame = await readExploreFrame(page);
  expect(spawnFrame).toMatchObject({ yaw: 0 });

  // Spawn faces the statue dead-on (dx stays 0 the whole way) — walk straight
  // toward it with the real WASD fallback, no turning required. Each 500ms
  // hold costs roughly 2s of wall-clock in this environment's synthetic
  // input path, and the walk is ~23m at a comfortable human pace, so this
  // needs a generous budget rather than a tight one.
  const deadline = Date.now() + 90_000;
  let promptLabel: string | null = null;
  while (Date.now() < deadline) {
    const frame = await readExploreFrame(page);
    if (frame?.promptLabel) {
      promptLabel = frame.promptLabel;
      break;
    }
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
  }
  expect(promptLabel).toBe('Look closer');
  await page.screenshot({ path: `${SHOTS}/32-site-near-statue.png` });

  const prompt = page.getByTestId('site-interact');
  await expect(prompt).toBeVisible();
  await prompt.click();
  await page.waitForTimeout(200);
  await expect(page.getByTestId('notice')).toContainText('broken wrist');
  await page.screenshot({ path: `${SHOTS}/33-site-statue-notice.png` });

  const save = (await readSave(page)) as { siteProgress?: string[] } | null;
  expect(save?.siteProgress).toContain('court_seen_statue');

  // The prompt should be gone now that this notice has fired once.
  await page.waitForTimeout(300);
  const after = await readExploreFrame(page);
  expect(after?.promptLabel).toBeNull();

  await page.getByRole('button', { name: /^leave$/i }).click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('location-loc_silent_court')).toBeVisible();
});
