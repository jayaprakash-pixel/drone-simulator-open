import { describe, expect, it } from 'vitest';
import { WHITELIST } from '../net/contract';
import { REHEARSAL_NOTICE } from '../ui/layout';
import { fromParamFile, toParamFile } from './params';

describe('parameter profile files (P3.4)', () => {
  it('exports NAME,VALUE lines under the notice and the real-drone header, and reads them back', () => {
    const p = { RTL_ALT_M: 30, WP_SPD: 8.5, FENCE_ACTION: 1 };
    const text = toParamFile(p, new Date('2026-10-09T00:00:00Z'));
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe(`# ${REHEARSAL_NOTICE}`);
    expect(lines[1]).toMatch(/real drone needs its own checks, tuning and calibration/);
    expect(lines.filter((l) => !l.startsWith('#'))).toEqual(['RTL_ALT_M,30', 'WP_SPD,8.5', 'FENCE_ACTION,1']);
    expect(fromParamFile(text)).toEqual({ profile: p, ignored: [] });
  });

  it('never takes a name off the whitelist, nor a value outside its documented range', () => {
    const r = fromParamFile('SIM_WIND_SPD,5\nATC_RAT_RLL_P\t0.1\nFRAME_CLASS 1\nRTL_ALT_M,5000\nWP_SPD,6\n# comment\n');
    expect(r.profile).toEqual({ WP_SPD: 6 });
    expect(r.ignored).toEqual(['SIM_WIND_SPD', 'ATC_RAT_RLL_P', 'FRAME_CLASS', 'RTL_ALT_M']);
    expect(WHITELIST.some((w) => /^(SIM_|ATC_|FRAME_|INS_|COMPASS_|MOT_|BATT_CAPACITY)/.test(w.name))).toBe(false);
  });
});
