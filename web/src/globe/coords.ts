import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import { egm96ToEllipsoid, ellipsoidToEgm96, meanSeaLevel } from 'egm96-universal';

// Conventions (plan p.5): WGS84 latitude/longitude in degrees, metres, heading clockwise from true north.
// Three altitudes exist and differ by tens of metres in India, so every altitude carries its type:
//   ellipsoid  height above the WGS84 ellipsoid (Cesium terrain and camera heights)
//   msl        height above mean sea level, EGM96 geoid (GPS and autopilot reports; what the pilot reads on a map)
//   agl        height above the ground directly below (pilot limits such as "stay under 120 m")
export type AltType = 'ellipsoid' | 'msl' | 'agl';
export interface Altitude {
  m: number;
  type: AltType;
}

export const M_PER_FT = 0.3048;

/** WGS84 degrees plus ellipsoid height to Cesium's Earth-fixed Cartesian. Degrees in, never radians. */
export const toCartesian = (lat: number, lon: number, hEllipsoid = 0): Cartesian3 => Cartesian3.fromDegrees(lon, lat, hEllipsoid);

export function fromCartesian(c: Cartesian3): { lat: number; lon: number; hEllipsoid: number } {
  const g = Cartographic.fromCartesian(c);
  return { lat: CesiumMath.toDegrees(g.latitude), lon: CesiumMath.toDegrees(g.longitude), hEllipsoid: g.height };
}

/** EGM96 geoid undulation N in metres (about -45 to -50 over Rajasthan): ellipsoid height = MSL height + N. */
export const geoidHeight = (lat: number, lon: number): number => meanSeaLevel(lat, lon);

export const ellipsoidToMsl = (lat: number, lon: number, hEllipsoid: number): number => ellipsoidToEgm96(lat, lon, hEllipsoid);
export const mslToEllipsoid = (lat: number, lon: number, hMsl: number): number => egm96ToEllipsoid(lat, lon, hMsl);

/** AGL = altitude minus the terrain below it, both in the same frame (N cancels when both use the same spot). */
export const aglFromMsl = (altMsl: number, groundMsl: number): number => altMsl - groundMsl;

/** A height `agl` above ground given in MSL, as the ellipsoid height Cesium places the camera at (Stand here's eye). */
export function aboveGround(lat: number, lon: number, ground: Altitude, agl: Altitude): Altitude {
  if (ground.type !== 'msl' || agl.type !== 'agl') throw new Error(`aboveGround needs MSL ground and an AGL height, got ${ground.type} and ${agl.type}`);
  return { m: mslToEllipsoid(lat, lon, ground.m + agl.m), type: 'ellipsoid' };
}

/** Decimal degrees, six places (about 0.1 m): '26.912400, 75.787300'. Also what the Copy button puts on the clipboard. */
export const formatDecimal = (lat: number, lon: number): string => `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

function dms(value: number, pos: string, neg: string): string {
  const tenths = Math.round(Math.abs(value) * 36000); // tenths of an arcsecond, so rounding carries into minutes and degrees
  const rest = tenths % 36000;
  return `${Math.floor(tenths / 36000)}°${Math.floor(rest / 600)}′${((rest % 600) / 10).toFixed(1)}″${value < 0 ? neg : pos}`;
}

/** Degrees, minutes, seconds with hemisphere letters: '26°54′44.6″N 75°47′14.3″E'. */
export const formatDms = (lat: number, lon: number): string => `${dms(lat, 'N', 'S')} ${dms(lon, 'E', 'W')}`;

export const formatLatLon = (lat: number, lon: number, format: 'dec' | 'dms'): string => (format === 'dms' ? formatDms(lat, lon) : formatDecimal(lat, lon));

const LABEL: Record<AltType, string> = { msl: 'MSL', agl: 'AGL', ellipsoid: 'ellipsoid' };

/** The only way altitudes reach the screen or a file label: always '<value> <unit> <type>', e.g. '430 m MSL'. */
export function formatAltitude(a: Altitude, unit: 'm' | 'ft' = 'm'): string {
  const v = unit === 'ft' ? a.m / M_PER_FT : a.m;
  const tenth = Math.round(v * 10) / 10;
  const num = Math.abs(v) < 100 ? (tenth === 0 ? '0.0' : tenth.toFixed(1)) : Math.round(v).toLocaleString('en-US');
  return `${num} ${unit} ${LABEL[a.type]}`;
}
