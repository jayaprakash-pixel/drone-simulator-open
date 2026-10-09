import { describe, expect, it } from 'vitest';
import type { DroneState } from '../net/contract';
import { summarise, summaryText } from './summary';

// hand-made log: 100 m north per second, 3 legs; 1 degree of latitude = 6371008.8 * pi / 180 = 111194.93 m
const DEG = 100 / 111_194.93;
const s = (i: number, o: Partial<DroneState>): DroneState => ({
  t: `2026-10-09T10:00:0${i}.000Z`, lat: 26 + i * DEG, lon: 74, altMsl: 520, altAgl: 20, headingDeg: 0, pitchDeg: 0, rollDeg: 0,
  groundSpeed: 5, verticalSpeed: 0, batteryPct: 90, mode: 'LOITER', armed: true, gpsFix: 6, ...o,
});
const LOG = [
  s(0, { altMsl: 500, altAgl: 0, armed: false, groundSpeed: 0, batteryPct: 100 }), // on the ground
  s(1, { altMsl: 525, altAgl: 25, groundSpeed: 9.5, batteryPct: 97 }),
  s(2, { altMsl: 531, altAgl: 31, groundSpeed: 7, batteryPct: 95 }),
  s(3, { altMsl: 512, altAgl: 12, groundSpeed: 3, batteryPct: 93 }),
];
// real ground: 500 m, but a 506 m ridge under sample 3
const ground = (lat: number) => (lat > 26 + 2.5 * DEG ? 506 : 500);

describe('flight summary (P3.1.3)', () => {
  const sum = summarise(LOG, [{ kind: 'arm' }, { kind: 'fence' }, { kind: 'mode' }, { kind: 'fence' }], ground);

  it('equals hand-computed values', () => {
    expect(sum.durationS).toBe(3); // 10:00:00 to 10:00:03
    expect(sum.distanceM).toBeCloseTo(300, 3); // 3 legs of 100 m
    expect(sum.maxHeightM).toBe(31);
    expect(sum.maxSpeedMs).toBe(9.5);
    expect(sum.lowestClearanceM).toBe(6); // 512 over the 506 m ridge (sample 0 is on the ground, not counted)
    expect(sum.batteryUsedPct).toBe(7); // 100 to 93
    expect(sum.fenceBreaches).toBe(2);
    expect(sum.crashed).toBe(false);
  });

  it('a crash event marks the flight crashed; no terrain gives no clearance', () => {
    const c = summarise(LOG, [{ kind: 'crash' }]);
    expect(c.crashed).toBe(true);
    expect(c.lowestClearanceM).toBeNull();
  });

  it('reads as plain lines', () => {
    expect(summaryText(sum)).toEqual(['Duration 0 min 3 s', 'Distance 300 m', 'Max height 31.0 m above home', 'Max speed 9.5 m/s', 'Lowest clearance above the real ground 6.0 m', 'Battery used 7 %', 'Fence breaches 2', 'No crash']);
  });
});
