// Saved places: the plan's seven data-quality test places (p.8), the world test set (data/world-places.json, edit it
// there) and the ones you add, which persist in localStorage. The Places list shows them grouped by type.
import testPlaces from '../../../data/test-places.json';
import world from '../../../data/world-places.json';

export interface SavedPlace {
  name: string;
  lat: number;
  lon: number;
  /** camera distance from the place when flying there, metres (the view is tilted unless Top-down is on) */
  height: number;
  /** heading in the Places list */
  group?: string;
  user?: boolean;
}

export const PHASE1_GROUP = 'Phase 1 test places';
export const WORLD_PLACES: SavedPlace[] = (world.places as { name: string; category: string; lat?: number; lon?: number }[])
  .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  .map((p) => ({ name: p.name, lat: p.lat!, lon: p.lon!, height: 1000, group: p.category }));

export const TEST_PLACES: SavedPlace[] = testPlaces.places; // data/test-places.json: samples, not a limit

const KEY = 'dw.places';
let user: SavedPlace[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedPlace[];
  } catch {
    return [];
  }
})();
const listeners = new Set<() => void>();

const persist = (): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    /* storage blocked: the place lasts for this page view only */
  }
  listeners.forEach((fn) => fn());
};

// your own places are returned as stored (removeUserPlace finds them by identity); they list under "Your places"
export const allPlaces = (): SavedPlace[] => [...TEST_PLACES.map((p) => ({ ...p, group: PHASE1_GROUP })), ...WORLD_PLACES, ...user];
export const onPlaces = (fn: () => void): void => void listeners.add(fn);

export function addPlace(p: Omit<SavedPlace, 'user'>): void {
  user.push({ ...p, user: true });
  persist();
}

export function removeUserPlace(place: SavedPlace): void {
  user = user.filter((p) => p !== place);
  persist();
}
