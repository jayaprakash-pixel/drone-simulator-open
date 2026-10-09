import { Cartesian3, Cartographic, Math as CesiumMath, Matrix4, Transforms } from 'cesium';
import type { Viewer } from 'cesium';
import { pickGround } from './picking';

// Camera conventions: heading clockwise from true north, pitch negative when looking down (-90 = straight down), degrees.
export const OBLIQUE_PITCH = -40; // where every fly-to ends unless Top-down is on
export const TOWN_RANGE = 1000; // metres from a town or a saved place
export const TILT_STEP = 10;
export const TURN_STEP = 15;
const FLY_CLEARANCE = 30; // a fly-to never ends closer than this to the ground under the camera
const NUDGE_CLEARANCE = 2; // tilt and turn buttons: the same 2 m as the minimum zoom distance

const R_EQ = 6_378_137;
const E2 = 6.69437999014e-3; // WGS84 first eccentricity squared

/** Where a camera sits, in local east/north/up metres from the point it looks at, `range` metres away along heading/pitch. */
export function orbitOffset(headingDeg: number, pitchDeg: number, range: number): { east: number; north: number; up: number } {
  const h = CesiumMath.toRadians(headingDeg);
  const p = CesiumMath.toRadians(pitchDeg);
  const flat = range * Math.cos(p);
  return { east: -flat * Math.sin(h), north: -flat * Math.cos(h), up: -range * Math.sin(p) };
}

/** Moves a lat/lon by metres east and north (WGS84 radii of curvature; exact enough for steps up to a few km). */
export function moveLatLon(lat: number, lon: number, east: number, north: number): { lat: number; lon: number } {
  const s = Math.sin(CesiumMath.toRadians(lat));
  const w = Math.sqrt(1 - E2 * s * s);
  const meridian = (R_EQ * (1 - E2)) / (w * w * w);
  const normal = R_EQ / w;
  return {
    lat: lat + CesiumMath.toDegrees(north / meridian),
    lon: lon + CesiumMath.toDegrees(east / (normal * Math.cos(CesiumMath.toRadians(lat)))),
  };
}

export interface WalkKeys {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  fast: boolean;
}
export const WALK_SPEED = 1.4; // m/s, a normal walk
export const RUN_SPEED = 5; // m/s with Shift

/** Metres east and north for one walking step of `dt` seconds: W/S along the heading, A/D sideways, diagonals not faster. */
export function walkStep(keys: WalkKeys, headingDeg: number, dt: number): { east: number; north: number } {
  const f = Number(keys.forward) - Number(keys.back);
  const r = Number(keys.right) - Number(keys.left);
  const len = Math.hypot(f, r);
  if (len === 0) return { east: 0, north: 0 };
  const d = ((keys.fast ? RUN_SPEED : WALK_SPEED) * dt) / len;
  const h = CesiumMath.toRadians(headingDeg);
  return { east: d * (f * Math.sin(h) + r * Math.cos(h)), north: d * (f * Math.cos(h) - r * Math.sin(h)) };
}

/** Free distance along one compass direction from a standing point, metres (capped at the search distance). */
export interface FreeRay {
  heading: number;
  free: number;
}
export const FACING_SEARCH_M = 30;
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compassName = (headingDeg: number): string => COMPASS[Math.round((((headingDeg % 360) + 360) % 360) / 45) % 8];

/**
 * Stand here faces the most open direction: the ray with the most free distance. Ties go to the one facing farthest
 * away from the nearest wall, or, with no wall within the search distance, to the one nearest the current heading.
 * Also returns that nearest wall.
 */
export function chooseFacing(rays: FreeRay[], currentHeading: number): { heading: number; wall?: FreeRay } {
  const apart = (a: number, b: number): number => Math.abs((((a - b) % 360) + 540) % 360 - 180);
  const nearest = rays.reduce((a, b) => (b.free < a.free ? b : a));
  const wall = nearest.free < FACING_SEARCH_M ? nearest : undefined;
  const better = (b: FreeRay, a: FreeRay): boolean =>
    b.free > a.free || (b.free === a.free && (wall ? apart(b.heading, wall.heading) > apart(a.heading, wall.heading) : apart(b.heading, currentHeading) < apart(a.heading, currentHeading)));
  const best = rays.reduce((a, b) => (better(b, a) ? b : a));
  return { heading: best.heading, wall };
}

/** Heading in whole degrees, 0-359: rounding first, so 359.7 reads 0 and never 360. */
export const headingLabel = (headingRad: number): number => ((Math.round(CesiumMath.toDegrees(headingRad)) % 360) + 360) % 360;

type GroundAt = (lat: number, lon: number) => Promise<number | undefined> | number | undefined;

/**
 * Looks at a ground point (lat, lon, ellipsoid height h) from `range` metres along heading/pitch. When the ground under
 * that camera position is closer than `clearance` (a hill in the way), the view steepens 10 degrees at a time, up to
 * straight down, so the camera never ends inside the terrain.
 */
export async function viewFrom(
  viewer: Viewer,
  target: { lat: number; lon: number; h: number },
  headingDeg: number,
  pitchDeg: number,
  range: number,
  groundAt: GroundAt,
  { duration = 3, clearance = FLY_CLEARANCE } = {},
): Promise<void> {
  const enu = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(target.lon, target.lat, target.h));
  for (let p = pitchDeg; ; p = Math.max(p - TILT_STEP, -90)) {
    const o = orbitOffset(headingDeg, p, range);
    const dest = Matrix4.multiplyByPoint(enu, new Cartesian3(o.east, o.north, o.up), new Cartesian3());
    const c = Cartographic.fromCartesian(dest);
    const ground = await groundAt(CesiumMath.toDegrees(c.latitude), CesiumMath.toDegrees(c.longitude));
    if (ground === undefined || c.height - ground >= clearance || p <= -90) {
      const orientation = { heading: CesiumMath.toRadians(headingDeg), pitch: CesiumMath.toRadians(p), roll: 0 };
      if (duration > 0) viewer.camera.flyTo({ destination: dest, orientation, duration });
      else viewer.camera.setView({ destination: dest, orientation });
      viewer.scene.requestRender();
      return;
    }
  }
}

/** The ground point at the centre of the screen and the camera's distance to it, or undefined when the centre shows sky. */
export function screenCentre(viewer: Viewer): { lat: number; lon: number; h: number; range: number } | undefined {
  const canvas = viewer.scene.canvas;
  const g = pickGround(viewer, canvas.clientWidth / 2, canvas.clientHeight / 2);
  if (!g) return undefined;
  const range = Cartesian3.distance(viewer.camera.positionWC, Cartesian3.fromDegrees(g.lon, g.lat, g.hEllipsoid));
  return { lat: g.lat, lon: g.lon, h: g.hEllipsoid, range };
}

/** Tilts and/or turns the view around the point at the screen centre (pitch kept between -90 and -10 degrees). */
export async function orbitCentre(viewer: Viewer, dHeading: number, pitchDeg?: number): Promise<void> {
  const c = screenCentre(viewer);
  if (!c) return; // looking at the sky: nothing to turn around
  const heading = CesiumMath.toDegrees(viewer.camera.heading) + dHeading;
  const pitch = Math.min(-10, Math.max(-90, pitchDeg ?? CesiumMath.toDegrees(viewer.camera.pitch)));
  const rendered = (lat: number, lon: number): number | undefined => viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat));
  await viewFrom(viewer, c, heading, pitch, c.range, rendered, { duration: 0.4, clearance: NUDGE_CLEARANCE });
}
