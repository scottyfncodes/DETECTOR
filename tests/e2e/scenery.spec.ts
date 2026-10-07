import { expect, test } from '@playwright/test';

/**
 * The OBSERVE half of a detecting field: a fixed surface detail, found by
 * walking up and looking rather than sweeping. Spawn sits dead ahead of the
 * clue (same x) so this exercises the real first-person walk/prompt/discover
 * pipeline without depending on this environment's imprecise synthetic
 * turning.
 */
test('a field scenery clue is found by looking, not digging', async ({ page }) => {
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
        unlockedLocations: ['loc_old_park', 'loc_old_railway'],
        detectorId: 'det_starter',
        ownedEquipment: ['det_starter', 'tool_scoop', 'tool_brush'],
        money: 0,
        stats: { sweeps: 0, signalsFound: 0, holesDug: 0, emptyHoles: 0, finds: 0, bestCondition: 0 },
        // enterLocation only reuses a seeded field (rather than generating a
        // fresh, randomly-spawned one) when it still has an undug target, so
        // this keeps one far away from both spawn and the marker.
        field: {
          locationId: 'loc_old_park',
          seed: 99,
          targets: [{ uid: 'filler', targetId: 'tgt_bottle_cap', x: 1300, y: 100, depth: 8, baseCondition: 80, dug: false }],
          playerX: 1150,
          playerY: 1380,
          playerYaw: 0,
          holes: [],
          startedAt: 1,
        },
        adventures: {},
        settings: { sound: false, haptics: false },
        flags: { seenIntro: true, tutorialFound: true },
        examined: [],
        assembled: [],
        siteProgress: [],
      }),
    );
  });

  await page.goto('./?debug=1');
  await page.getByTestId('location-loc_old_park').click();
  await page.getByTestId('explore-canvas').waitFor();

  const readPromptLabel = () =>
    page.evaluate(() => {
      const hook = (window as unknown as { __detector?: { frames: { explore?: { promptLabel: string | null } } } })
        .__detector;
      return hook?.frames.explore?.promptLabel ?? null;
    });

  const deadline = Date.now() + 45_000;
  let prompted = false;
  while (Date.now() < deadline) {
    if ((await readPromptLabel()) === 'Look closer') {
      prompted = true;
      break;
    }
    await page.keyboard.down('w');
    await page.waitForTimeout(600);
    await page.keyboard.up('w');
  }
  expect(prompted, 'walking straight ahead should bring the marker into range').toBe(true);

  await page.getByTestId('site-interact').click();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('discovery-name')).toBeVisible();

  const save = await page.evaluate(() => {
    const hook = (window as unknown as { __detector?: { state: () => { save: { discoveries: { targetId: string }[] } } } })
      .__detector;
    return hook?.state().save ?? null;
  });
  expect(save?.discoveries.some((d) => d.targetId === 'tgt_park_marker')).toBe(true);
});
