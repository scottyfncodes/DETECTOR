import { expect, test } from '@playwright/test';
import { approachAndPinpoint, readDetectorFrame, readSave, scrubPit } from './helpers';

/**
 * The core detecting loop, now entirely in first person: walk a real field,
 * sweep, pinpoint, dig, excavate, identify, collect, persist. The single
 * buried target sits directly ahead of a seeded spawn point (same trick used
 * for The Silent Court's e2e coverage) so the walk itself doesn't depend on
 * this environment's imprecise synthetic turning — the pinpoint/dig precision
 * this test actually exists to prove is exercised regardless.
 */
function seededSave(overrides: { field: Record<string, unknown> }) {
  return {
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
    adventures: {},
    settings: { sound: false, haptics: false },
    flags: { seenIntro: true, tutorialFound: false },
    examined: [],
    assembled: [],
    siteProgress: [],
    ...overrides,
  };
}

test.describe('the core loop on a phone', () => {
  test('search, detect, locate, dig, extract, identify, collect, persist', async ({ page }) => {
    const target = { uid: 't1', targetId: 'tgt_tut_penny', x: 700, y: 300, depth: 8, baseCondition: 92, dug: false, tutorial: true };
    // addInitScript re-runs on every reload in this page, including the
    // deliberate one at the end of this test — guard it so a reload doesn't
    // stomp the save the game itself has since written.
    await page.addInitScript(
      (save) => {
        if (localStorage.getItem('detector.save.v1')) return;
        localStorage.setItem('detector.save.v1', JSON.stringify(save));
      },
      seededSave({
        field: {
          locationId: 'loc_old_park',
          seed: 12345,
          targets: [target],
          playerX: 700,
          playerY: 1200,
          playerYaw: 0,
          holes: [],
          startedAt: 1,
        },
      }),
    );
    await page.goto('./?debug=1');
    await page.getByTestId('location-loc_old_park').click();
    await page.getByTestId('explore-canvas').waitFor();
    await expect(page.getByTestId('hint')).toBeVisible();

    // ── walking towards it makes the signal grow ──────────────────────
    const far = await readDetectorFrame(page);
    expect(far!.signal).toBeLessThan(0.5);

    const located = await approachAndPinpoint(page, target);
    expect(located.peak, 'signal should be strong right over the target').toBeGreaterThan(0.5);
    expect(located.offset, 'pinpointing should get close to the real spot').toBeLessThan(45);

    // ── dig ───────────────────────────────────────────────────────────
    await page.getByTestId('dig').click();
    await expect(page.getByTestId('pit-canvas')).toBeVisible();
    await expect(page.getByTestId('dig-readout')).toBeVisible();

    // ── excavate until it can be lifted ───────────────────────────────
    const extract = page.getByTestId('extract');
    await expect(extract).toBeDisabled();
    for (let attempt = 0; attempt < 12 && (await extract.isDisabled()); attempt++) {
      await scrubPit(page, 8);
    }
    await expect(extract).toBeEnabled();
    await extract.click();

    // ── discovery ─────────────────────────────────────────────────────
    await expect(page.getByTestId('discovery-screen')).toBeVisible();
    const name = await page.getByTestId('discovery-name').textContent();
    expect(name?.trim().length).toBeGreaterThan(0);

    // ── collection ────────────────────────────────────────────────────
    await page.getByRole('button', { name: /view in journal/i }).click();
    await expect(page.getByTestId('journal-entry').first()).toBeVisible();
    expect(await page.getByTestId('journal-entry').count()).toBe(1);

    const save = (await readSave(page)) as { discoveries: unknown[]; stats: Record<string, number> };
    expect(save.discoveries).toHaveLength(1);
    expect(save.stats.finds).toBe(1);
    expect(save.stats.holesDug).toBe(1);

    // ── the find survives a reload ────────────────────────────────────
    // A returning player lands on the map rather than the title screen.
    await page.reload();
    await expect(page.getByRole('heading', { name: /field map/i })).toBeVisible();
    await page.getByRole('button', { name: /open field journal/i }).click();
    await expect(page.getByTestId('journal-entry').first()).toBeVisible();
    const reloaded = (await readSave(page)) as { discoveries: { targetId: string }[] };
    expect(reloaded.discoveries).toHaveLength(1);
  });

  test('a hole dug in the wrong place is honestly empty', async ({ page }) => {
    // The only target sits far from spawn; digging without moving guarantees
    // the live coil (with no pinpoint mark to fall back on) is nowhere near it.
    await page.addInitScript(
      (save) => {
        if (localStorage.getItem('detector.save.v1')) return;
        localStorage.setItem('detector.save.v1', JSON.stringify(save));
      },
      seededSave({
        field: {
          locationId: 'loc_old_park',
          seed: 777,
          targets: [{ uid: 't1', targetId: 'tgt_tut_penny', x: 1250, y: 150, depth: 8, baseCondition: 92, dug: false, tutorial: true }],
          playerX: 150,
          playerY: 1250,
          playerYaw: 0,
          holes: [],
          startedAt: 1,
        },
      }),
    );
    await page.goto('./?debug=1');
    await page.getByTestId('location-loc_old_park').click();
    await page.getByTestId('explore-canvas').waitFor();

    const save = (await readSave(page)) as { field: { locationId: string } };
    expect(save.field.locationId).toBe('loc_old_park');

    await page.getByTestId('dig').click();
    await expect(page.getByTestId('pit-canvas')).toBeVisible();
    // No condition readout means there is nothing in this hole.
    await expect(page.getByTestId('dig-readout')).toHaveCount(0);

    for (let attempt = 0; attempt < 8; attempt++) {
      if (await page.getByTestId('empty-hole').isVisible()) break;
      await scrubPit(page, 8);
    }
    await expect(page.getByTestId('empty-hole')).toBeVisible();
    await page.getByTestId('empty-hole').click();
    await expect(page.getByTestId('explore-canvas')).toBeVisible();

    const after = (await readSave(page)) as { stats: Record<string, number>; discoveries: unknown[] };
    expect(after.stats.emptyHoles).toBe(1);
    expect(after.discoveries).toHaveLength(0);
  });
});
