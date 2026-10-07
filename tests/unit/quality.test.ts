import { describe, expect, it } from 'vitest';
import { QUALITY_MAX_LEVEL, QualityGovernor } from '@/engine/quality';

function run(gov: QualityGovernor, dt: number, seconds: number) {
  for (let t = 0; t < seconds; t += dt) gov.sample(dt);
}

describe('QualityGovernor', () => {
  it('leaves a device that holds 60fps alone', () => {
    const levels: number[] = [];
    const gov = new QualityGovernor((l) => levels.push(l));
    run(gov, 1 / 60, 30);
    expect(gov.level).toBe(0);
    expect(levels).toEqual([]);
  });

  it('steps down after sustained slow frames, one level at a time', () => {
    const levels: number[] = [];
    const gov = new QualityGovernor((l) => levels.push(l));
    run(gov, 1 / 20, 3.5);
    expect(levels).toEqual([1]);
    run(gov, 1 / 20, 4);
    expect(levels).toEqual([1, 2]);
  });

  it('never goes past the last level and never steps back up', () => {
    const levels: number[] = [];
    const gov = new QualityGovernor((l) => levels.push(l));
    run(gov, 1 / 15, 30);
    run(gov, 1 / 60, 30);
    expect(gov.level).toBe(QUALITY_MAX_LEVEL);
    expect(levels).toEqual([1, 2]);
  });

  it('ignores a single background-tab hitch', () => {
    const gov = new QualityGovernor(() => {});
    gov.sample(4);
    run(gov, 1 / 60, 5);
    expect(gov.level).toBe(0);
  });
});
