// P1.12.3 world coverage survey, a plain script (no browser): for every Natural Earth populated place with pop_max of at
// least 500,000 (1,007 places) plus India's state capitals, count Mapillary true 360 and images of any kind within 500 m
// (500 m boxes, metadata only, no images). Resumable: chunks of 50, cached to data/coverage-survey.json after every
// place; a place that failed is asked again on the next run. Then writes docs/world-coverage-survey.md from the cache
// alone, so a rerun on the same cache gives the same numbers.
//   node scripts/coverage-survey.mjs            survey what is missing, then write the report
//   CHUNKS=4 node scripts/coverage-survey.mjs   stop after 4 chunks of 50 (resume later)
//   REPORT=1 node scripts/coverage-survey.mjs   no network: report from the cache
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mapillaryCounts } from './mapillary-count.mjs';
import { panoramaxCounts } from './panoramax-count.mjs';
import { places } from './ne-places.mjs';

const CACHE = new URL('../data/coverage-survey.json', import.meta.url);
const DOC = new URL('../docs/world-coverage-survey.md', import.meta.url);
const CHUNK = 50;
const GAP_MS = 250; // per worker; Mapillary's search limit is 10,000 a minute per app (API docs, 2026-10-09)
const WORKERS = 12; // at most about 12 x 4 = 48 requests a second, about 2,900 a minute (under a third of the limit)
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : { places: {} };
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1) + '\n');

const all = await places();
const indiaCapitals = all.filter((p) => p.country === 'India' && (p.cls === 'Admin-1 capital' || p.adm0cap));
const chosen = [...new Map([...all.filter((p) => p.popMax >= 500_000), ...indiaCapitals].map((p) => [p.id, p])).values()].sort((a, b) => a.id - b.id);
cache.meta = { source: 'Natural Earth ne_10m_populated_places_simple (public domain)', rule: 'pop_max at least 500,000, plus India state capitals (featurecla Admin-1 capital) and New Delhi', radiusM: 500, places: chosen.length };

if (process.env.REPORT !== '1') {
  const todo = chosen.filter((p) => !cache.places[p.id] || cache.places[p.id].error);
  const maxChunks = Number(process.env.CHUNKS ?? Infinity);
  console.log(`${chosen.length} places, ${todo.length} to survey`);
  for (let c = 0; c * CHUNK < todo.length && c < maxChunks; c++) {
    // WORKERS places at a time (dense cities need up to 32 box requests each); each worker paces its own calls
    const queue = todo.slice(c * CHUNK, (c + 1) * CHUNK);
    await Promise.all(Array.from({ length: WORKERS }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const r = await mapillaryCounts(p.lat, p.lon, { gapMs: GAP_MS, maxDepth: 3 }); // densest centres need 64 boxes
        cache.places[p.id] = { name: p.name, country: p.country, continent: p.continent, lat: p.lat, lon: p.lon, popMax: p.popMax, ...r, at: new Date().toISOString().slice(0, 10) };
        save();
      }
    }));
    console.log(`chunk ${c + 1}: ${Math.min((c + 1) * CHUNK, todo.length)} of ${todo.length} done`);
  }
}

// ---- Panoramax columns (P1.12.5): a second provider, asked gently (its rate limits were not found)
if (process.env.REPORT !== '1') {
  const todo = chosen.filter((p) => cache.places[p.id] && (!cache.places[p.id].pmx || cache.places[p.id].pmx.error));
  console.log(`Panoramax: ${todo.length} places to survey`);
  const queue = [...todo];
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      cache.places[p.id].pmx = await panoramaxCounts(p.lat, p.lon);
      save();
    }
  }));
}

// ---- report, from the cache only
const rows = chosen.map((p) => cache.places[p.id]).filter(Boolean);
const done = rows.filter((r) => !r.error);
const cls = (r) => (r.pano > 0 ? '360' : r.any > 0 ? 'flat' : 'none');
// any provider (Mapillary or Panoramax), where Panoramax has been asked
const both = (r) => (r.pano > 0 || r.pmx?.pano > 0 ? '360' : r.any > 0 || r.pmx?.any > 0 ? 'flat' : 'none');
const asked = done.filter((r) => r.pmx && !r.pmx.error);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)} %` : '--');
const group = (key) => {
  const m = new Map();
  for (const r of done) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
  return [...m].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
};
const line = ([k, rs]) => {
  const n = (c) => rs.filter((r) => cls(r) === c).length;
  return `| ${k} | ${rs.length} | ${n('360')} (${pct(n('360'), rs.length)}) | ${n('flat')} (${pct(n('flat'), rs.length)}) | ${n('none')} (${pct(n('none'), rs.length)}) |`;
};
const head = '| | Places | With true 360 within 500 m | Only flat photos | Nothing found |\n|---|---|---|---|---|';
const list = (c) => done.filter((r) => cls(r) === c).sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)).map((r) => `${r.name} (${r.country}${c === '360' ? `, ${r.pano}` : c === 'flat' ? `, ${r.any}${r.capped ? '+' : ''}` : ''})`).join('; ');
const md = `# World coverage survey (P1.12.3)

Mapillary street-level images within 500 m of every large populated place: ${cache.meta.rule}, from ${cache.meta.source}. ${chosen.length} places; ${done.length} surveyed${rows.length - done.length ? `, ${rows.length - done.length} failed (asked again on the next run)` : ''}${chosen.length - rows.length ? `, ${chosen.length - rows.length} not yet surveyed` : ''}. Point used: the place's Natural Earth point (usually the centre). Written by \`node scripts/coverage-survey.mjs\` from data/coverage-survey.json; a rerun on the same cache gives the same numbers.

**These counts are lower bounds.** Mapillary's search returns at most 500 images per box (marked +), and it does not always return every image in a box even below that (docs/world-coverage.md). "Nothing found" means none found by Mapillary within 500 m of that point, not that no imagery exists. Other providers (Panoramax, KartaView) are not counted here.

## By continent (Mapillary)
${head}
| **All** | ${done.length} | ${done.filter((r) => cls(r) === '360').length} (${pct(done.filter((r) => cls(r) === '360').length, done.length)}) | ${done.filter((r) => cls(r) === 'flat').length} (${pct(done.filter((r) => cls(r) === 'flat').length, done.length)}) | ${done.filter((r) => cls(r) === 'none').length} (${pct(done.filter((r) => cls(r) === 'none').length, done.length)}) |
${group('continent').map(line).join('\n')}

## Mapillary and Panoramax together
Panoramax (the second provider, P1.12.5) asked at ${asked.length} of these places, 100 pictures at most per search (+ where capped). Shares are of those ${asked.length} places.

| | Places | True 360 from either | Only flat photos | Nothing found by either | Panoramax adds a 360 Mapillary lacks |
|---|---|---|---|---|---|
${[['**All**', asked], ...[...new Set(asked.map((r) => r.continent))].sort().map((c) => [c, asked.filter((r) => r.continent === c)])].map(([k, rs]) => { const n = (c) => rs.filter((r) => both(r) === c).length; const extra = rs.filter((r) => r.pmx.pano > 0 && !(r.pano > 0)).length; return `| ${k} | ${rs.length} | ${n('360')} (${pct(n('360'), rs.length)}) | ${n('flat')} (${pct(n('flat'), rs.length)}) | ${n('none')} (${pct(n('none'), rs.length)}) | ${extra} |`; }).join(String.fromCharCode(10))}

Places where only Panoramax has a true 360 within 500 m: ${asked.filter((r) => r.pmx.pano > 0 && !(r.pano > 0)).map((r) => `${r.name} (${r.country}, ${r.pmx.pano})`).join('; ') || 'none'}.

## By country (Mapillary)
${head}
${group('country').map(line).join('\n')}

## Places with a true 360 within 500 m (number of 360 images)
${list('360') || 'none'}

## Places with only flat photos within 500 m (number of images)
${list('flat') || 'none'}

## Places with nothing found within 500 m
${list('none') || 'none'}

## Not surveyed: Mapillary refused the request
${rows.filter((r) => r.error).map((r) => `${r.name} (${r.country}): ${r.error}`).join('; ') || 'none'}. These are among the densest image areas (Mapillary refused even a box split into 64 parts); they are retried on the next run.
`;
writeFileSync(DOC, md);
console.log(`report: ${done.length} surveyed of ${chosen.length}; 360 ${done.filter((r) => cls(r) === '360').length}, flat ${done.filter((r) => cls(r) === 'flat').length}, none ${done.filter((r) => cls(r) === 'none').length}`);
