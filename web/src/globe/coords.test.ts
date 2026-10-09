import { describe, expect, it } from 'vitest';
import { Cartesian3 } from 'cesium';
import { M_PER_FT, aboveGround, aglFromMsl, ellipsoidToMsl, formatAltitude, formatDecimal, formatDms, formatLatLon, fromCartesian, geoidHeight, mslToEllipsoid, toCartesian } from './coords';

// EGM96 geoid undulation N (m) from PROJ 9.5.1 with NGA's us_nga_egm96_15 grid (pyproj 3.7.2, EPSG:4979 -> EPSG:9707,
// h = 0), computed 2026-10-08 independently of egm96-universal. Ellipsoid height h = MSL height H + N.
const REF_N = [
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873, n: -49.6881 },
  { name: 'Jaisalmer', lat: 26.9157, lon: 70.9083, n: -45.0992 },
  { name: 'Mount Abu', lat: 24.5926, lon: 72.7156, n: -48.9823 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503, n: 36.923 },
];

describe('WGS84 degrees <-> Cartesian', () => {
  const points: [number, number, number][] = [
    [0, 0, 0],
    [26.9124, 75.7873, 431],
    [-33.8688, 151.2093, 58],
    [89.9, 10, 0],
    [-89.9, -170, 100],
    [0, 179.9999, 10],
    [45, -122.4, 8848],
  ];
  it('round trips within 1 cm', () => {
    for (const [lat, lon, h] of points) {
      const back = fromCartesian(toCartesian(lat, lon, h));
      const err = Cartesian3.distance(toCartesian(back.lat, back.lon, back.hEllipsoid), toCartesian(lat, lon, h));
      expect(err).toBeLessThan(0.01);
      expect(back.lat).toBeCloseTo(lat, 9);
      expect(back.hEllipsoid).toBeCloseTo(h, 2);
    }
  });
  it('takes degrees, not radians (WGS84 anchors)', () => {
    const e = toCartesian(0, 0, 0);
    expect(e.x).toBeCloseTo(6378137, 4);
    expect(e.y).toBeCloseTo(0, 4);
    expect(e.z).toBeCloseTo(0, 4);
    expect(toCartesian(90, 0, 0).z).toBeCloseTo(6356752.314245, 3);
  });
});

describe('ellipsoid / MSL (EGM96)', () => {
  it.each(REF_N)('geoid height at $name is within 2 m of the NGA grid value', ({ lat, lon, n }) => {
    expect(Math.abs(geoidHeight(lat, lon) - n)).toBeLessThan(2);
  });
  it.each(REF_N)('ellipsoid -> MSL at $name uses H = h - N', ({ lat, lon, n }) => {
    expect(Math.abs(ellipsoidToMsl(lat, lon, 380) - (380 - n))).toBeLessThan(2);
  });
  it('is about +50 m over Rajasthan: ignoring the geoid would break the 30 m elevation target', () => {
    // ground near Jaipur is about 430 m MSL, which Cesium reports as about 380 m above the ellipsoid
    expect(ellipsoidToMsl(26.9124, 75.7873, 380.3)).toBeGreaterThan(425);
    expect(ellipsoidToMsl(26.9124, 75.7873, 380.3)).toBeLessThan(435);
  });
  it('round trips MSL -> ellipsoid -> MSL within 1 mm, including negative longitudes', () => {
    for (const { lat, lon } of [...REF_N, { lat: 37.77, lon: -122.42 }]) {
      expect(ellipsoidToMsl(lat, lon, mslToEllipsoid(lat, lon, 430))).toBeCloseTo(430, 3);
    }
  });
});

describe('AGL', () => {
  it('is MSL minus ground MSL', () => {
    expect(aglFromMsl(530, 430)).toBe(100);
  });
  it('does not depend on the geoid when drone and ground share a spot', () => {
    const { lat, lon } = REF_N[0];
    const drone = ellipsoidToMsl(lat, lon, 480.3);
    const ground = ellipsoidToMsl(lat, lon, 380.3);
    expect(aglFromMsl(drone, ground)).toBeCloseTo(100, 6);
  });
  it('Stand here eye: 1.7 m AGL over MSL ground is the ground ellipsoid height + 1.7 m, typed ellipsoid', () => {
    const lat = 19.906844;
    const lon = 83.16979;
    const ground = { m: ellipsoidToMsl(lat, lon, 233.4), type: 'msl' as const };
    expect(aboveGround(lat, lon, ground, { m: 1.7, type: 'agl' })).toEqual({ m: expect.closeTo(235.1, 6), type: 'ellipsoid' });
  });
  it('refuses mixed-up altitude types instead of silently adding them', () => {
    expect(() => aboveGround(0, 0, { m: 10, type: 'ellipsoid' }, { m: 1.7, type: 'agl' })).toThrow(/MSL ground/);
    expect(() => aboveGround(0, 0, { m: 10, type: 'msl' }, { m: 1.7, type: 'msl' })).toThrow(/AGL height/);
  });
});

describe('coordinate formats', () => {
  it('decimal: six places, signs kept', () => {
    expect(formatDecimal(26.9124, 75.7873)).toBe('26.912400, 75.787300');
    expect(formatDecimal(-33.8688, 151.2093)).toBe('-33.868800, 151.209300');
  });
  it('DMS matches hand-computed strings', () => {
    // 26.9124 deg = 26 + 0.9124*60 = 54.744 min = 54 min + 0.744*60 = 44.64 s -> 44.6 s;  75.7873 -> 47.238 min -> 14.28 s -> 14.3 s
    expect(formatDms(26.9124, 75.7873)).toBe('26°54′44.6″N 75°47′14.3″E');
    // 33.8688 -> 52.128 min -> 7.68 s;  151.2093 -> 12.558 min -> 33.48 s
    expect(formatDms(-33.8688, 151.2093)).toBe('33°52′7.7″S 151°12′33.5″E');
    expect(formatDms(0, 0)).toBe('0°0′0.0″N 0°0′0.0″E');
    expect(formatDms(-0.5, -179.5)).toBe('0°30′0.0″S 179°30′0.0″W');
  });
  it('DMS rounding carries into minutes and degrees', () => {
    expect(formatDms(10.9999999, 0)).toBe('11°0′0.0″N 0°0′0.0″E');
    expect(formatDms(0, 59.99999)).toBe('0°0′0.0″N 60°0′0.0″E'); // 59.99999 deg = 59 deg 59 min 59.964 s, which rounds up to 60 deg
  });
  it('picks the format by name', () => {
    expect(formatLatLon(1, 2, 'dec')).toBe('1.000000, 2.000000');
    expect(formatLatLon(1, 2, 'dms')).toBe('1°0′0.0″N 2°0′0.0″E');
  });
});

describe('altitude labels', () => {
  it('always carry the altitude type', () => {
    expect(formatAltitude({ m: 430.2, type: 'msl' })).toBe('430 m MSL');
    expect(formatAltitude({ m: 1720, type: 'msl' })).toBe('1,720 m MSL');
    expect(formatAltitude({ m: 9.84, type: 'agl' })).toBe('9.8 m AGL');
    expect(formatAltitude({ m: 380.3, type: 'ellipsoid' })).toBe('380 m ellipsoid');
    expect(formatAltitude({ m: -3.2, type: 'msl' })).toBe('-3.2 m MSL');
    expect(formatAltitude({ m: -0.04, type: 'agl' })).toBe('0.0 m AGL');
  });
  it('converts to feet exactly (1 m = 3.28084 ft)', () => {
    expect(1 / M_PER_FT).toBeCloseTo(3.28084, 5);
    expect(formatAltitude({ m: 430.2, type: 'msl' }, 'ft')).toBe('1,411 ft MSL');
    expect(formatAltitude({ m: 30.5, type: 'agl' }, 'ft')).toBe('100 ft AGL');
  });
  it('never prints an altitude without a type', () => {
    for (const type of ['msl', 'agl', 'ellipsoid'] as const) {
      for (const m of [-50, 0, 0.04, 9.84, 99.96, 100, 430.2, 8848]) {
        for (const unit of ['m', 'ft'] as const) {
          expect(formatAltitude({ m, type }, unit)).toMatch(/ (m|ft) (MSL|AGL|ellipsoid)$/);
        }
      }
    }
  });
});
