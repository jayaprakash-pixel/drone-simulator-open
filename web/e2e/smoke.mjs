// Smoke check: the app loads, the globe renders, Cesium finds its static assets, nothing logs an error.
// Run against the dev server (default) or a built page: E2E_URL=http://127.0.0.1:3003/ npm run e2e:smoke
import { open, waitForGlobe, webgl } from './lib.mjs';

const PROBES = [
  'Workers/createVerticesFromQuantizedTerrainMesh.js',
  'Assets/approximateTerrainHeights.json',
  'Assets/Textures/NaturalEarthII/tilemapresource.xml',
  'Widgets/widgets.css',
  'ThirdParty/draco_decoder.wasm',
];

const { browser, page, log } = await open();
try {
  await waitForGlobe(page);
  const gl = await webgl(page);
  const base = await page.evaluate(() => window.CESIUM_BASE_URL);
  // fetch each file Cesium needs; a dev server answers a missing file with index.html (200), so check the type too
  const probes = await page.evaluate(
    ([b, files]) =>
      Promise.all(files.map(async (f) => {
        const r = await fetch(b + f);
        return { f, status: r.status, type: r.headers.get('content-type') ?? '' };
      })),
    [base, PROBES],
  );
  const probeBad = probes.filter((p) => p.status !== 200 || /html/.test(p.type));
  const cesiumBad = log.bad.filter((b) => b.includes('/cesium/'));
  const canvas = await page.locator('#globe canvas').count();

  console.log(`webgl: ${gl.kind} (${gl.renderer})`);
  console.log(`globe canvas: ${canvas}; cesium base: ${base}`);
  console.log(`cesium static probes ok: ${probes.length - probeBad.length}/${probes.length}`);
  console.log(`bad responses under /cesium/: ${cesiumBad.length}`);
  console.log(`console errors: ${log.errors.length}`);
  for (const line of [...log.errors, ...log.bad, ...probeBad.map((p) => `probe ${p.f}: ${p.status} ${p.type}`)]) console.log(`  ${line}`);
  if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
  process.exitCode = gl.kind !== 'none' && canvas === 1 && !probeBad.length && !cesiumBad.length && !log.errors.length ? 0 : 1;
} finally {
  await browser.close();
}
