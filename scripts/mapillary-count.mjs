// Mapillary image counts near a point (metadata only, no images): true 360 and images of any kind within `radius` m,
// from 500 m boxes on the Graph API search endpoint. A box Mapillary refuses as "too much data" is asked again as four
// quarters, at most twice over as the app does (maxDepth; the survey allows 3 for the densest city centres). Rate limit: search API 10,000 per minute per app (Mapillary API docs,
// read 2026-10-09); `gapMs` paces the calls far below that. Used by world-coverage.mjs and coverage-survey.mjs.
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
export const mlyToken = /^VITE_MAPILLARY_TOKEN=(.*)$/m.exec(env)?.[1]?.trim();
const R = Math.PI / 180;
export const metres = (a, b, c, d) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((c - a) * R) / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin(((d - b) * R) / 2) ** 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function box([w, s, e, n], pano, depth, gapMs, maxDepth = 2) {
  await sleep(gapMs);
  const r = await fetch(`https://graph.mapillary.com/images?fields=id,geometry,computed_geometry&bbox=${[w, s, e, n].map((v) => v.toFixed(6)).join(',')}&limit=500${pano ? '&is_pano=true' : ''}`, { headers: { Authorization: `OAuth ${mlyToken}` } });
  const b = await r.json().catch(() => ({}));
  if (r.status === 500 && /reduce the amount of data/i.test(b?.error?.message ?? '') && depth < maxDepth) {
    const [mx, my] = [(w + e) / 2, (s + n) / 2];
    const parts = [];
    for (const q of [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]]) parts.push(await box(q, pano, depth + 1, gapMs, maxDepth));
    if (parts.some((p) => p.error)) return parts.find((p) => p.error);
    return { data: [...new Map(parts.flatMap((p) => p.data).map((g) => [g.id, g])).values()], capped: parts.some((p) => p.capped) };
  }
  if (!r.ok || !Array.isArray(b.data)) return { error: `Mapillary HTTP ${r.status}: ${b?.error?.message ?? 'no data'}` };
  return { data: b.data, capped: b.data.length >= 500 };
}

/** { pano, any, capped } within `radius` m of lat, lon, or { error } */
export async function mapillaryCounts(lat, lon, { radius = 500, gapMs = 1000, maxDepth = 2 } = {}) {
  if (!mlyToken) return { error: 'no Mapillary token' };
  const dLat = radius / 110_000, dLon = radius / (111_000 * Math.cos(lat * R));
  const out = {};
  for (const [k, pano] of [['pano', true], ['any', false]]) {
    const res = await box([lon - dLon, lat - dLat, lon + dLon, lat + dLat], pano, 0, gapMs, maxDepth);
    if (res.error) return { error: res.error };
    out[k] = res.data.filter((g) => { const c = (g.computed_geometry ?? g.geometry)?.coordinates; return c && metres(lat, lon, c[1], c[0]) <= radius; }).length;
    if (!pano) out.capped = res.capped;
  }
  return out;
}
