// P1.8.8 evaluation only: does Google Photorealistic 3D Tiles (Cesium ion asset 2275207) reach this token, and how much 3D
// detail does it have at the screenshot spot and the seven test places? Google's terms forbid showing these tiles with or
// near a non-Google map, and Cesium says they may only be used with the Google geocoder, so this never runs inside the
// app: it opens a throwaway Google-only page (no globe, no Bing imagery, no OSM, no Cesium terrain, no place search,
// Google's credits on screen) served through the test browser. Nothing is saved but numbers: the terms also forbid
// storing Google content, so no screenshots. One page load = one of the 1,000 root tiles a month on ion's free plan.
import { readFileSync } from 'node:fs';
import { checker, open, writeSection } from './lib.mjs';

const { check, done } = checker();
const token = /^VITE_CESIUM_ION_TOKEN=(.*)$/m.exec(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))?.[1]?.trim();
if (!token) throw new Error('no Cesium ion token in web/.env.local');
const CESIUM_JS = new URL('../node_modules/cesium/Build/Cesium/Cesium.js', import.meta.url);
// ground heights only to start the camera roughly 3 km up; the real height comes from the tiles
const PLACES = [
  ['Screenshot spot (Bhawanipatna)', 19.906844, 83.16979, 250],
  ['Jaipur', 26.9124, 75.7873, 430],
  ['Jaisalmer', 26.9157, 70.9083, 230],
  ['Mount Abu', 24.5926, 72.7156, 1200],
  ['Pushkar', 26.4897, 74.5511, 510],
  ['Thar Desert', 27.0, 70.3, 150],
  ['Spiti Valley', 32.2276, 78.0719, 3800],
  ['Tokyo', 35.6762, 139.6503, 40],
];
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/cesium/Widgets/widgets.css">
<style>html,body,#v{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style></head><body><div id="v"></div>
<script>window.CESIUM_BASE_URL = '/cesium/';</script><script src="/cesium/Cesium.js"></script>
<script>
(async () => {
  Cesium.Ion.defaultAccessToken = window.__ionToken;
  const viewer = new Cesium.Viewer('v', { globe: false, baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false, msaaSamples: 1 });
  // no geocoder of any kind on this page, so the "only with the Google geocoder" condition holds
  const tileset = await Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true },
    { showCreditsOnScreen: true, cacheBytes: 256 * 1024 * 1024, maximumCacheOverflowBytes: 128 * 1024 * 1024 });
  viewer.scene.primitives.add(tileset);
  window.__eval = { viewer, tileset };
})().catch((e) => { window.__evalError = String(e); });
</script></body></html>`;

const { browser, page, log } = await open('google3d-eval.html', {
  viewport: { width: 960, height: 600 },
  setup: async (context) => {
    await context.addInitScript((t) => (window.__ionToken = t), token);
    await context.route(/\/google3d-eval\.html$/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
    await context.route(/\/cesium\/Cesium\.js$/, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', path: CESIUM_JS.pathname.slice(1) }));
  },
});
const rows = [];
try {
  await page.waitForFunction(() => window.__eval || window.__evalError, null, { timeout: 60_000 });
  const err = await page.evaluate(() => window.__evalError);
  check('P1.8.8 Google Photorealistic 3D Tiles load through Cesium ion with this token', !err, err ?? 'tileset loaded (ion asset 2275207)');
  if (!err) {
    for (const [name, lat, lon, approx] of PLACES) {
      const r = await page.evaluate(
        async ([la, lo, h0]) => {
          const { viewer, tileset } = window.__eval;
          // "loaded" = tilesLoaded has stayed true for 3 s (nested tilesets arrive in waves), or 90 s passed
          const loaded = () => new Promise((res) => { const t0 = performance.now(); let since = 0; const tick = () => { const now = performance.now(); since = tileset.tilesLoaded ? since || now : 0; if ((since && now - since > 3000) || now - t0 > 90_000) res(Boolean(since)); else setTimeout(tick, 250); }; tick(); });
          tileset.maximumScreenSpaceError = 16;
          viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lo, la, h0 + 3000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } });
          await loaded();
          const [c] = await viewer.scene.sampleHeightMostDetailed([Cesium.Cartographic.fromDegrees(lo, la)]);
          const ground = c?.height;
          if (ground === undefined) return { ground: null };
          // Real 3D buildings show up as steps in the surface. Sample the most detailed surface on a 15 x 15 grid, 8 m apart
          // (a 112 m square), and count second differences over 3 m along rows and columns: walls and roofs make them, smooth
          // ground does not, and a steady hillside cancels out (only changes of slope count).
          const N = 15;
          const STEP = 8;
          const pts = [];
          for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) pts.push(Cesium.Cartographic.fromDegrees(lo + ((j - 7) * STEP) / (111_320 * Math.cos((la * Math.PI) / 180)), la + ((i - 7) * STEP) / 110_574));
          const h = (await viewer.scene.sampleHeightMostDetailed(pts)).map((p) => p?.height);
          let steps = 0;
          let pairs = 0;
          const second = (a, b, c) => { if ([a, b, c].every(Number.isFinite)) { pairs++; if (Math.abs(a - 2 * b + c) > 3) steps++; } };
          for (let i = 0; i < N; i++) for (let j = 1; j < N - 1; j++) second(h[i * N + j - 1], h[i * N + j], h[i * N + j + 1]);
          for (let j = 0; j < N; j++) for (let i = 1; i < N - 1; i++) second(h[(i - 1) * N + j], h[i * N + j], h[(i + 1) * N + j]);
          const ok = h.filter(Number.isFinite);
          // the credits Google shows for this view (camera 300 m away, tilted)
          viewer.camera.lookAt(Cesium.Cartesian3.fromDegrees(lo, la, ground), new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 300));
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          const done = await loaded();
          const credits = Array.from(document.querySelectorAll('.cesium-credit-textContainer *, .cesium-credit-logoContainer img'))
            .map((e) => (e.textContent || e.title || '').trim()).filter(Boolean);
          return { ground, done, stepShare: pairs ? steps / pairs : null, pairs, range: ok.length ? Math.max(...ok) - Math.min(...ok) : null, credits: [...new Set(credits)].join(', ') };
        },
        [lat, lon, approx],
      );
      rows.push({ name, ...r });
      console.log(`info  ${name}: ${JSON.stringify(r)}`);
    }
    const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
    rows.heap = heap;
    check('P1.8.8 every place was measured (tiles loaded, ground found)', rows.every((r) => r.ground !== null && r.done), rows.map((r) => `${r.name}: ${r.done ? 'loaded' : 'timeout'}`).join('; '));
  }
  check('evaluation page: 0 console errors', log.errors.length === 0, log.errors.join(' | '));
} finally {
  await browser.close();
}

if (rows.length) {
  const tokyo = rows.find((r) => r.name === 'Tokyo');
  writeSection(
    'google3d',
    `## Google Photorealistic 3D Tiles: evaluation only (P1.8.8, e2e/google3d.mjs)

Last run ${new Date().toISOString().slice(0, 10)}. Available to this Cesium ion token (asset 2275207). Measured on a throwaway Google-only page outside the app (no globe, no other imagery, no place search, Google credits on screen), because Google's terms forbid showing the tiles with or near a non-Google map; no pictures were kept.

Real 3D buildings show up as steps in the surface, so the most detailed Google surface is sampled on a 15 x 15 grid, 8 m apart (a 112 m square at each place), and the share of points where the slope changes by more than 3 m (second difference) is counted: walls and roofs make such steps, flat ground and steady hillsides do not. Tokyo (a residential district, inside Google's photogrammetry) is the reference. A first try that compared the finest tile size gave 2.0 m everywhere, Tokyo included, so tile size cannot tell the two apart.

| Place | Surface steps over 3 m (share of ${rows[0]?.pairs ?? '--'} samples) | Height range in the square | Credits shown |
|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.stepShare === null || r.stepShare === undefined ? '--' : `${(100 * r.stepShare).toFixed(1)}%`} | ${r.range === null || r.range === undefined ? '--' : `${r.range.toFixed(1)} m`} | ${r.credits || '--'} |`).join('\n')}

JS heap after the tour: ${rows.heap ?? '--'} MB (tile cache capped at 256 MB). Reference: Tokyo ${tokyo?.stepShare == null ? '--' : `${(100 * tokyo.stepShare).toFixed(1)}%`} of samples on a step.`,
  );
}
done();
