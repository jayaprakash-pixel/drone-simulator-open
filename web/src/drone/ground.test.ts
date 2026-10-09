import { describe, expect, it } from 'vitest';
import type { DroneState } from '../net/contract';
import { GroundWatch } from './ground';

const HOME = 503;
const st = (o: Partial<DroneState>): DroneState => ({
  t: '2026-10-09T10:00:00.000Z', lat: 26.4897, lon: 74.5511, altMsl: 553, altAgl: 50, headingDeg: 0, pitchDeg: 0, rollDeg: 0,
  groundSpeed: 8, verticalSpeed: 0, batteryPct: 90, mode: 'LOITER', armed: true, gpsFix: 6, ...o,
});

describe('ground contact (P2A.6.2)', () => {
  it('real AGL at or below 0 while flying is a crash, with time, place and speed, reported once', () => {
    const w = new GroundWatch(HOME);
    const r = w.update(st({ altMsl: 600, t: '2026-10-09T10:01:02.000Z', groundSpeed: 7.5, verticalSpeed: -0.2 }), 600.4);
    expect(r.crash).toEqual({ t: '2026-10-09T10:01:02.000Z', lat: 26.4897, lon: 74.5511, altMsl: 600, groundMsl: 600.4, groundSpeed: 7.5, verticalSpeed: -0.2 });
    expect(w.update(st({ altMsl: 590 }), 600).crash).toBeNull(); // frozen: no second crash
    expect(w.crash).not.toBeNull();
  });

  it('real AGL of 0.5 m is not a crash', () => {
    expect(new GroundWatch(HOME).update(st({ altMsl: 600.5 }), 600).crash).toBeNull();
  });

  it('on the ground (not flying) touching the terrain is not a crash', () => {
    const w = new GroundWatch(HOME);
    expect(w.update(st({ armed: false, altAgl: 0, altMsl: 502.9 }), 503).crash).toBeNull();
    expect(w.update(st({ armed: true, altAgl: 0.1, altMsl: 502.9 }), 503).crash).toBeNull(); // armed, still on the ground
  });

  it('no terrain height loaded: no verdict', () => {
    expect(new GroundWatch(HOME).update(st({ altMsl: 100 }), undefined).crash).toBeNull();
  });

  it('flying well below the home height, or over ground well below it, raises the flat-ground warning; it clears', () => {
    const w = new GroundWatch(HOME);
    expect(w.update(st({ altMsl: 490 }), 450).warning).toBe(true); // 13 m below home
    expect(w.update(st({ altMsl: 560 }), 480).warning).toBe(true); // valley 23 m below home
    expect(w.update(st({ altMsl: 560 }), 500).warning).toBe(false);
    expect(w.update(st({ altMsl: 495, armed: false, altAgl: 0 }), 450).warning).toBe(false); // not flying
  });

  it('reset clears the crash for a new place', () => {
    const w = new GroundWatch(HOME);
    w.update(st({ altMsl: 600 }), 601);
    w.reset(708);
    expect(w.crash).toBeNull();
    expect(w.homeMsl).toBe(708);
  });
});
