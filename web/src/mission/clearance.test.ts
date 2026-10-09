import { describe, expect, it } from 'vitest';
import { terrainHeight } from '../globe/obstacles';
import { checkClearance, metres, routePoints } from './clearance';

// P3.3.2: a synthetic terrain sampler: flat ground at 300 m MSL with a 100 m hill, a 600 m wide plateau with 200 m slopes,
// across the route's middle. The route flies at 80 m above home (home ground 300 m), so over the hilltop it is
// 80 - 100 = -20 m clear: it hits the hill; with margin 50 the flagged stretch is where the ground rises above 330 m.
const HOME = { lat: 24.5, lon: 72.7, groundMsl: 300 };
const east = (m: number): number => HOME.lon + m / (111_195 * Math.cos(HOME.lat * (Math.PI / 180)));
const hill = (x: number): number => {
  // x: metres east of home; rise 1000-1200, top 1200-1800, fall 1800-2000
  if (x < 1000 || x > 2000) return 0;
  if (x < 1200) return ((x - 1000) / 200) * 100;
  if (x > 1800) return ((2000 - x) / 200) * 100;
  return 100;
};
const sampler = (_lat: number, lon: number) => terrainHeight(300 + hill(metres(HOME, { lat: HOME.lat, lon }) * Math.sign(lon - HOME.lon)));
const route = [
  { lat: HOME.lat, lon: east(500), alt: 80, speed: 5 },
  { lat: HOME.lat, lon: east(3000), alt: 80, speed: 5 },
];

describe('terrain clearance (P3.3.2)', () => {
  it('flags exactly the stretch inside the margin over a 100 m hill at 80 m above home', () => {
    const pts = routePoints(HOME, route, 10);
    const r = checkClearance(pts, pts.map((p) => sampler(p.lat, p.lon)), 50);
    expect(r.ok).toBe(false);
    expect(r.stretches).toHaveLength(1);
    // clearance < 50 where hill > 30: rise from 1000 + 0.3 x 200 = 1060 m, fall to 2000 - 60 = 1940 m (10 m sampling)
    const [a, b] = r.stretches[0];
    expect(Math.abs(a - 1060)).toBeLessThanOrEqual(10);
    expect(Math.abs(b - 1940)).toBeLessThanOrEqual(10);
    expect(r.samples.filter((s) => s.flagged).every((s) => s.clearance < 50)).toBe(true);
    expect(r.samples.filter((s) => !s.flagged).every((s) => s.clearance >= 50)).toBe(true);
    expect(Math.round(r.minClearance)).toBe(-20);
    expect(r.text).toContain('terrain only: not buildings, trees, poles or wires');
    expect(r.text).toContain('± 25 m');
  });

  it('the margin is a setting', () => {
    const pts = routePoints(HOME, route, 10);
    const ground = pts.map((p) => sampler(p.lat, p.lon));
    const wide = checkClearance(pts, ground, 150).stretches[0];
    const narrow = checkClearance(pts, ground, 10).stretches[0];
    expect(wide[1] - wide[0]).toBeGreaterThan(narrow[1] - narrow[0]);
    expect(checkClearance(pts, ground.map(() => terrainHeight(300)), 50).ok).toBe(true); // flat ground: clear at 80 m
  });

  it('gives one sample per spacing step along every leg, heights following the waypoints', () => {
    const pts = routePoints(HOME, [{ ...route[0], alt: 20 }, { ...route[1], alt: 120 }], 25);
    expect(Math.abs(pts.at(-1)!.alongM - 3000)).toBeLessThan(1);
    const legs = [metres(HOME, route[0]), metres(route[0], route[1])];
    expect(pts.length).toBe(Math.ceil(legs[0] / 25) + 1 + Math.ceil(legs[1] / 25));
    expect(pts[0].pathMsl).toBe(320); // home leg at waypoint 1's height
    expect(pts.at(-1)!.pathMsl).toBeCloseTo(420);
  });
});
