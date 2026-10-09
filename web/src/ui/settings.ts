// Persisted user settings (plan p.8: map token, units, coordinate format) plus the choices that must survive a reload.
export type Units = 'm' | 'ft';
export type CoordFormat = 'dec' | 'dms';
export type Layer = 'satellite' | 's2' | 'streets';

export interface Settings {
  ionToken: string;
  mapillaryToken: string;
  units: Units;
  coordFormat: CoordFormat;
  resolutionScale: number;
  layer: Layer;
  topDown: boolean;
  buildings: boolean;
}

const DEFAULTS: Settings = { ionToken: '', mapillaryToken: '', units: 'm', coordFormat: 'dec', resolutionScale: 1, layer: 'satellite', topDown: false, buildings: true };
const KEY = 'dw.settings';

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();
const listeners = new Set<(s: Settings) => void>();

/** Merges a change, saves it (a blocked localStorage only costs persistence) and tells every listener. */
export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage blocked: settings last for this page view only */
  }
  listeners.forEach((fn) => fn(settings));
}

export function onSettings(fn: (s: Settings) => void): void {
  listeners.add(fn);
}

/**
 * The Cesium ion token the globe uses: one typed in Settings wins over the build-time VITE_CESIUM_ION_TOKEN
 * (web/.env.local, git-ignored). ?notoken=1 forces "missing" so the no-token path can be tested.
 */
export function resolveToken(): string {
  const env = new URLSearchParams(location.search).has('notoken') ? '' : String(import.meta.env.VITE_CESIUM_ION_TOKEN ?? '');
  return (settings.ionToken || env).trim();
}

/** The Mapillary client token for the 360 view, the same way: Settings first, then VITE_MAPILLARY_TOKEN; ?nomly=1 forces "missing". */
export function resolveMapillaryToken(): string {
  if (new URLSearchParams(location.search).has('nomly')) return '';
  return (settings.mapillaryToken || String(import.meta.env.VITE_MAPILLARY_TOKEN ?? '')).trim();
}
