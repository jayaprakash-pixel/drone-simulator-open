// P1.8.6 live run, once the owner's free Mapillary client token is in web/.env.local (VITE_MAPILLARY_TOKEN, then
// `npm run build`): measures 360 coverage at the screenshot spot and the seven test places straight from the Graph API,
// opens a real panorama in the app, and checks that git does not hold the token. The token is never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { checker, clickAt, open, settledAt, writeSection } from './lib.mjs';

const { check, done } = checker();
const envFile = new URL('../.env.local', import.meta.url);
const token = (existsSync(envFile) && /^VITE_MAPILLARY_TOKEN=(.*)$/m.exec(readFileSync(envFile, 'utf8'))?.[1]?.trim()) || '';
if (!token) {
  console.log('No Mapillary token yet: create a free client token at https://www.mapillary.com/dashboard/developers, put it in web/.env.local as VITE_MAPILLARY_TOKEN=..., run npm run build, then run this again.');
  process.exit(1);
}
const PLACES = [
  ['Screenshot spot (Bhawanipatna)', 19.906844, 83.16979],
  ['Jaipur', 26.9124, 75.7873],
  ['Jaisalmer', 26.9157, 70.9083],
  ['Mount Abu', 24.5926, 72.7156],
  ['Pushkar', 26.4897, 74.5511],
  ['Thar Desert', 27.0, 70.3],
  ['Spiti Valley', 32.2276, 78.0719],
  ['Tokyo', 35.6762, 139.6503],
];
const R = Math.PI / 180;
const metres = (la1, lo1, la2, lo2) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((la2 - la1) * R) / 2) ** 2 + Math.cos(la1 * R) * Math.cos(la2 * R) * Math.sin(((lo2 - lo1) * R) / 2) ** 2));

// the same search the app makes: bbox (minLon,minLat,maxLon,maxLat), 360 panoramas only, token in the header
async function panos(lat, lon, radius, panoOnly = true) {
  const dLat = radius / 110_000;
  const dLon = radius / (111_000 * Math.cos(lat * R));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(',');
  const r = await fetch(`https://graph.mapillary.com/images?fields=id,geometry,computed_geometry,captured_at,is_pano&bbox=${bbox}&limit=500${panoOnly ? '&is_pano=true' : ''}`, { headers: { Authorization: `OAuth ${token}` } });
  const body = await r.json();
  if (!r.ok || !Array.isArray(body.data)) throw new Error(`Graph API HTTP ${r.status}: ${body?.error?.message ?? 'no data'}`);
  const near = body.data
    .map((g) => ({ g, c: (g.computed_geometry ?? g.geometry)?.coordinates }))
    .filter(({ c }) => c && metres(lat, lon, c[1], c[0]) <= radius);
  const sorted = near.map(({ c }) => ({ d: metres(lat, lon, c[1], c[0]), at: [c[1], c[0]] })).sort((a, b) => a.d - b.d);
  return { count: near.length, capped: body.data.length >= 500, newest: near.reduce((m, { g }) => Math.max(m, g.captured_at ?? 0), 0), nearest: sorted[0]?.d, nearestAt: sorted[0]?.at };
}

const rows = [];
for (const [name, lat, lon] of PLACES) {
  try {
    const [p100, p500, any500] = [await panos(lat, lon, 100), await panos(lat, lon, 500), await panos(lat, lon, 500, false)];
    // like the app: the 1 km box only where nothing lies within 500 m (Mapillary refuses 1 km boxes in dense areas)
    const p1k = p500.count > 0 ? { ...p500, count: `${p500.count}${p500.capped ? '+' : ''} (500 m)`, capped: false } : await panos(lat, lon, 1000);
    rows.push({ name, lat, lon, p100, p500, p1k, any500 });
    console.log(`info  ${name}: ${p100.count} panoramas within 100 m, ${p500.count}${p500.capped ? '+' : ''} within 500 m, ${p1k.count} within 1 km; ${any500.count}${any500.capped ? '+' : ''} images of any kind within 500 m`);
  } catch (e) {
    rows.push({ name, lat, lon, error: String(e.message ?? e) });
  }
}
check('P1.8.6 the Graph API answered for all eight places with this token', rows.every((r) => !r.error), rows.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`).join('; '));

// open real images in the app, as you would: click the place, Enter place (360), and Go to nearest if that is offered.
// Pushkar (most Mapillary images of the Indian places, none of them 360) and Tokyo (360 panoramas within 1 km).
// A third run clicks exactly where Tokyo's nearest true 360 panorama is, to see a real 360 in the viewer.
const opened = [];
const tokyo360 = rows.find((r) => r.name === 'Tokyo')?.p500?.nearestAt;
const LIVE = [['Pushkar', 26.4897, 74.5511, 'pano-open-live-pushkar'], ['Tokyo', 35.6762, 139.6503, 'pano-open-live-tokyo']];
if (tokyo360) LIVE.push(['Tokyo, at a 360 panorama', tokyo360[0], tokyo360[1], 'pano-open-live-360']);
for (const [name, lat, lon, shot] of LIVE) {
  const { browser, page, log } = await open('?e2e=1&pano=mapillary', { viewport: { width: 1280, height: 800 } });
  try {
    await settledAt(page, 40_000);
    await page.evaluate(([la, lo]) => window.__dw.globe.flyToPlace(la, lo, 1000), [lat, lon]);
    await page.waitForTimeout(4000);
    await clickAt(page);
    await page.waitForSelector('#side:not(.hidden)');
    await page.click('#enter-place');
    const first = await Promise.race([
      page.waitForSelector('#pano-view:not(.hidden)', { timeout: 30_000 }).then(() => 'opened'),
      page.waitForSelector('#pano-none', { timeout: 30_000 }).then(() => 'none'),
      page.waitForSelector('#notices [id^="pano-"]', { timeout: 30_000 }).then(() => 'failure'),
    ]).catch(() => 'nothing');
    let none = '';
    if (first === 'none') {
      none = await page.locator('#pano-none').innerText();
      console.log(`info  ${name}: ${none}`);
      if (await page.locator('#pano-go-nearest').count()) await page.click('#pano-go-nearest');
    }
    const ok = await page.waitForFunction(() => /captured/.test(document.querySelector('#pano-info')?.textContent ?? ''), null, { timeout: 45_000 }).then(() => true, () => false);
    await page.waitForTimeout(4000); // let MapillaryJS draw the picture before the screenshot
    const info = await page.locator('#pano-info').innerText().catch(() => '');
    const notice = await page.locator('#notices [id^="pano-"]').allInnerTexts();
    if (ok) await page.screenshot({ path: new URL(`../../docs/shots/${shot}.png`, import.meta.url).pathname.slice(1) });
    const m = await page.evaluate(() => window.__dw.panoMarker());
    console.log(`info  ${name}: ${ok ? info : `not opened (${first}; ${notice.join(' ') || none})`}`);
    check(`P1.8.6 ${name}: a real Mapillary image opens from the clicked point, with capture date, distance and the globe marker`, ok && /Mapillary/.test(info) && !!m, info || notice.join(' '));
    check(`P1.8.6 ${name}: 0 console errors, 0 uncaught exceptions`, log.errors.length === 0, log.errors.join(' | '));
    opened.push({ name, info: ok ? info : `not opened: ${notice.join(' ') || none}` });
  } finally {
    await browser.close();
  }
}
rows.opened = opened;

const inGit = (() => {
  try {
    execFileSync('git', ['grep', '-F', '-q', token], { cwd: new URL('../..', import.meta.url) });
    return true; // exit 0: found
  } catch {
    return false; // exit 1: not found
  }
})();
check('P1.8.6 git grep finds the Mapillary token nowhere in tracked files', !inGit);

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '--');
writeSection(
  'coverage',
  `## Street-level 360 coverage (P1.8.6, e2e/pano-live.mjs)

Last run ${new Date().toISOString().slice(0, 10)}, Mapillary Graph API, true 360 panoramas only (is_pano), counted within 100 m and 500 m of each point (the app asks for at most 500 per search, shown as 500+).

| Place | 360 within 100 m | 360 within 500 m | 360 within 1 km | Nearest 360 | Newest 360 within 1 km | Images of any kind within 500 m |
|---|---|---|---|---|---|---|
${rows.map((r) => (r.error ? `| ${r.name} | error | ${r.error} | | | | |` : `| ${r.name} | ${r.p100.count} | ${r.p500.count}${r.p500.capped ? '+' : ''} | ${r.p1k.count}${r.p1k.capped ? '+' : ''} | ${r.p1k.nearest === undefined ? 'none within 1 km' : `${Math.round(r.p1k.nearest)} m`} | ${day(r.p1k.newest)} | ${r.any500.count}${r.any500.capped ? '+' : ''} |`)).join('\n')}

Opened live in the app (click the place centre, Enter place (360), Go to nearest if offered):
${(rows.opened ?? []).map((o) => `- ${o.name}: ${o.info}`).join('\n')}`,
);
done();
