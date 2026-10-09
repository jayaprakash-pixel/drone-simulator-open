// P1.12.5 KartaView check: does KartaView have photos where neither Mapillary nor Panoramax found anything? A seeded
// sample of 40 such places from data/coverage-survey.json, one request each within 100 m (its API answered "Query
// timeout. Narrow your filter" for 500 m even in Bucharest, 2026-10-09), paced at 100 requests an hour (the limit noted
// for KartaView without a token). Metadata only. Results cached in data/kartaview-probe.json (resumable).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { seeded } from './ne-places.mjs';

const OUT = new URL('../data/kartaview-probe.json', import.meta.url);
const survey = JSON.parse(readFileSync(new URL('../data/coverage-survey.json', import.meta.url), 'utf8')).places;
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const nothing = Object.entries(survey).filter(([, r]) => !r.error && !(r.any > 0) && r.pmx && !r.pmx.error && !(r.pmx.any > 0)).sort(([a], [b]) => a - b);
const rnd = seeded(20261009);
const pool = [...nothing], picks = [];
while (picks.length < 40 && pool.length) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
console.log(`${nothing.length} places with nothing from Mapillary or Panoramax; probing ${picks.length}`);
for (const [id, r] of picks) {
  if (out[id] && !out[id].error) continue;
  let res;
  try {
    const reply = await fetch(`https://api.openstreetcam.org/2.0/photo/?lat=${r.lat}&lng=${r.lon}&radius=100&itemsPerPage=10`, { signal: AbortSignal.timeout(40_000) });
    const b = await reply.json().catch(() => ({}));
    res = b?.status?.apiCode === 600 ? { photos: (b.result?.data ?? []).length } : b?.status?.apiCode === 601 ? { photos: 0 } : { error: `${b?.status?.apiCode ?? reply.status} ${b?.status?.apiMessage ?? ''}`.trim() };
  } catch (e) {
    res = { error: String(e.message ?? e) };
  }
  out[id] = { name: r.name, country: r.country, continent: r.continent, ...res, at: new Date().toISOString().slice(0, 10) };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`${r.name} (${r.country}): ${JSON.stringify(res)}`);
  await new Promise((s) => setTimeout(s, 36_000)); // 100 an hour
}
const rows = picks.map(([id]) => out[id]).filter(Boolean);
console.log(`done: ${rows.length} probed; KartaView photos within 100 m at ${rows.filter((r) => r.photos > 0).length}; none at ${rows.filter((r) => r.photos === 0).length}; errors ${rows.filter((r) => r.error).length}`);
