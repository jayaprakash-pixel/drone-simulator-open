// The browser-bridge contract (plan p.6). Keyboard, gamepad and mission player all produce ControlInput; the bridge
// pushes DroneState. The same rules live in bridge/contract.py and both are tested against docs/contract.fixtures.json.
import whitelist from '../../../data/param-whitelist.json';

export const MODES = ['stabilize', 'altHold', 'loiter', 'rtl', 'auto'] as const;

export type ControlInput = {
  throttle: number; // 0..1
  yaw: number; // -1..1
  pitch: number; // -1..1
  roll: number; // -1..1
  mode?: (typeof MODES)[number];
  arm?: boolean;
};

export type DroneState = {
  t: string; // UTC ISO 8601
  lat: number; // degrees
  lon: number; // degrees
  altMsl: number; // metres
  altAgl: number; // metres
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  groundSpeed: number; // m/s
  verticalSpeed: number; // m/s
  batteryPct: number;
  mode: string;
  armed: boolean;
  gpsFix: number; // 0 none, 3 = 3D fix
  /** P3.3.3: the mission waypoint being flown to (1-based) and how many there are; absent with no mission */
  wp?: number;
  wpCount?: number;
};

const ISO_UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
const num = (lo: number, hi: number) => (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const anyNum = num(-Infinity, Infinity);
const bool = (v: unknown) => typeof v === 'boolean';
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const CONTROL: Record<string, [(v: unknown) => boolean, boolean]> = {
  throttle: [num(0, 1), true],
  yaw: [num(-1, 1), true],
  pitch: [num(-1, 1), true],
  roll: [num(-1, 1), true],
  mode: [(v) => (MODES as readonly unknown[]).includes(v), false],
  arm: [bool, false],
};

const STATE: Record<string, [(v: unknown) => boolean, boolean]> = {
  t: [(v) => typeof v === 'string' && ISO_UTC.test(v) && !Number.isNaN(Date.parse(v)), true],
  lat: [num(-90, 90), true],
  lon: [num(-180, 180), true],
  altMsl: [anyNum, true],
  altAgl: [anyNum, true],
  headingDeg: [num(0, 360), true],
  pitchDeg: [num(-90, 90), true],
  rollDeg: [num(-180, 180), true],
  groundSpeed: [num(0, Infinity), true],
  verticalSpeed: [anyNum, true],
  batteryPct: [num(0, 100), true],
  mode: [(v) => typeof v === 'string' && v.length > 0, true],
  armed: [bool, true],
  gpsFix: [(v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 8, true], // MAVLink GPS_FIX_TYPE 0..8
  wp: [(v) => Number.isInteger(v) && (v as number) >= 0, false],
  wpCount: [(v) => Number.isInteger(v) && (v as number) >= 0, false],
};

/** Names the first problem, or returns null when `x` fits the shape exactly (no missing, wrong or extra fields). */
function check(shape: typeof STATE, x: unknown): string | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return 'not an object';
  for (const k of Object.keys(x)) if (!(k in shape)) return `unknown field ${k}`;
  for (const [k, [ok, required]] of Object.entries(shape)) {
    const v = (x as Record<string, unknown>)[k];
    if (v === undefined) {
      if (required) return `${k} missing`;
    } else if (!ok(v)) return `${k} out of range or wrong type: ${JSON.stringify(v)}`;
  }
  return null;
}

export const COMMANDS = ['arm', 'disarm', 'takeoff', 'land', 'mode', 'place', 'wind', 'gps', 'battery', 'mission', 'fence', 'params'] as const;
/** P3.4: the only parameters the app may read or set (data/param-whitelist.json, shared with bridge/contract.py) */
export const WHITELIST: { name: string; title: string; units: string; min: number; max: number }[] = whitelist.params;
const RANGE = new Map(WHITELIST.map((p) => [p.name, [p.min, p.max] as const]));
export const BREACH = ['rtl', 'land'] as const;
/** a mission point (P3.3): height in metres above home, speed in m/s on the way to it */
export type MissionPoint = { lat: number; lon: number; alt: number; speed: number };
export const MAX_WAYPOINTS = 30;
export const WIND = ['calm', 'breeze', 'strong', 'gusty'] as const;
export const GPS = ['good', 'weak', 'dropout'] as const;

/** A discrete action for the bridge (P2A.2.4); answered by a CommandAck with the same id. */
export type Command = {
  type: 'command';
  id: number;
  command: (typeof COMMANDS)[number];
  mode?: (typeof MODES)[number];
  alt?: number;
  /** place (P2A.3.2): the new home, its ground height MSL and the heading to face */
  lat?: number;
  lon?: number;
  altMsl?: number;
  heading?: number;
  /** wind (P3.2.1), gps (P3.2.2), battery (P3.2.3) */
  preset?: (typeof WIND)[number];
  quality?: (typeof GPS)[number];
  startPct?: number;
  drainPctPerMin?: number;
  /** mission (P3.3.3) */
  waypoints?: MissionPoint[];
  /** fence (P3.3.4): maximum height above home and distance from home, metres, and what a breach does */
  altMax?: number;
  radius?: number;
  breach?: (typeof BREACH)[number];
  /** params (P3.4): whitelisted name -> value to set; absent = read them all */
  values?: Record<string, number>;
};
export type CommandAck = { type: 'ack'; id: number; ok: boolean; reason: string; values?: Record<string, number> };
/** something only the browser knows, for the flight log (P3.1.1): a crash against real terrain */
export type LogEvent = { type: 'event'; kind: string; [detail: string]: unknown };
/** a step of a long command (place); its CommandAck ends it */
export type Progress = { type: 'progress'; id: number; text: string };

const id = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const COMMAND: Record<string, [(v: unknown) => boolean, boolean]> = {
  type: [(v) => v === 'command', true],
  id: [id, true],
  command: [(v) => (COMMANDS as readonly unknown[]).includes(v), true],
  mode: [(v) => (MODES as readonly unknown[]).includes(v), false],
  alt: [num(1, 100), false],
  lat: [num(-90, 90), false],
  lon: [num(-180, 180), false],
  altMsl: [num(-500, 9000), false],
  heading: [num(0, 360), false],
  preset: [(v) => (WIND as readonly unknown[]).includes(v), false],
  quality: [(v) => (GPS as readonly unknown[]).includes(v), false],
  startPct: [num(1, 100), false],
  drainPctPerMin: [num(0.1, 100), false],
  waypoints: [(v) => Array.isArray(v) && v.length >= 1 && v.length <= MAX_WAYPOINTS && v.every((w) => check(POINT, w) === null), false],
  altMax: [num(10, 1000), false], // FENCE_ALT_MAX range, ardupilot.org parameters (2026-10-09)
  radius: [num(30, 10000), false], // FENCE_RADIUS range
  breach: [(v) => (BREACH as readonly unknown[]).includes(v), false],
  values: [(v) => isObj(v) && Object.keys(v).length > 0 && Object.entries(v).every(([k, x]) => RANGE.has(k) && num(...RANGE.get(k)!)(x)), false],
};
const POINT: Record<string, [(v: unknown) => boolean, boolean]> = {
  lat: [num(-90, 90), true],
  lon: [num(-180, 180), true],
  alt: [num(2, 120), true],
  speed: [num(1, 15), true],
};
const NEEDS: Record<string, readonly (keyof Command)[]> = { place: ['lat', 'lon', 'altMsl', 'heading'], wind: ['preset'], gps: ['quality'], battery: ['startPct', 'drainPctPerMin'], mission: ['waypoints'], fence: ['altMax', 'radius', 'breach'] };
const PROGRESS: Record<string, [(v: unknown) => boolean, boolean]> = {
  type: [(v) => v === 'progress', true],
  id: [id, true],
  text: [(v) => typeof v === 'string' && v.length > 0, true],
};
const ACK: Record<string, [(v: unknown) => boolean, boolean]> = {
  type: [(v) => v === 'ack', true],
  id: [id, true],
  ok: [bool, true],
  reason: [(v) => typeof v === 'string', true],
  values: [(v) => isObj(v) && Object.entries(v).every(([k, x]) => RANGE.has(k) && anyNum(x)), false],
};

export const checkCommand = (x: unknown): string | null => {
  const bad = check(COMMAND, x);
  if (bad) return bad;
  const c = x as Command;
  if ((c.command === 'mode') !== (c.mode !== undefined) || (c.command === 'takeoff') !== (c.alt !== undefined)) return 'mode goes with command mode only, alt with command takeoff only';
  if (c.values !== undefined && c.command !== 'params') return 'values go with command params only';
  for (const [cmd, keys] of Object.entries(NEEDS)) {
    if (keys.some((k) => (c.command === cmd) !== (c[k] !== undefined))) return `${cmd} needs ${keys.join(', ')}; other commands take none of them`;
  }
  return null;
};
export const checkProgress = (x: unknown) => check(PROGRESS, x);
export const checkCommandAck = (x: unknown) => check(ACK, x);
export const checkControlInput = (x: unknown) => check(CONTROL, x);
export const checkDroneState = (x: unknown) => check(STATE, x);
export const STATE_FIELDS = Object.keys(STATE);
