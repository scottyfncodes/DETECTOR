import { test } from '@playwright/test';
import { approachAndPinpoint, scrubPit } from './helpers';

/**
 * Not an assertion suite — this walks the game and saves a screenshot of every
 * screen at phone size so the visuals can be reviewed. The detecting field is
 * seeded (same trick core-loop.spec.ts uses) rather than played from a real
 * fresh save: a random tutorial-target position can land far behind the
 * player, and this environment's synthetic turning is slow enough that a
 * worst-case placement can burn the whole test budget on a screenshot tour.
 */
const SHOTS = 'test-results/screens';

test('capture every screen', async ({ page }) => {
  await page.goto('./?debug=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.screenshot({ path: `${SHOTS}/01-title.png` });

  const target = {
    uid: 't1',
    targetId: 'tgt_tut_penny',
    x: 700,
    y: 300,
    depth: 8,
    baseCondition: 92,
    dug: false,
    tutorial: true,
  };
  // Leaving the title screen's page (even just to reload) fires 'pagehide',
  // which persists a fresh save before this next reload's init script runs —
  // so the seed below is unconditional (not "only if nothing saved yet") or
  // that auto-write would always win the race and this seed would never land.
  await page.addInitScript((save) => {
    localStorage.setItem('detector.save.v1', JSON.stringify(save));
  }, {
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
      field: { locationId: 'loc_old_park', seed: 1, targets: [target], playerX: 700, playerY: 1200, playerYaw: 0, holes: [], startedAt: 1 },
      adventures: {},
      settings: { sound: false, haptics: false },
      flags: { seenIntro: true, tutorialFound: false },
      examined: [],
      assembled: [],
      siteProgress: [],
    },
  );
  await page.reload();
  await page.getByTestId('location-loc_old_park').click();
  await page.getByTestId('explore-canvas').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/02-detect-start.png` });

  await approachAndPinpoint(page, target);
  await page.screenshot({ path: `${SHOTS}/03-detect-on-target.png` });

  await page.getByTestId('dig').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/04-pit-untouched.png` });

  await scrubPit(page, 6);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/05-pit-partway.png` });

  const extract = page.getByTestId('extract');
  for (let i = 0; i < 14 && (await extract.isDisabled()); i++) {
    await scrubPit(page, 8);
  }
  await page.screenshot({ path: `${SHOTS}/06-pit-uncovered.png` });

  await extract.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/07-discovery.png` });

  // "View in journal" opens the new find's entry straight away.
  await page.getByRole('button', { name: /view in journal/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/08-journal-detail.png` });
  await page.getByRole('button', { name: /^close$/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/09-journal.png` });

  await page.getByRole('button', { name: /^map$/i }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/10-map.png` });

  await page.getByRole('button', { name: /^kit$/i }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/11-kit.png` });
});

test('capture the adventure', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('detector.save.v1')) return;
    localStorage.setItem(
      'detector.save.v1',
      JSON.stringify({
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        discoveries: [],
        clues: ['clue_badge', 'clue_survey', 'clue_token', 'clue_fragment', 'clue_mechanism'],
        chainsComplete: ['chain_survey', 'chain_sun'],
        unlockedLocations: [
          'loc_old_park',
          'loc_old_railway',
          'loc_abandoned_mine',
          'loc_sealed_chamber',
        ],
        detectorId: 'det_starter',
        ownedEquipment: ['det_starter', 'tool_scoop', 'tool_brush'],
        money: 0,
        stats: { sweeps: 0, signalsFound: 0, holesDug: 0, emptyHoles: 0, finds: 0, bestCondition: 0 },
        field: null,
        adventures: { adv_sealed_chamber: 'available' },
        settings: { sound: false, haptics: false },
        flags: { seenIntro: true, tutorialFound: true },
      }),
    );
  });
  await page.goto('./?debug=1');

  await page.getByTestId('location-loc_sealed_chamber').click();
  await page.screenshot({ path: `${SHOTS}/12-adventure-intro.png` });
  await page.getByTestId('adventure-continue').click();
  await page.screenshot({ path: `${SHOTS}/13-adventure-beat.png` });
  await page.getByRole('button', { name: /follow the cut passage/i }).click();
  await page.getByRole('button', { name: /work the rings/i }).click();
  await page.screenshot({ path: `${SHOTS}/14-puzzle.png` });
  for (let dial = 0; dial < 3; dial++) {
    for (let turn = 0; turn < 3; turn++) await page.getByTestId(`dial-${dial}`).click();
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/15-puzzle-solved.png` });
  await page.getByTestId('puzzle-continue').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/16-mechanism.png` });

  const canvas = page.getByTestId('mechanism-canvas');
  const box = (await canvas.boundingBox())!;
  for (let pass = 0; pass < 6; pass++) {
    const y = box.y + box.height * (0.4 + pass * 0.03);
    await page.mouse.move(box.x + box.width * 0.25, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, y, { steps: 14 });
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/17-mechanism-brushed.png` });

  for (const id of ['clamp_a', 'clamp_b']) {
    const clamp = page.getByTestId(`clamp-${id}`);
    const clampBox = (await clamp.boundingBox())!;
    await page.mouse.move(clampBox.x + clampBox.width / 2, clampBox.y + clampBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1900);
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/18-mechanism-tension.png` });

  const clamp = page.getByTestId('clamp-clamp_c');
  const clampBox = (await clamp.boundingBox())!;
  await page.mouse.move(clampBox.x + clampBox.width / 2, clampBox.y + clampBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/19-mechanism-free.png` });

  await page.getByTestId('lift-artifact').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/20-escape.png` });
  for (let beat = 0; beat < 4; beat++) {
    const action = page.getByTestId('escape-action');
    if (await action.isVisible()) await action.click();
    await page.waitForTimeout(1000);
  }
  await page.getByTestId('adventure-continue').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/21-legendary.png` });
});
