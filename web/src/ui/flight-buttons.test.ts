import { describe, expect, it } from 'vitest';
import type { DroneState } from '../net/contract';
import { BUTTONS, buttonStates, REASONS } from './flight-buttons';
import type { ButtonId } from './flight-buttons';

const st = (o: Partial<DroneState>): DroneState => ({
  t: '2026-10-09T00:00:00Z', lat: 26.4897, lon: 74.5511, altMsl: 503, altAgl: 0, headingDeg: 0, pitchDeg: 0, rollDeg: 0,
  groundSpeed: 0, verticalSpeed: 0, batteryPct: 100, mode: 'STABILIZE', armed: false, gpsFix: 6, ...o,
});
const R = REASONS;
const ON = '';
// expected: '' = enabled, otherwise the reason shown
const TABLE: [string, boolean, DroneState | null, Record<ButtonId, string>][] = [
  ['disconnected', false, null, { arm: R.link, disarm: R.link, takeoff: R.link, land: R.link, rtl: R.link, loiter: R.link, altHold: R.link, stabilize: R.link }],
  ['no GPS fix', true, st({ gpsFix: 1 }), { arm: R.gps, disarm: R.disarmed, takeoff: R.gps, land: R.ground, rtl: R.gps, loiter: R.gps, altHold: ON, stabilize: ON }],
  ['disarmed on ground', true, st({}), { arm: ON, disarm: R.disarmed, takeoff: R.armFirst, land: R.ground, rtl: R.flyFirst, loiter: ON, altHold: ON, stabilize: ON }],
  ['armed on ground', true, st({ armed: true, altAgl: 0.1 }), { arm: R.armed, disarm: ON, takeoff: ON, land: R.ground, rtl: R.flyFirst, loiter: ON, altHold: ON, stabilize: ON }],
  ['airborne', true, st({ armed: true, altAgl: 10 }), { arm: R.armed, disarm: ON, takeoff: R.flying, land: ON, rtl: ON, loiter: ON, altHold: ON, stabilize: ON }],
];

describe('flight buttons (P2A.5.3)', () => {
  it.each(TABLE)('%s: enabled flag and reason for every button', (_name, connected, s, want) => {
    const got = buttonStates(connected, s);
    for (const b of BUTTONS) {
      expect({ b, enabled: got[b].enabled, reason: got[b].reason }).toEqual({ b, enabled: want[b] === ON, reason: want[b] });
    }
  });

  it('a connection with no state yet counts as not connected', () => {
    expect(buttonStates(true, null).arm.reason).toBe(R.link);
  });
});
