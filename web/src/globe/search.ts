// Place search with Nominatim (OpenStreetMap). The public server's rules (plan p.8): search on Enter only, never as you
// type; at most one request per second; up to five results. This module owns the second and third rule.
export interface Place {
  name: string;
  lat: number;
  lon: number;
  /** [south, north, west, east] in degrees */
  bbox: [number, number, number, number];
  /** what it is, as Nominatim names it: city, administrative, county, ... */
  kind: string;
  /** a single point (an OpenStreetMap node): its bounding box is a nominal square, so it is framed as a town instead */
  point: boolean;
}

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: string[];
  osm_type?: string;
  category?: string;
  type?: string;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
export const MIN_GAP_MS = 1000;

function parse(json: unknown): Place[] {
  if (!Array.isArray(json)) return [];
  return (json as NominatimItem[])
    .slice(0, 5)
    .map((r) => ({
      name: String(r.display_name),
      lat: Number(r.lat),
      lon: Number(r.lon),
      bbox: (r.boundingbox ?? []).map(Number) as Place['bbox'],
      kind: String(r.type ?? r.category ?? ''),
      point: r.osm_type === 'node',
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.bbox.length === 4 && p.bbox.every(Number.isFinite));
}

/**
 * Returns a search function. A call inside the one-second gap is held back until the gap ends; the newest held query wins
 * and a repeat of the query already sent is dropped. Resolves to the places, or null when the call was dropped or superseded.
 */
export function createSearch(doFetch: typeof fetch = (...args) => fetch(...args)) {
  let lastSent = -Infinity;
  let lastQuery = '';
  let held: { q: string; resolve: (p: Place[] | null) => void; reject: (e: unknown) => void } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function send(q: string): Promise<Place[]> {
    lastSent = Date.now();
    lastQuery = q;
    const res = await doFetch(`${ENDPOINT}?${new URLSearchParams({ q, format: 'jsonv2', limit: '5' })}`);
    if (!res.ok) throw new Error(`place search failed (HTTP ${res.status})`);
    return parse(await res.json());
  }

  return function search(query: string): Promise<Place[] | null> {
    const q = query.trim();
    if (!q) return Promise.resolve([]);
    const wait = lastSent + MIN_GAP_MS - Date.now();
    if (wait <= 0 && !held) return send(q);
    if (q === lastQuery && !held) return Promise.resolve(null);
    held?.resolve(null); // superseded by the newer query
    return new Promise((resolve, reject) => {
      held = { q, resolve, reject };
      clearTimeout(timer);
      timer = setTimeout(() => {
        const h = held!;
        held = null;
        send(h.q).then(h.resolve, h.reject);
      }, Math.max(wait, 0));
    });
  };
}
