// Pre-flight checklist (P3.3.5): pass, warning or fail per item; any fail blocks take off, warnings need one click
// (once per placed drone). Limits are starting values (decisions.md 2026-10-09), to tune with real use.
export type Status = 'pass' | 'warn' | 'fail';
export interface Item {
  id: 'home' | 'gps' | 'battery' | 'wind' | 'route' | 'rtl' | 'fence';
  label: string;
  status: Status;
  reason: string;
}
export interface PreflightInput {
  homeSet: boolean;
  gpsFix: number | null;
  batteryPct: number | null;
  /** wind preset chosen in Conditions: its steady speed and gust, m/s */
  wind: { speed: number; gust: number };
  /** mission points, and the terrain check of the current points (null: not checked since the last change) */
  routePoints: number;
  clearance: { ok: boolean; highestGroundAboveHome: number } | null;
  /** RTL_ALT_M as read from the drone (Parameters), or null when not read */
  rtlAltM: number | null;
  fenceOn: boolean;
}
export const BATTERY_OK_PCT = 90;
export const BATTERY_MIN_PCT = 30;
export const WIND_OK_MS = 6; // speed + gust
export const WIND_MAX_MS = 10;

export function preflight(x: PreflightInput): Item[] {
  const it = (id: Item['id'], label: string, status: Status, reason: string): Item => ({ id, label, status, reason });
  const w = x.wind.speed + x.wind.gust;
  const route = x.routePoints > 0;
  return [
    x.homeSet ? it('home', 'Home point set', 'pass', 'the drone is placed; home is where it starts') : it('home', 'Home point set', 'fail', 'place the drone first'),
    x.gpsFix !== null && x.gpsFix >= 3 ? it('gps', 'GPS fix', 'pass', `fix ${x.gpsFix}`) : it('gps', 'GPS fix', 'fail', 'no 3D fix: wait for GPS'),
    x.batteryPct === null ? it('battery', 'Battery above 90 %', 'fail', 'battery unknown')
      : x.batteryPct > BATTERY_OK_PCT ? it('battery', 'Battery above 90 %', 'pass', `${Math.round(x.batteryPct)} %`)
      : x.batteryPct >= BATTERY_MIN_PCT ? it('battery', 'Battery above 90 %', 'warn', `only ${Math.round(x.batteryPct)} %`)
      : it('battery', 'Battery above 90 %', 'fail', `${Math.round(x.batteryPct)} % is below ${BATTERY_MIN_PCT} %`),
    w <= WIND_OK_MS ? it('wind', 'Wind within limit', 'pass', `${w} m/s with gusts`)
      : w <= WIND_MAX_MS ? it('wind', 'Wind within limit', 'warn', `${w} m/s with gusts is above ${WIND_OK_MS} m/s`)
      : it('wind', 'Wind within limit', 'fail', `${w} m/s with gusts is above ${WIND_MAX_MS} m/s`),
    !route ? it('route', 'Route clear of terrain', 'pass', 'no mission route')
      : !x.clearance ? it('route', 'Route clear of terrain', 'warn', 'route not checked: press Check terrain')
      : x.clearance.ok ? it('route', 'Route clear of terrain', 'pass', 'clear (terrain only: not buildings, trees, poles or wires)')
      : it('route', 'Route clear of terrain', 'fail', 'the route comes too close to the ground'),
    !route ? it('rtl', 'Return height above the route\'s highest ground', 'pass', 'no mission route')
      : x.rtlAltM === null || !x.clearance ? it('rtl', 'Return height above the route\'s highest ground', 'warn', x.rtlAltM === null ? 'return height not read: Parameters, Read from drone' : 'route not checked')
      : x.rtlAltM > x.clearance.highestGroundAboveHome ? it('rtl', 'Return height above the route\'s highest ground', 'pass', `${x.rtlAltM} m above home, ground up to ${Math.round(x.clearance.highestGroundAboveHome)} m`)
      : it('rtl', 'Return height above the route\'s highest ground', 'fail', `${x.rtlAltM} m above home, but the ground rises to ${Math.round(x.clearance.highestGroundAboveHome)} m`),
    x.fenceOn ? it('fence', 'Geofence active', 'pass', 'set for this flight') : it('fence', 'Geofence active', 'warn', 'no geofence: Mission, Set fence'),
  ];
}
