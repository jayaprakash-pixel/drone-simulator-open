// Panoramax picture counts near a point (metadata only): true 360 (field_of_view = 360) and pictures of any kind within
// `radius` m, from one bbox search each on the open STAC API (no key). Answers are capped at `limit` (marked capped).
// Rate limits: NOT FOUND in Panoramax's API description or docs (2026-10-09), so callers pace gently.
import { metres } from './mapillary-count.mjs';

const API = 'https://api.panoramax.xyz/api/search';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function panoramaxCounts(lat, lon, { radius = 500, gapMs = 500, limit = 100 } = {}) {
  const dLat = radius / 110_000, dLon = radius / (111_000 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(',');
  const out = {};
  for (const [k, filter] of [['pano', 'field_of_view = 360'], ['any', null]]) {
    await sleep(gapMs);
    const q = new URLSearchParams({ bbox, limit: String(limit) });
    if (filter) q.set('filter', filter);
    let r;
    try {
      r = await fetch(`${API}?${q}`);
    } catch (e) {
      return { error: `Panoramax unreachable: ${e.message}` };
    }
    if (!r.ok) return { error: `Panoramax HTTP ${r.status}` };
    const f = (await r.json().catch(() => ({}))).features ?? [];
    out[k] = f.filter((x) => metres(lat, lon, x.geometry.coordinates[1], x.geometry.coordinates[0]) <= radius).length;
    if (!filter) out.capped = f.length >= limit;
  }
  return out;
}
