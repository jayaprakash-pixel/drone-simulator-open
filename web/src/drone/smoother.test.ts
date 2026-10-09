import { describe, expect, it } from 'vitest';
import { angleDiff, Smoother } from './smoother';
import type { Pose } from './smoother';

const pose = (o: Partial<Pose> = {}): Pose => ({ lat: 26.4897, lon: 74.5511, alt: 500, heading: 0, pitch: 0, roll: 0, ...o });
const FRAME = 1000 / 60;

describe('smoother (P2A.4.1)', () => {
  it('angleDiff takes the short way', () => {
    expect(angleDiff(359, 1)).toBeCloseTo(2);
    expect(angleDiff(1, 359)).toBeCloseTo(-2);
    expect(angleDiff(90, 270)).toBeCloseTo(-180);
  });

  it('heading 359 to 1 degree passes through 0, never the long way round', () => {
    const s = new Smoother();
    s.set(pose({ heading: 359 }));
    s.set(pose({ heading: 1 }));
    for (let i = 0; i < 30; i++) {
      const h = s.step(FRAME)!.heading;
      expect(h >= 359 || h <= 1).toBe(true);
    }
    expect(angleDiff(s.step(FRAME)!.heading, 1)).toBeCloseTo(0, 2);
  });

  it('no overshoot: a step is approached from one side only', () => {
    const s = new Smoother();
    s.set(pose());
    s.set(pose({ alt: 600, roll: 30, heading: 90 }));
    let prev = s.step(0)!;
    for (let i = 0; i < 60; i++) {
      const p = s.step(FRAME)!;
      expect(p.alt).toBeGreaterThanOrEqual(prev.alt);
      expect(p.alt).toBeLessThanOrEqual(600);
      expect(p.roll).toBeLessThanOrEqual(30);
      expect(p.heading).toBeLessThanOrEqual(90);
      prev = p;
    }
  });

  it('catches up within 200 ms after a jump (less than 1 percent of the jump left)', () => {
    const s = new Smoother();
    s.set(pose());
    s.set(pose({ lat: 26.4897 + 100 / 111_195, alt: 600, heading: 180 })); // 100 m north, 100 m up, half a turn
    let p = s.step(0)!;
    for (let t = 0; t < 200; t += FRAME) p = s.step(FRAME)!;
    expect(Math.abs(p.lat - (26.4897 + 100 / 111_195)) * 111_195).toBeLessThan(1);
    expect(600 - p.alt).toBeLessThan(1);
    expect(Math.abs(angleDiff(p.heading, 180))).toBeLessThan(1.8);
    expect(s.moving()).toBe(true); // still easing in the last centimetres
  });

  it('draws the first state where it is', () => {
    const s = new Smoother();
    expect(s.step(FRAME)).toBeNull();
    s.set(pose({ alt: 123 }));
    expect(s.step(FRAME)!.alt).toBe(123);
    expect(s.moving()).toBe(false);
  });
});
