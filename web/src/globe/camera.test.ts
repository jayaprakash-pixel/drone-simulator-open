import { Math as CesiumMath } from 'cesium';
import { describe, expect, it } from 'vitest';
import { distanceM } from '../panorama/provider';
import { RUN_SPEED, WALK_SPEED, chooseFacing, compassName, headingLabel, moveLatLon, orbitOffset, walkStep } from './camera';
import type { WalkKeys } from './camera';

const keys = (k: Partial<WalkKeys>): WalkKeys => ({ forward: false, back: false, left: false, right: false, fast: false, ...k });

describe('orbitOffset: where the camera sits relative to the point it looks at', () => {
  it('heading 0, pitch -40, 1 km: south of the target and above it, exactly 1 km away', () => {
    const o = orbitOffset(0, -40, 1000);
    expect(o.east).toBeCloseTo(0, 6);
    expect(o.north).toBeCloseTo(-766.044, 3); // 1000 cos 40
    expect(o.up).toBeCloseTo(642.788, 3); // 1000 sin 40
    expect(Math.hypot(o.east, o.north, o.up)).toBeCloseTo(1000, 6);
  });
  it('heading 90 (looking east): the camera is west of the target', () => {
    const o = orbitOffset(90, -40, 1000);
    expect(o.east).toBeCloseTo(-766.044, 3);
    expect(o.north).toBeCloseTo(0, 6);
  });
  it('top-down (-90): straight above, whatever the heading', () => {
    const o = orbitOffset(123, -90, 500);
    expect(Math.hypot(o.east, o.north)).toBeLessThan(1e-9);
    expect(o.up).toBeCloseTo(500, 9);
  });
});

describe('walkStep: Stand here walking', () => {
  it('W walks 1.4 m/s along the heading; Shift runs 5 m/s', () => {
    expect(walkStep(keys({ forward: true }), 0, 1)).toEqual({ east: expect.closeTo(0, 9), north: expect.closeTo(WALK_SPEED, 9) });
    expect(walkStep(keys({ forward: true, fast: true }), 0, 1).north).toBeCloseTo(RUN_SPEED, 9);
    expect([WALK_SPEED, RUN_SPEED]).toEqual([1.4, 5]);
  });
  it('directions are relative to the heading: W at 90 goes east, D at 0 goes east, A west, S back', () => {
    expect(walkStep(keys({ forward: true }), 90, 1).east).toBeCloseTo(1.4, 9);
    expect(walkStep(keys({ right: true }), 0, 1).east).toBeCloseTo(1.4, 9);
    expect(walkStep(keys({ left: true }), 0, 1).east).toBeCloseTo(-1.4, 9);
    expect(walkStep(keys({ back: true }), 0, 1).north).toBeCloseTo(-1.4, 9);
    expect(walkStep(keys({ right: true }), 90, 1).north).toBeCloseTo(-1.4, 9); // facing east, right is south
  });
  it('diagonals are not faster, opposite keys cancel, Shift alone does not move', () => {
    const d = walkStep(keys({ forward: true, right: true }), 0, 1);
    expect(Math.hypot(d.east, d.north)).toBeCloseTo(1.4, 9);
    expect(walkStep(keys({ forward: true, back: true }), 0, 1)).toEqual({ east: 0, north: 0 });
    expect(walkStep(keys({ fast: true }), 0, 1)).toEqual({ east: 0, north: 0 });
  });
  it('two seconds of W at 60 frames a second cover 2.8 m on the ground', () => {
    let p = { lat: 19.906844, lon: 83.16979 };
    for (let i = 0; i < 120; i++) {
      const d = walkStep(keys({ forward: true }), 37, 1 / 60);
      p = moveLatLon(p.lat, p.lon, d.east, d.north);
    }
    expect(distanceM(19.906844, 83.16979, p.lat, p.lon)).toBeCloseTo(2.8, 1);
  });
});

describe('moveLatLon', () => {
  it('1 km north at the equator is 0.0090437 degrees (WGS84 meridian: 110,574 m per degree)', () => {
    expect(moveLatLon(0, 10, 0, 1000).lat).toBeCloseTo(0.0090437, 6);
  });
  it('1 km east at 60 degrees north is 0.0179211 degrees (WGS84: 55,800 m per degree)', () => {
    const p = moveLatLon(60, 10, 1000, 0);
    expect(p.lon - 10).toBeCloseTo(0.0179211, 6);
    expect(p.lat).toBe(60);
  });
});

describe('chooseFacing: Stand here faces open space', () => {
  const rays = (free: number[]) => free.map((f, i) => ({ heading: i * 45, free: f }));
  it('faces the direction with the most free distance and reports the nearest wall (the screenshot spot: wall 0.8 m north)', () => {
    const r = chooseFacing(rays([0.8, 12, 30, 30, 30, 30, 30, 9]), 0);
    expect(r.wall).toEqual({ heading: 0, free: 0.8 });
    expect(r.heading).toBe(180); // of the equally open directions, the one facing straight away from the wall
    expect(compassName(r.wall!.heading)).toBe('north');
  });
  it('the most free distance wins even when it is not opposite the wall', () => {
    expect(chooseFacing(rays([0.8, 12, 30, 20, 20, 20, 20, 9]), 0).heading).toBe(90);
  });
  it('with no wall nearby, equally open directions keep the one nearest the current heading', () => {
    expect(chooseFacing(rays([30, 30, 30, 30, 30, 30, 30, 30]), 200).heading).toBe(180);
    expect(chooseFacing(rays([30, 30, 30, 30, 30, 30, 30, 30]), 260).heading).toBe(270);
  });
  it('with nothing within 30 m there is no wall and the heading stays', () => {
    expect(chooseFacing(rays([30, 30, 30, 30, 30, 30, 30, 30]), 315)).toEqual({ heading: 315, wall: undefined });
  });
  it('names compass directions, wrapping past north', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315, 359, -45].map(compassName)).toEqual(['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-west']);
  });
});

describe('headingLabel: the camera readout', () => {
  const at = (deg: number): number => headingLabel(CesiumMath.toRadians(deg));
  it('rounds before wrapping, so a heading just under north reads 0, never 360', () => {
    expect(at(359.7)).toBe(0);
    expect(at(359.4)).toBe(359);
    expect(at(-0.2)).toBe(0);
    expect(at(-90)).toBe(270);
    expect(at(720.6)).toBe(1);
  });
});
