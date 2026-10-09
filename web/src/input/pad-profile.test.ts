import { describe, expect, it } from 'vitest';
import { checkControlInput } from '../net/contract';
import { shape } from './controls';
import { calibrate, defaultProfile, loadProfile, normalise, padSticks, padToControl, saveProfile } from './pad-profile';

// a pad whose axes are not ideal: axis 0 runs -0.93..0.97 resting at 0.02; axis 1 runs -1..0.88 resting at -0.04
const sweep = (): number[][] => {
  const s: number[][] = [];
  for (let i = 0; i <= 200; i++) {
    const t = Math.sin((i / 200) * 4 * Math.PI); // two full sweeps
    s.push([t >= 0 ? 0.02 + t * 0.95 : 0.02 + t * 0.95, t >= 0 ? -0.04 + t * 0.92 : -0.04 + t * 0.96]);
  }
  for (let i = 0; i < 10; i++) s.push([0.02 + (i % 2 ? 0.003 : -0.003), -0.04]); // let go
  return s;
};

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('controller calibration and profiles (P2B.1.2)', () => {
  it('synthetic sweeps give min, max and centre within 0.01', () => {
    const [a0, a1] = calibrate(sweep());
    expect(Math.abs(a0.min - -0.93)).toBeLessThan(0.01);
    expect(Math.abs(a0.max - 0.97)).toBeLessThan(0.01);
    expect(Math.abs(a0.centre - 0.02)).toBeLessThan(0.01);
    expect(Math.abs(a1.min - -1.0)).toBeLessThan(0.01);
    expect(Math.abs(a1.max - 0.88)).toBeLessThan(0.01);
    expect(Math.abs(a1.centre - -0.04)).toBeLessThan(0.01);
  });

  it('after calibration full travel each way is exactly -1 and +1 and rest is 0', () => {
    const [a0] = calibrate(sweep());
    expect(normalise(a0.max, a0)).toBeCloseTo(1, 9);
    expect(normalise(a0.min, a0)).toBeCloseTo(-1, 9);
    expect(normalise(a0.centre, a0)).toBe(0);
  });

  it('the profile is stored under the controller id and loads again for that id only', () => {
    const store = memory();
    const p = defaultProfile('Pad A (Vendor: 045e Product: 02ea)', calibrate(sweep()));
    saveProfile(p, store);
    expect([...store.m.keys()]).toEqual(['dw.pad.Pad A (Vendor: 045e Product: 02ea)']);
    expect(loadProfile('Pad A (Vendor: 045e Product: 02ea)', store)).toEqual(p); // reconnect: loads, no prompt needed
    expect(loadProfile('Pad B', store)).toBeNull(); // another controller: calibrate first
  });

  it('a broken stored profile counts as none', () => {
    const store = memory();
    store.setItem('dw.pad.X', '{not json');
    expect(loadProfile('X', store)).toBeNull();
  });
});

describe('controller output through the shared control layer (P2B.2.1)', () => {
  const cal = [0, 1, 2, 3].map(() => ({ min: -0.95, max: 0.97, centre: 0.01 }));
  const p = defaultProfile('Pad', cal);

  it('noise of +/-0.02 around centre gives exactly 0 on every stick', () => {
    for (let n = -0.02; n <= 0.02001; n += 0.005) {
      const st = padSticks([0.01 + n, 0.01 - n, 0.01 + n, 0.01 - n], p, shape);
      expect(Object.values(st).every((v) => v === 0)).toBe(true);
      expect(padToControl(st)).toEqual({ throttle: 0.5, yaw: 0, pitch: -0, roll: 0 });
    }
  });

  it('full travel reaches -1 and +1 after calibration', () => {
    const max = padSticks([0.97, 0.97, 0.97, 0.97], p, shape);
    const min = padSticks([-0.95, -0.95, -0.95, -0.95], p, shape);
    expect([max.yaw, max.roll, min.throttle, min.pitch]).toEqual([1, 1, 1, 1]); // Y axes: -0.95 is pushed up
    expect([min.yaw, min.roll, max.throttle, max.pitch]).toEqual([-1, -1, -1, -1]);
  });

  it('every output passes the same ControlInput contract check as the keyboard', () => {
    for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, 0, 1]) {
      const c = padToControl(padSticks([a, b, -a, -b], p, shape));
      expect(checkControlInput(c)).toBeNull();
    }
  });
});
