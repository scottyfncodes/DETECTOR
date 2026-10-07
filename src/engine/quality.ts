/**
 * Keeps the frame rate honest on weaker phones. If frames stay slow for a
 * couple of seconds, step down a level — first the pixel ratio, then the
 * shadows. It never steps back up: a steady 50fps beats a flickering 60.
 */
export const QUALITY_MAX_LEVEL = 2;

/** Frame time above which a frame counts as slow (~34fps). */
const SLOW_FRAME = 1 / 34;
/** Seconds of sustained slowness before stepping down. */
const SLOW_FOR = 2.5;

export class QualityGovernor {
  level = 0;
  private avg = 1 / 60;
  private slowFor = 0;

  constructor(private readonly onLevel: (level: number) => void) {}

  sample(dt: number): void {
    if (this.level >= QUALITY_MAX_LEVEL || !(dt > 0)) return;
    // A tab coming back from the background reports one huge frame; that's
    // not the device being slow.
    const frame = Math.min(dt, 0.25);
    this.avg += (frame - this.avg) * 0.08;
    if (this.avg > SLOW_FRAME) this.slowFor += frame;
    else this.slowFor = Math.max(0, this.slowFor - frame * 0.5);
    if (this.slowFor > SLOW_FOR) {
      this.level++;
      this.slowFor = 0;
      this.avg = 1 / 60;
      this.onLevel(this.level);
    }
  }
}
