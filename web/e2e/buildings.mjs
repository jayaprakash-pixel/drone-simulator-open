// P1.8.4 how many Cesium OSM Buildings actually appear at the screenshot spot and the seven test places. The camera ends
// where a fly-to ends (1 km away, tilted 40 degrees, north up) and every building drawn within 500 m of the place centre
// is counted once (by its OpenStreetMap id). Buildings without a height tag get an estimated height from Cesium.
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
const viewport = { width: 1280, height: 720 };
const { browser, page, log } = await open('?e2e=1', { viewport });
const rows = [];
try {
  await settledAt(page, 40_000);
  await page.waitForFunction(() => window.__dw.globe.buildings()?.show === true, null, { timeout: 30_000 });
  const count = (lat, lon) =>
    page.evaluate(
      ([la, lo]) =>
        new Promise((resolve) => {
          const tileset = window.__dw.globe.buildings();
          const seen = new Map();
          let props = null;
          const R = Math.PI / 180;
          const off = tileset.tileVisible.addEventListener((tile) => {
            const c = tile.content;
            for (let i = 0; i < c.featuresLength; i++) {
              const f = c.getFeature(i);
              props ??= f.getPropertyIds();
              const flat = f.getProperty('cesium#latitude');
              const flon = f.getProperty('cesium#longitude');
              if (!Number.isFinite(flat) || !Number.isFinite(flon)) continue;
              const d = 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((flat - la) * R) / 2) ** 2 + Math.cos(la * R) * Math.cos(flat * R) * Math.sin(((flon - lo) * R) / 2) ** 2));
              if (d <= 500) seen.set(f.getProperty('elementId') ?? `${flat},${flon}`, { h: f.getProperty('cesium#estimatedHeight'), tagged: f.getProperty('height') !== undefined || f.getProperty('building:levels') !== undefined });
            }
          });
          window.__dw.viewer.scene.requestRender(); // one frame: tileVisible fires for every tile drawn in it
          setTimeout(() => {
            off();
            const v = [...seen.values()];
            resolve({ count: v.length, tagged: v.filter((b) => b.tagged).length, tallest: v.reduce((m, b) => Math.max(m, Number(b.h) || 0), 0), props });
          }, 800);
        }),
      [lat, lon],
    );
  const settle = () => page.waitForFunction(() => window.__dw.settled(), null, { timeout: 90_000 }).then(() => true, () => false);
  for (const [name, lat, lon] of PLACES) {
    // 1. what a fly-to shows: 1 km away, tilted, default detail
    await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), [lat, lon]);
    await cameraRest(page, 25_000);
    const loaded = await settle();
    const shown = await count(lat, lon);
    // 2. what the data holds: straight down from 1.6 km (the whole 500 m circle in view) with every building tile loaded
    await page.evaluate(([la, lo]) => {
      const { globe } = window.__dw;
      globe.buildings().maximumScreenSpaceError = 1;
      globe.topDown = true;
      return globe.flyToPlace(la, lo, 1600);
    }, [lat, lon]);
    await cameraRest(page, 25_000);
    const loadedAll = await settle();
    const all = await count(lat, lon);
    await page.evaluate(() => { window.__dw.globe.buildings().maximumScreenSpaceError = 16; window.__dw.globe.topDown = false; });
    rows.push({ name, loaded: loaded && loadedAll, ...shown, inData: all.count, taggedAll: all.tagged, tallestAll: all.tallest });
    console.log(`info  ${name}: ${shown.count} drawn in the fly-to view, ${all.count} in the data within 500 m (${all.tagged} with a height tag), tallest ${Math.round(all.tallest)} m`);
  }
  const props = rows.find((r) => r.props)?.props ?? [];
  console.log(`info  feature properties: ${props.join(', ')}`);
  check('P1.8.4 the building features carry a position and an OpenStreetMap id', props.includes('cesium#latitude') && props.includes('elementId'), props.slice(0, 12).join(', '));
  check('P1.8.4 every place was counted with its tiles loaded', rows.every((r) => r.loaded), rows.filter((r) => !r.loaded).map((r) => r.name).join(', ') || 'all loaded');
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  console.log(`info  JS heap after the tour: ${heap} MB`);
  rows.heap = heap;
  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
} finally {
  await browser.close();
}

writeSection(
  'buildings',
  `## 3D buildings at the test places (P1.8.4, e2e/buildings.mjs)

Last run ${new Date().toISOString().slice(0, 10)}, Cesium OSM Buildings (ion asset 96188, OpenStreetMap data of 2026-06-08), ${viewport.width}x${viewport.height} window. Two counts of the buildings within 500 m of each place centre, each building counted once by its OpenStreetMap id: as drawn where a fly-to ends (1 km away, tilted 40 degrees, default detail: Cesium draws the larger buildings first and adds small ones as you zoom in), and everything in the data (straight down from 1.6 km with every building tile loaded). Buildings without a height or levels tag get a height Cesium estimates.

| Place | Drawn after a fly-to | In the OpenStreetMap data | With a height or levels tag | Tallest |
|---|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.count} | ${r.inData} | ${r.taggedAll} | ${Math.round(r.tallestAll)} m |`).join('\n')}

JS heap after the eight places: ${rows.heap} MB (buildings tile cache capped at 128 MB plus 64 MB overflow).`,
);
done();
