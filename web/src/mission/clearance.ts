// Terrain clearance of a mission route (P3.3.2), under the owner's rule (decisions.md 2026-10-08, confirmed 2026-10-09):
// terrain only (a TerrainHeight, never a building or tree height), shown with an uncertainty of at least 25 m, a default
// minimum margin of 50 m (a setting), and every result says "terrain only: not buildings, trees, poles or wires".
// Heights of waypoints are metres above home, as the autopilot flies them (MAV_FRAME_GLOBAL_RELATIVE_ALT).
import { CLEARANCE_SCOPE, CLEARANCE_UNCERTAINTY_M, DEFAULT_CLEARANCE_MARGIN_M } from '../globe/obstacles';
import type { TerrainHeight } from '../globe/obstacles';

export interface Waypoint {
  lat: number;
  lon: number;
  /** metres above home */
  alt: number;
  /** m/s on the way to this point */
  speed: number;
}
export interface RoutePoint {
  lat: number;
  lon: number;
  /** distance along the route from home, m */
  alongM: number;
  /** planned height, MSL */
  pathMsl: number;
}
export interface ClearanceSample extends RoutePoint {
  groundMsl: number;
  clearance: number;
  flagged: boolean;
}
export interface ClearanceResult {
  samples: ClearanceSample[];
  /** [from, to] metres along the route where the clearance is below the margin */
  stretches: [number, number][];
  minClearance: number;
  marginM: number;
  ok: boolean;
  text: string;
}

const R = 6_371_008.8;
const rad = Math.PI / 180;
export const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number =>
  2 * R * Math.asin(Math.sqrt(Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2));

/**
 * Points every `spacingM` along home -> waypoint 1 -> ... -> waypoint n (each leg's ends included), with the planned
 * height MSL: the leg from home flies at waypoint 1's height (the take-off climbs there first), then each leg changes
 * height evenly from one waypoint's height to the next.
 */
export function routePoints(home: { lat: number; lon: number; groundMsl: number }, wps: Waypoint[], spacingM = 25): RoutePoint[] {
  const out: RoutePoint[] = [];
  let along = 0;
  let from = { lat: home.lat, lon: home.lon, alt: wps[0]?.alt ?? 0 };
  for (const w of wps) {
    const len = metres(from, w);
    const n = Math.max(1, Math.ceil(len / spacingM));
    for (let i = out.length ? 1 : 0; i <= n; i++) {
      const f = i / n;
      // ponytail: straight-line interpolation in degrees, fine for legs of a few km; great-circle if missions grow
      out.push({ lat: from.lat + (w.lat - from.lat) * f, lon: from.lon + (w.lon - from.lon) * f, alongM: along + len * f, pathMsl: home.groundMsl + from.alt + (w.alt - from.alt) * f });
    }
    along += len;
    from = w;
  }
  return out;
}

/** Clearance at each route point against terrain only; `ground[i]` is the terrain under `points[i]`. */
export function checkClearance(points: RoutePoint[], ground: TerrainHeight[], marginM = DEFAULT_CLEARANCE_MARGIN_M): ClearanceResult {
  const samples = points.map((p, i) => {
    const clearance = p.pathMsl - ground[i].m;
    return { ...p, groundMsl: ground[i].m, clearance, flagged: clearance < marginM };
  });
  const stretches: [number, number][] = [];
  for (const s of samples) {
    const last = stretches.at(-1);
    if (!s.flagged) continue;
    if (last && samples[samples.indexOf(s) - 1]?.flagged) last[1] = s.alongM;
    else stretches.push([s.alongM, s.alongM]);
  }
  const minClearance = Math.min(...samples.map((s) => s.clearance));
  const ok = stretches.length === 0;
  const fmt = (m: number): string => `${Math.round(m)} m`;
  const text = ok
    ? `Clear: lowest clearance ${fmt(minClearance)} ± ${CLEARANCE_UNCERTAINTY_M} m, margin ${fmt(marginM)} (${CLEARANCE_SCOPE}).`
    : `Too close to the ground on ${stretches.length} stretch${stretches.length > 1 ? 'es' : ''} (${stretches.map(([a, b]) => `${fmt(a)} to ${fmt(b)}`).join(', ')} along the route): lowest clearance ${fmt(minClearance)} ± ${CLEARANCE_UNCERTAINTY_M} m, margin ${fmt(marginM)} (${CLEARANCE_SCOPE}).`;
  return { samples, stretches, minClearance, marginM, ok, text };
}
