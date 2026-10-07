import type { Page } from '@playwright/test';

export interface FieldTarget {
  uid: string;
  targetId: string;
  x: number;
  y: number;
  depth: number;
  dug: boolean;
  tutorial?: boolean;
}

/** Reads the live game state through the opt-in debug hook. */
export async function readState(page: Page) {
  return page.evaluate(() => {
    const hook = (window as unknown as { __detector?: { state: () => unknown } }).__detector;
    return hook ? (hook.state() as Record<string, unknown>) : null;
  });
}

export async function readSave(page: Page) {
  const state = (await readState(page)) as { save?: Record<string, unknown> } | null;
  return state?.save ?? null;
}

export async function readDetectorFrame(page: Page) {
  return page.evaluate(() => {
    const hook = (window as unknown as { __detector?: { frames: { detector?: unknown } } }).__detector;
    return (hook?.frames.detector ?? null) as {
      x: number;
      y: number;
      coilX: number;
      coilY: number;
      facing: number;
      signal: number;
      pinpointing: boolean;
      dominant: string | null;
    } | null;
  });
}

export async function readExploreFrame(page: Page) {
  return page.evaluate(() => {
    const hook = (window as unknown as { __detector?: { frames: { explore?: unknown } } }).__detector;
    return (hook?.frames.explore ?? null) as { x: number; z: number; yaw: number; promptLabel: string | null } | null;
  });
}

/** Holds a movement key for a burst, the same input path a player's thumb drives. */
async function walkBurst(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(40);
}

/**
 * Walks the 3D player toward a world (x, z) using the real keyboard fallback
 * (WASD/arrows for movement, Q/E to turn) — the same LookController/MoveController
 * path a touch drag drives, just without simulating the drag itself.
 *
 * This environment's synthetic input has a large, fairly fixed round-trip cost
 * per keyboard.down/up pair (measured: a "50ms" hold and a "400ms" hold land
 * within the same few-hundred-ms ballpark), so every burst is floored well
 * above that cost and the yaw tolerance is generous — fine alignment comes
 * from re-checking after every burst, not from any single burst being precise.
 */
export async function walkToSite(page: Page, x: number, z: number, tolerance = 2.2): Promise<number> {
  const deadline = Date.now() + 55_000;
  let distance = Infinity;
  while (Date.now() < deadline) {
    const frame = await readExploreFrame(page);
    if (!frame) break;
    const dx = x - frame.x;
    const dz = z - frame.z;
    distance = Math.hypot(dx, dz);
    if (distance <= tolerance) break;

    const desiredYaw = Math.atan2(dx, -dz);
    let yawDiff = desiredYaw - frame.yaw;
    yawDiff = ((yawDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(yawDiff) > 0.5) {
      await walkBurst(page, yawDiff > 0 ? 'e' : 'q', Math.max(400, Math.min(600, (Math.abs(yawDiff) / 1.9) * 1000)));
      continue;
    }
    await walkBurst(page, 'w', Math.max(400, Math.min(1200, (Math.min(distance, 4) / 2.15) * 1000)));
  }
  return distance;
}

/**
 * The same turn-then-forward approach as walkToSite, but for a detecting
 * field: it reads centimetres from the DetectorFrame (which shares the field's
 * own coordinate space) instead of metres from the ExploreFrame, so it works
 * against the real target/loot-table positions without a metres conversion.
 */
export async function walkFieldTo(page: Page, x: number, y: number, tolerance = 220): Promise<number> {
  const deadline = Date.now() + 70_000;
  let distance = Infinity;
  while (Date.now() < deadline) {
    const frame = await readDetectorFrame(page);
    if (!frame) break;
    const dx = x - frame.x;
    const dy = y - frame.y;
    distance = Math.hypot(dx, dy);
    if (distance <= tolerance) break;

    const desiredYaw = Math.atan2(dx, -dy);
    let yawDiff = desiredYaw - frame.facing;
    yawDiff = ((yawDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(yawDiff) > 0.5) {
      await walkBurst(page, yawDiff > 0 ? 'e' : 'q', Math.max(400, Math.min(600, (Math.abs(yawDiff) / 1.9) * 1000)));
      continue;
    }
    const metres = distance / 100;
    await walkBurst(page, 'w', Math.max(400, Math.min(1200, (Math.min(metres, 4) / 2.15) * 1000)));
  }
  return distance;
}

export async function undugTargets(page: Page): Promise<FieldTarget[]> {
  const save = (await readSave(page)) as { field?: { targets?: FieldTarget[] } } | null;
  return (save?.field?.targets ?? []).filter((t) => !t.dug);
}

/** Presses and holds the PINPOINT control with a real pointer press. */
export async function holdPinpoint(page: Page, down: boolean): Promise<void> {
  const button = page.getByTestId('pinpoint');
  const box = await button.boundingBox();
  if (!box) throw new Error('pinpoint button not found');
  if (down) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  } else {
    await page.mouse.up();
  }
}

export interface PinpointResult {
  /** Best signal seen while closing in. */
  peak: number;
  /** Distance from the marked spot to the real target, in centimetres. */
  offset: number;
}

/**
 * Locates a buried target the way a player does in first person: walk it
 * roughly into range (turn-then-forward, same as walkFieldTo), then hold
 * PINPOINT and creep forward in small steps, watching the coil-to-target
 * offset and stopping at the local minimum — the moment a player would ease
 * off the trigger because the signal just started falling again. Leaves
 * PINPOINT released (which marks the spot) so the caller can press DIG.
 */
export async function approachAndPinpoint(page: Page, target: FieldTarget): Promise<PinpointResult> {
  await walkFieldTo(page, target.x, target.y, 260);

  await holdPinpoint(page, true);
  await page.waitForTimeout(300);

  let peak = 0;
  let best = Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const frame = await readDetectorFrame(page);
    if (!frame) break;
    peak = Math.max(peak, frame.signal);
    const offset = Math.hypot(frame.coilX - target.x, frame.coilY - target.y);
    if (offset < 15 || offset > best + 6) break;
    best = Math.min(best, offset);
    await page.keyboard.down('w');
    await page.waitForTimeout(180);
    await page.keyboard.up('w');
    await page.waitForTimeout(60);
  }

  const frame = await readDetectorFrame(page);
  const finalOffset = frame
    ? Math.hypot(frame.coilX - target.x, frame.coilY - target.y)
    : Number.POSITIVE_INFINITY;
  peak = Math.max(peak, frame?.signal ?? 0);
  await holdPinpoint(page, false);
  return { peak, offset: finalOffset };
}

/** Drags a tool across the pit in a raster, as a finger would. */
export async function scrubPit(page: Page, rows = 7, passes = 1): Promise<void> {
  const canvas = page.getByTestId('pit-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('pit canvas has no box');
  const size = Math.min(box.width - 24, box.height - 24);
  const left = box.x + (box.width - size) / 2;
  const top = box.y + (box.height - size) / 2;

  for (let pass = 0; pass < passes; pass++) {
    for (let row = 0; row < rows; row++) {
      const y = top + ((row + 0.5) / rows) * size;
      const startX = row % 2 === 0 ? left + 4 : left + size - 4;
      const endX = row % 2 === 0 ? left + size - 4 : left + 4;
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(endX, y, { steps: 18 });
      await page.mouse.up();
    }
  }
}

export async function startNewGame(page: Page): Promise<void> {
  await page.goto('./?debug=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /begin/i }).click();
  await page.getByTestId('explore-canvas').waitFor();
}
