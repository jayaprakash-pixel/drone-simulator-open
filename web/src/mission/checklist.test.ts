import { describe, expect, it } from 'vitest';
import { preflight } from './checklist';
import type { PreflightInput } from './checklist';

const good: PreflightInput = { homeSet: true, gpsFix: 6, batteryPct: 100, wind: { speed: 0, gust: 0 }, routePoints: 5, clearance: { ok: true, highestGroundAboveHome: 40 }, rtlAltM: 60, fenceOn: true };
const status = (x: Partial<PreflightInput>) => Object.fromEntries(preflight({ ...good, ...x }).map((i) => [i.id, i.status]));

// P3.3.5 table: each row changes one input and names the expected status of its item (the rest stay pass)
const TABLE: [string, Partial<PreflightInput>, string, string][] = [
  ['all good', {}, 'home', 'pass'],
  ['no home', { homeSet: false }, 'home', 'fail'],
  ['GPS fix 3', { gpsFix: 3 }, 'gps', 'pass'],
  ['GPS fix 1', { gpsFix: 1 }, 'gps', 'fail'],
  ['GPS unknown', { gpsFix: null }, 'gps', 'fail'],
  ['battery 91', { batteryPct: 91 }, 'battery', 'pass'],
  ['battery 90', { batteryPct: 90 }, 'battery', 'warn'],
  ['battery 30', { batteryPct: 30 }, 'battery', 'warn'],
  ['battery 29', { batteryPct: 29 }, 'battery', 'fail'],
  ['wind breeze 3', { wind: { speed: 3, gust: 0 } }, 'wind', 'pass'],
  ['wind strong 8', { wind: { speed: 8, gust: 0 } }, 'wind', 'warn'],
  ['wind gusty 5+4', { wind: { speed: 5, gust: 4 } }, 'wind', 'warn'],
  ['wind 8+4', { wind: { speed: 8, gust: 4 } }, 'wind', 'fail'],
  ['route clear', {}, 'route', 'pass'],
  ['route flagged', { clearance: { ok: false, highestGroundAboveHome: 120 } }, 'route', 'fail'],
  ['route not checked', { clearance: null }, 'route', 'warn'],
  ['no route', { routePoints: 0, clearance: null, rtlAltM: null }, 'route', 'pass'],
  ['return above ground', {}, 'rtl', 'pass'],
  ['return below ground', { rtlAltM: 30 }, 'rtl', 'fail'],
  ['return height equal to ground', { rtlAltM: 40 }, 'rtl', 'fail'],
  ['return height not read', { rtlAltM: null }, 'rtl', 'warn'],
  ['no route: return height not needed', { routePoints: 0, clearance: null, rtlAltM: null }, 'rtl', 'pass'],
  ['fence on', {}, 'fence', 'pass'],
  ['fence off', { fenceOn: false }, 'fence', 'warn'],
];

describe('pre-flight checklist (P3.3.5)', () => {
  it.each(TABLE)('%s', (_, x, id, want) => expect(status(x)[id]).toBe(want));
  it('changing one input never changes another item', () => {
    for (const [, x, id] of TABLE) {
      const s = status(x);
      for (const [k, v] of Object.entries(s)) if (k !== id && !(id === 'route' && k === 'rtl') && !(id === 'rtl' && k === 'route')) expect([k, v]).toEqual([k, 'pass']);
    }
  });
  it('every item gives a reason', () => expect(preflight({ ...good, homeSet: false, gpsFix: null }).every((i) => i.reason.length > 0)).toBe(true));
});
