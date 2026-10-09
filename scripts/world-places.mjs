// P1.10.1: resolves data/world-places.json. A place with a "query" is looked up with Nominatim (one request a second,
// as its usage policy asks) and its centre is checked against a second, independent source: the coordinate Wikidata
// holds for the same thing (Nominatim's wikidata tag). A place with fixed lat/lon is checked by reverse geocoding.
// Results (lat, lon, check) are written back into the same file; places that already have lat/lon are skipped, so
// deleting a place's lat/lon resolves it again. Run: node scripts/world-places.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../data/world-places.json', import.meta.url);
const UA = { 'User-Agent': 'drone-world-simulator/0.1 (personal flight-rehearsal tool; one-off place check)', 'Accept-Language': 'en' };
const R = Math.PI / 180;
const km = (a, b, c, d) => (2 * 6371.0088 * Math.asin(Math.sqrt(Math.sin(((c - a) * R) / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin(((d - b) * R) / 2) ** 2)));
let last = 0;
async function nominatim(path) {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const r = await fetch(`https://nominatim.openstreetmap.org/${path}`, { headers: UA });
  if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
  return r.json();
}
async function wikidataCoord(qid) {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: UA });
  if (!r.ok) return undefined;
  const v = (await r.json()).entities?.[qid]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return v ? { lat: v.latitude, lon: v.longitude } : undefined;
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));
for (const p of data.places) {
  if (Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.check) continue;
  try {
    if (p.query) {
      // prefer the settlement itself (a place=city/town/village point) over an administrative area of the same name:
      // "Narok, Kenya" first returns Narok County, whose middle is 21 km from the town
      const hits = await nominatim(`search?${new URLSearchParams({ q: p.query, format: 'jsonv2', limit: '5', extratags: '1' })}`);
      const hit = hits.find((h) => h.category === 'place' && ['city', 'town', 'village', 'hamlet'].includes(h.type)) ?? hits[0];
      if (!hit) { p.check = 'NOT RESOLVED: Nominatim found nothing'; console.log(`${p.name}: not found`); continue; }
      p.lat = Number(Number(hit.lat).toFixed(6));
      p.lon = Number(Number(hit.lon).toFixed(6));
      p.osm = `${hit.osm_type}/${hit.osm_id} (${hit.category}=${hit.type})`;
      const qid = hit.extratags?.wikidata;
      const w = qid && (await wikidataCoord(qid));
      const d = w ? km(p.lat, p.lon, w.lat, w.lon) : undefined;
      let note = '';
      if (d === undefined || d > 2) {
        // the two sources disagree (or there is no second one): say where the point actually is, for a human to judge
        const rev = await nominatim(`reverse?${new URLSearchParams({ lat: String(p.lat), lon: String(p.lon), format: 'jsonv2', zoom: '14' })}`);
        note = `; the point lies in: ${rev.display_name ?? 'nothing found'}`;
      }
      p.check = (d === undefined ? 'no second source: no Wikidata coordinate for this OSM object' : `Wikidata ${qid} centre ${d.toFixed(2)} km away${d > 2 ? ' - CHECK: over 2 km' : ''}`) + note;
    } else {
      const rev = await nominatim(`reverse?${new URLSearchParams({ lat: String(p.lat), lon: String(p.lon), format: 'jsonv2', zoom: '10' })}`);
      p.check = `fixed point (${p.why}); reverse geocode: ${rev.display_name ?? 'nothing'}`;
    }
    console.log(`${p.name}: ${p.lat}, ${p.lon} | ${p.check}`);
  } catch (e) {
    p.check = `NOT RESOLVED: ${e.message}`;
    console.log(`${p.name}: ${p.check}`);
  }
}
writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n');
console.log(`${data.places.filter((p) => Number.isFinite(p.lat)).length} of ${data.places.length} places have coordinates`);
