// How many buildings OpenStreetMap has around a point, and how many carry a height or building:levels tag: one small
// "out count" query to the public Overpass API (fair use: one request at a time, only after a click has settled).

export type OsmCountFailure = 'offline' | 'rate-limit' | 'busy' | 'error';
export class OsmCountError extends Error {
  constructor(
    readonly kind: OsmCountFailure,
    message: string,
  ) {
    super(message);
    this.name = 'OsmCountError';
  }
}

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** The Overpass query: buildings (ways and relations) in a box of +-half metres, then those with a height or levels tag. */
export function buildingQuery(lat: number, lon: number, half: number): string {
  const dLat = half / 110_574;
  const dLon = half / (111_320 * Math.cos((lat * Math.PI) / 180));
  const box = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => v.toFixed(6)).join(',');
  return `[out:json][timeout:15];(way["building"](${box});relation["building"](${box}););out count;(way["building"]["height"](${box});relation["building"]["height"](${box});way["building"]["building:levels"](${box});relation["building"]["building:levels"](${box}););out count;`;
}

/** Reads the two count elements of the reply; anything else is an error. */
export function parseCounts(status: number, body: unknown): { buildings: number; tagged: number } {
  if (status === 429) throw new OsmCountError('rate-limit', 'Overpass rate limit (HTTP 429)');
  if (status === 504 || status === 503) throw new OsmCountError('busy', `Overpass busy (HTTP ${status})`);
  const els = (body as { elements?: { type?: string; tags?: { total?: string } }[] } | undefined)?.elements;
  const counts = (els ?? []).filter((e) => e.type === 'count').map((e) => Number(e.tags?.total));
  if (status !== 200 || counts.length !== 2 || counts.some((n) => !Number.isFinite(n))) throw new OsmCountError('error', `unexpected Overpass reply (HTTP ${status})`);
  return { buildings: counts[0], tagged: counts[1] };
}

export async function countBuildings(lat: number, lon: number, half: number, signal?: AbortSignal, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<{ buildings: number; tagged: number }> {
  let reply: Response;
  try {
    reply = await fetchFn(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: buildingQuery(lat, lon, half) }), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new OsmCountError('offline', 'no connection to Overpass');
  }
  return parseCounts(reply.status, await reply.json().catch(() => undefined));
}
