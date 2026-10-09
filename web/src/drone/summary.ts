// Flight summary (P3.1.3), computed when a flight ends from its states and events: duration, distance flown, maximum
// height, maximum speed, lowest clearance above the real terrain, battery used, fence breaches and whether it crashed.
import type { DroneState } from '../net/contract';

export type FlightEvent = { kind: string };
export type Summary = {
  durationS: number;
  distanceM: number;
  maxHeightM: number; // the simulator's height above home (altAgl)
  maxSpeedMs: number;
  lowestClearanceM: number | null; // altMsl minus the real ground under the drone, while flying; null without terrain
  batteryUsedPct: number;
  fenceBreaches: number;
  crashed: boolean;
};

const R = Math.PI / 180;
export const metres = (la1: number, lo1: number, la2: number, lo2: number): number =>
  2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((la2 - la1) * R) / 2) ** 2 + Math.cos(la1 * R) * Math.cos(la2 * R) * Math.sin(((lo2 - lo1) * R) / 2) ** 2));

export function summarise(states: DroneState[], events: FlightEvent[], groundMsl?: (lat: number, lon: number) => number | undefined): Summary {
  let distance = 0, clearance: number | null = null;
  for (let i = 1; i < states.length; i++) distance += metres(states[i - 1].lat, states[i - 1].lon, states[i].lat, states[i].lon);
  for (const s of states) {
    const g = s.armed && s.altAgl > 0.5 ? groundMsl?.(s.lat, s.lon) : undefined; // while flying
    if (g !== undefined) clearance = Math.min(clearance ?? Infinity, s.altMsl - g);
  }
  return {
    durationS: states.length ? (Date.parse(states[states.length - 1].t) - Date.parse(states[0].t)) / 1000 : 0,
    distanceM: distance,
    maxHeightM: Math.max(0, ...states.map((s) => s.altAgl)),
    maxSpeedMs: Math.max(0, ...states.map((s) => s.groundSpeed)),
    lowestClearanceM: clearance,
    batteryUsedPct: states.length ? states[0].batteryPct - states[states.length - 1].batteryPct : 0,
    fenceBreaches: events.filter((e) => e.kind === 'fence').length,
    crashed: events.some((e) => e.kind === 'crash'),
  };
}

export function summaryText(s: Summary): string[] {
  return [
    `Duration ${Math.floor(s.durationS / 60)} min ${Math.round(s.durationS % 60)} s`,
    `Distance ${s.distanceM.toFixed(0)} m`,
    `Max height ${s.maxHeightM.toFixed(1)} m above home`,
    `Max speed ${s.maxSpeedMs.toFixed(1)} m/s`,
    `Lowest clearance above the real ground ${s.lowestClearanceM === null ? '-- (no terrain)' : `${s.lowestClearanceM.toFixed(1)} m`}`,
    `Battery used ${s.batteryUsedPct.toFixed(0)} %`,
    `Fence breaches ${s.fenceBreaches}`,
    s.crashed ? 'Crashed' : 'No crash',
  ];
}
