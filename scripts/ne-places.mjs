// Natural Earth populated places (public domain, github.com/nvkelso/natural-earth-vector) with their continent, and a
// seeded sample. Used by web/e2e/random-places.mjs (P1.12.2) and scripts/coverage-survey.mjs (P1.12.3).
// The files are downloaded once into data/naturalearth (git-ignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = new URL('../data/naturalearth/', import.meta.url);
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const FILES = { places: 'ne_10m_populated_places_simple.geojson', countries: 'ne_110m_admin_0_countries.geojson' };

async function load(name) {
  const url = new URL(name, DIR);
  if (!existsSync(url)) {
    mkdirSync(DIR, { recursive: true });
    const r = await fetch(BASE + name);
    if (!r.ok) throw new Error(`Natural Earth ${name}: HTTP ${r.status}`);
    writeFileSync(url, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Every place: { id, name, country, iso, lat, lon, popMax, continent, cls }. Continent from the countries file by
 *  country code (or its sovereign's); 'unknown' where neither is in the 110m file. */
export async function places() {
  const countries = (await load(FILES.countries)).features.map((f) => f.properties);
  const cont = new Map(countries.flatMap((p) => [[p.ADM0_A3, p.CONTINENT], [p.SOV_A3, p.CONTINENT]]));
  return (await load(FILES.places)).features.map(({ properties: p }) => ({
    id: p.ne_id, name: p.name, country: p.adm0name, iso: p.iso_a2, lat: p.latitude, lon: p.longitude, popMax: p.pop_max ?? 0,
    continent: cont.get(p.adm0_a3) ?? cont.get(p.sov_a3) ?? 'unknown', cls: p.featurecla, adm0cap: Boolean(p.adm0cap),
  }));
}

/** mulberry32: a small seeded random number generator, so a sample can be drawn again exactly */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];

/** `per` places from each continent, drawn without repeats with the seed. */
export function sample(all, seed, per = 5) {
  const rnd = seeded(seed);
  return CONTINENTS.flatMap((c) => {
    const pool = all.filter((p) => p.continent === c && Number.isFinite(p.lat));
    const out = [];
    while (out.length < per && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  });
}
