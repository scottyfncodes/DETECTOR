import { expect, test } from '@playwright/test';
import { startNewGame } from './helpers';

test.describe('mobile shell', () => {
  test('no screen scrolls sideways and controls are thumb-sized', async ({ page }) => {
    await page.goto('./?debug=1');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const checkNoOverflow = async (label: string) => {
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `${label} overflows horizontally`).toBeLessThanOrEqual(
        overflow.clientWidth + 1,
      );
    };

    await checkNoOverflow('title');

    // The opening frame is the field itself, the title fits with margins, and
    // the one verb sits in the thumb zone.
    await expect(page.getByTestId('title-world')).toBeVisible();
    const logo = await page.getByRole('heading', { name: 'DETECTOR' }).boundingBox();
    expect(logo!.x, 'title clipped on the left').toBeGreaterThanOrEqual(16);
    expect(logo!.x + logo!.width, 'title clipped on the right').toBeLessThanOrEqual(390 - 16);
    const cta = await page.getByRole('button', { name: /start sweeping/i }).boundingBox();
    expect(cta!.y, 'start button is not in the thumb zone').toBeGreaterThan(844 * 0.6);
    expect(cta!.y + cta!.height, 'start button falls off the screen').toBeLessThanOrEqual(844);
    expect(cta!.height, 'start button is too short').toBeGreaterThanOrEqual(56);
    await expect(page.getByTestId('sound-cue')).toBeVisible();
    await page.getByRole('button', { name: /start sweeping/i }).click();
    await page.getByTestId('explore-canvas').waitFor();
    await checkNoOverflow('detect');

    // Every visible control should be big enough to hit with a thumb.
    for (const testId of ['pinpoint', 'dig']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box!.height, `${testId} is too short`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${testId} is too narrow`).toBeGreaterThanOrEqual(64);
    }

    await page.getByRole('button', { name: /leave/i }).click();
    await checkNoOverflow('map');
    await page.getByRole('button', { name: /journal/i }).first().click();
    await checkNoOverflow('journal');
    await page.getByRole('button', { name: /kit/i }).click();
    await checkNoOverflow('kit');

    // Bottom navigation is reachable and within the viewport.
    const nav = await page.locator('.nav').boundingBox();
    expect(nav!.y + nav!.height).toBeLessThanOrEqual(844 + 1);
  });

  test('the canvas fills the screen and redraws after a resize', async ({ page }) => {
    await startNewGame(page);
    const canvas = page.getByTestId('explore-canvas');
    const before = await canvas.boundingBox();
    expect(before!.width).toBeCloseTo(390, 0);
    expect(before!.height).toBeGreaterThan(700);

    // Landscape: the world view has to keep working.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(400);
    const after = await canvas.boundingBox();
    expect(after!.width).toBeCloseTo(844, 0);
    const painted = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="explore-canvas"]') as HTMLCanvasElement | null;
      if (!el) return 0;
      // Canvas backing store should have been resized to the new box.
      return el.width;
    });
    expect(painted).toBeGreaterThan(844);
  });

  test('the first thing a new player sees tells them what to do', async ({ page }) => {
    await startNewGame(page);
    await expect(page.getByTestId('notice')).toContainText(/picking something up/i);
    await expect(page.getByTestId('hint')).toBeVisible();
    await expect(page.getByTestId('dig')).toBeVisible();
    await expect(page.getByTestId('pinpoint')).toBeVisible();
    // No tutorial wall of text, no modal to dismiss.
    expect(await page.getByRole('dialog').count()).toBe(0);
  });
});
