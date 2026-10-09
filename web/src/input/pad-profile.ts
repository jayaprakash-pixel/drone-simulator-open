// Controller calibration and profiles (P2B.1.2, P2B.1.3). Each controller id gets its own profile in localStorage:
// per-axis min, max and centre from a calibration sweep, the stick mapping (Mode 1 or 2, invert), button assignments,
// deadzone and expo.
import type { ControlInput } from '../net/contract';
import type { Action } from './keyboard';

export type AxisCal = { min: number; max: number; centre: number };
export type Stick = 'throttle' | 'yaw' | 'pitch' | 'roll';
export type Profile = {
  id: string;
  cal: AxisCal[];
  mode: 1 | 2; // Mode 2: left stick throttle and yaw, right stick pitch and roll; Mode 1: left pitch and yaw, right throttle and roll
  invert: Record<Stick, boolean>;
  buttons: Record<number, Action>; // button index -> action
  deadzone: number;
  expo: number;
};

export const DEFAULT_DEADZONE = 0.05;
const KEY = (id: string) => `dw.pad.${id}`;

/** Calibration from samples of every axis taken while the sticks are swept to their limits and then let go: min and max
 *  over the sweep, centre from the samples after release (the last `rest` samples). */
export function calibrate(samples: number[][], rest = 10): AxisCal[] {
  const n = samples[0]?.length ?? 0;
  const tail = samples.slice(-rest);
  return Array.from({ length: n }, (_, a) => ({
    min: Math.min(...samples.map((s) => s[a])),
    max: Math.max(...samples.map((s) => s[a])),
    centre: tail.reduce((t, s) => t + s[a], 0) / tail.length,
  }));
}

/** Raw axis value to -1..1 with centre at 0, each side scaled to its own travel. */
export function normalise(raw: number, c: AxisCal): number {
  const span = raw >= c.centre ? c.max - c.centre : c.centre - c.min;
  if (span <= 0) return 0;
  return Math.max(-1, Math.min(1, (raw - c.centre) / span));
}

/** Standard gamepad axes: 0 left X, 1 left Y, 2 right X, 3 right Y (Y is -1 when pushed up). */
export function stickAxes(mode: 1 | 2): Record<Stick, number> {
  return mode === 2 ? { yaw: 0, throttle: 1, roll: 2, pitch: 3 } : { yaw: 0, pitch: 1, roll: 2, throttle: 3 };
}

export function defaultProfile(id: string, cal: AxisCal[]): Profile {
  return { id, cal, mode: 2, invert: { throttle: false, yaw: false, pitch: false, roll: false }, buttons: {}, deadzone: DEFAULT_DEADZONE, expo: 0.3 };
}

export function saveProfile(p: Profile, store: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    store.setItem(KEY(p.id), JSON.stringify(p));
  } catch {
    /* storage blocked: the profile lasts for this page view */
  }
}

/** The saved profile for this controller id, or null (then the calibration prompt shows). */
export function loadProfile(id: string, store: Pick<Storage, 'getItem'> = localStorage): Profile | null {
  try {
    const p = JSON.parse(store.getItem(KEY(id)) ?? 'null') as Profile | null;
    return p && Array.isArray(p.cal) && p.id === id ? p : null;
  } catch {
    return null;
  }
}

/** The four sticks in pilot terms, each -1..1 after calibration, invert, deadzone and expo: throttle up, yaw right,
 *  forward, right. Up and forward on a gamepad Y axis read -1. */
export function padSticks(axes: number[], p: Profile, shapeFn: (x: number, dz: number, expo: number) => number): Record<Stick, number> {
  const map = stickAxes(p.mode);
  const out = {} as Record<Stick, number>;
  for (const s of ['throttle', 'yaw', 'pitch', 'roll'] as Stick[]) {
    const a = map[s];
    let v = p.cal[a] ? normalise(axes[a] ?? 0, p.cal[a]) : 0;
    if (s === 'throttle' || s === 'pitch') v = -v; // Y axes: pushed up reads -1; up means more throttle / forward
    if (p.invert[s]) v = -v;
    out[s] = shapeFn(v, p.deadzone, p.expo);
  }
  return out;
}

/** The controller's sticks as the same ControlInput the keyboard sends: throttle centre 0.5 (the sticks spring back),
 *  forward is negative pitch, right is positive roll and yaw (measured on SITL, decisions.md). */
export function padToControl(s: Record<Stick, number>): ControlInput {
  return { throttle: 0.5 + 0.5 * s.throttle, yaw: s.yaw, pitch: -s.pitch, roll: s.roll };
}
