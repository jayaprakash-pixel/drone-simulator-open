// P1.8.7 imagery sources: every layer in the switch names its source and its capture date, or says the source does not
// publish one; the Sentinel-2 cloudless layer (EOX) loads with its credit on screen; only one imagery layer is ever shown
// (Cesium ion's terms forbid combining its Bing imagery with other imagery). Then the dated evidence for the screenshot
// spot and the seven test places goes to docs/data-quality.md: Bing's date is not published through ion, EOX's mosaic is
// 2025, and, for comparison only (Esri is not in the app: its terms need an ArcGIS account key), what Esri's public
// imagery metadata says at the same points (one request per point).
import { cameraRest, checker, open, settledAt, writeSection } from './lib.mjs';

const { check, done } = checker();
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

const { browser, page, log } = await open('?e2e=1', { viewport: { width: 960, height: 600 } });
const eox = [];
page.on('response', (r) => r.url().includes('tiles.maps.eox.at') && eox.push(r.status()));
let bingCredits = '';
try {
  await settledAt(page, 40_000);
  await page.evaluate(() => window.__dw.globe.imageryReady);
  const settled = () => page.waitForFunction(() => window.__dw.settled(), null, { timeout: 30_000 }).catch(() => console.log('info  tiles still loading'));
  const label = () => page.locator('#imagery-source').innerText();
  const shown = () => page.evaluate(() => { const v = window.__dw.viewer; return Array.from({ length: v.imageryLayers.length }, (_, i) => v.imageryLayers.get(i).show); });
  const bar = () => page.locator('#credits').innerText();

  await page.evaluate(() => void window.__dw.globe.flyToPlace(19.906844, 83.16979, 1000));
  await cameraRest(page, 20_000);
  await settled();
  let l = await label();
  bingCredits = (await page.locator('#credits-inline').innerText()).replace(/^Data: /, '');
  check('P1.8.7 satellite: the label names the source (Bing Maps Aerial via Cesium ion) and says its capture date is not published', /Bing Maps Aerial via Cesium ion/.test(l) && /capture date not published by this source/.test(l), l);

  const firstTile = page.waitForResponse((r) => r.url().includes('tiles.maps.eox.at'), { timeout: 20_000 }).catch(() => null);
  await page.selectOption('#layer-select', 's2');
  await firstTile; // "tiles loaded" is still true from the old layer until the new one starts asking
  await page.waitForTimeout(500);
  await settled();
  l = await label();
  const s2bar = await bar();
  const s2shown = await shown();
  check('P1.8.7 Sentinel-2: the label names EOX, the 2025 mosaic and that it is coarse', /Sentinel-2 cloudless by EOX/.test(l) && /2025/.test(l) && /coarse/.test(l), l);
  check('P1.8.7 Sentinel-2: tiles load from EOX (all HTTP 200)', eox.length > 0 && eox.every((s) => s === 200), `${eox.length} tiles, statuses ${[...new Set(eox)].join(',')}`);
  check('P1.8.7 Sentinel-2: the EOX credit is in the bottom bar', /EOxCloudless/.test(s2bar) && /Copernicus Sentinel data 2025/.test(s2bar), s2bar.slice(0, 200));
  check('P1.8.7 exactly one imagery layer is shown at a time (never Bing plus another)', s2shown.filter(Boolean).length === 1 && s2shown[1] === true, JSON.stringify(s2shown));

  await page.selectOption('#layer-select', 'streets');
  l = await label();
  check('P1.8.7 streets: the label says it is a drawn map (OpenStreetMap), not imagery', /OpenStreetMap standard map/.test(l) && /not imagery/.test(l), l);
  await page.selectOption('#layer-select', 'satellite');
  check('P1.8.7 back on satellite, only the ion layer is shown', JSON.stringify(await shown()) === '[true,false,false]', JSON.stringify(await shown()));
  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
} finally {
  await browser.close();
}

// Esri's public imagery metadata (no key): the finest dated record at each point, for comparison only. Esri sometimes
// answers a point with no dated record and then answers it fine a moment later (2026-10-09: 1 to 3 of 8 empty per run,
// different points each time), so an empty answer is asked again up to 3 times and the tries are reported.
const esri = [];
for (const [name, lat, lon] of PLACES) {
  const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all', tolerance: '0', mapExtent: `${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}`, imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' });
  let entry = { name, tries: 0 };
  for (let attempt = 1; attempt <= 3 && !entry.best; attempt++) {
    entry.tries = attempt;
    try {
      const r = await (await fetch(`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/identify?${q}`)).json();
      entry.best = (r.results ?? [])
        .filter((x) => x.layerId >= 5 && /^\d{8}$/.test(x.attributes?.SRC_DATE ?? ''))
        .sort((a, b) => Number(a.attributes.SRC_RES) - Number(b.attributes.SRC_RES))[0]?.attributes;
    } catch (e) {
      entry.error = String(e);
    }
    if (!entry.best && attempt < 3) await new Promise((r) => setTimeout(r, 1500));
  }
  esri.push(entry);
}
const day = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
check('Esri metadata answered for all eight points', esri.every((e) => e.best), esri.map((e) => `${e.name}: ${e.best ? day(e.best.SRC_DATE) : e.error ?? 'none'}${e.tries > 1 ? ` (${e.tries} tries)` : ''}`).join('; '));

writeSection(
  'imagery-dates',
  `## Imagery sources and capture dates (P1.8.7, e2e/imagery.mjs)

Last run ${new Date().toISOString().slice(0, 10)}. The layer switch shows one source at a time, with its capture date next to it, or the words "capture date not published by this source".

- **Satellite (default): Bing Maps Aerial through Cesium ion.** Cesium ion does not pass on capture dates, and Bing's own date lookup (vintageStart and vintageEnd in its imagery metadata API) needs a Bing Maps key: free Bing keys stopped working on 30 June 2025 and no new enterprise customers are accepted, so this app cannot establish Bing's dates. What can be seen: at the screenshot spot the credits name ${bingCredits.split(' · ').slice(0, 4).join(', ')}, the same at all seven test places (the "(2026)" after CNES is a copyright year, not a capture date). Cesium says Bing through ion is guaranteed only "at least through September 2026" and that alternative imagery is coming.
- **Sentinel-2 cloudless 2025 (EOX).** A mosaic of summer-like 2025 Sentinel-2 images (EOX does not publish the months per region), 10 m per pixel: recent, but far too coarse to show buildings or streets.
- **Streets (OpenStreetMap).** A drawn map, not imagery.

For comparison only, Esri World Imagery's public metadata at the same points (Esri is not in the app: its terms allow it only with an ArcGIS account key; a free tier exists):

| Place | Esri capture date | Resolution | Satellite | Product |
|---|---|---|---|---|
${esri.map((e) => (e.best ? `| ${e.name} | ${day(e.best.SRC_DATE)} | ${Number(e.best.SRC_RES).toFixed(2)} m | ${e.best.SRC_DESC} | ${e.best.NICE_NAME} (${e.best.NICE_DESC}) |` : `| ${e.name} | -- | -- | -- | -- |`)).join('\n')}

So the free sources are not all equally old: Esri publishes recent, dated, sharp imagery for most of these points, while Bing's date through ion cannot be established and EOX is recent but coarse.`,
);
done();
