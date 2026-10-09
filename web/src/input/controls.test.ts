import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkControlInput } from '../net/contract';
import type { ControlInput } from '../net/contract';
import { AXES, BEGINNER_LIMIT, shape, startEmitter, Sticks, throttleOut } from './controls';

describe('control layer (P2A.5.1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const run = (s: Sticks, ms: number): ControlInput[] => {
    const out: ControlInput[] = [];
    const stop = startEmitter(s, (c) => out.push(c));
    vi.advanceTimersByTime(ms);
    stop();
    return out;
  };

  it('ramps up at 2.5 per second while held and returns to centre at 4 per second (+/- 0.02)', () => {
    const s = new Sticks();
    s.beginner = false;
    s.push.forward = 1;
    run(s, 200);
    expect(s.pos.forward).toBeCloseTo(0.5, 1);
    expect(Math.abs(s.pos.forward - 0.5)).toBeLessThanOrEqual(0.02);
    s.push.forward = 0;
    run(s, 120); // whole ticks (3 x 40 ms): 0.5 - 4 x 0.12
    expect(Math.abs(s.pos.forward - 0.02)).toBeLessThanOrEqual(0.02);
    run(s, 100);
    expect(s.pos.forward).toBe(0); // stops at centre, does not overshoot
  });

  it('beginner mode caps deflection at 0.6; normal mode reaches 1', () => {
    const s = new Sticks();
    s.push.right = 1;
    s.push.yaw = -1;
    run(s, 2000);
    expect(s.pos.right).toBeCloseTo(BEGINNER_LIMIT, 6);
    expect(s.pos.yaw).toBeCloseTo(-BEGINNER_LIMIT, 6);
    expect(Math.abs(s.output().roll)).toBeLessThanOrEqual(BEGINNER_LIMIT);
    s.beginner = false;
    run(s, 2000);
    expect(s.pos.right).toBe(1);
  });

  it('the expo curve is monotonic and never larger than its input', () => {
    let prev = -Infinity;
    for (let x = -1; x <= 1.0001; x += 0.001) {
      const y = shape(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(Math.abs(y)).toBeLessThanOrEqual(Math.abs(x) + 1e-12);
      prev = y;
    }
    expect(shape(1)).toBe(1);
    expect(shape(-1)).toBe(-1);
  });

  it('the deadzone zeroes small inputs', () => {
    expect(shape(0.04)).toBe(0);
    expect(shape(-0.049)).toBe(0);
    expect(shape(0.06)).toBeGreaterThan(0);
  });

  it('outputs stay inside -1..1 and throttle inside 0..1, whatever is held', () => {
    const s = new Sticks();
    s.beginner = false;
    for (const [push] of [[1], [-1]] as const) {
      for (const k of AXES) s.push[k] = push;
      for (const c of run(s, 1500)) {
        expect(checkControlInput(c)).toBeNull();
        expect(c.throttle).toBeGreaterThanOrEqual(0);
        expect(c.throttle).toBeLessThanOrEqual(1);
      }
    }
  });

  it('forward is negative pitch, right is positive roll, throttle centre is 0.5', () => {
    const s = new Sticks();
    expect(s.output()).toEqual({ throttle: 0.5, yaw: 0, pitch: -0, roll: 0 });
    s.pos.forward = 1;
    s.pos.right = 1;
    expect(s.output().pitch).toBe(-1);
    expect(s.output().roll).toBe(1);
  });

  it('Esc releases every stick to centre at once', () => {
    const s = new Sticks();
    for (const k of AXES) s.push[k] = 1;
    run(s, 500);
    s.release();
    expect(Object.values(s.pos).every((v) => v === 0)).toBe(true);
  });

  it('the emitter ticks 25 times a second (+/- 1) over 2 s', () => {
    const n = run(new Sticks(), 2000).length;
    expect(Math.abs(n / 2 - 25)).toBeLessThanOrEqual(1);
  });
});

describe('throttle sent (P3.3.3 finding)', () => {
  const st = (armed: boolean, altAgl: number) => ({ armed, altAgl }) as never;
  it('is 0 while disarmed, and on the ground unless pushed above centre', () => {
    expect(throttleOut(0.9, st(false, 0))).toBe(0);
    expect(throttleOut(0.5, st(true, 0.1))).toBe(0);
    expect(throttleOut(0.7, st(true, 0.1))).toBe(0.7);
    expect(throttleOut(0.5, st(true, 10))).toBe(0.5);
    expect(throttleOut(0.5, null)).toBe(0);
  });
});
