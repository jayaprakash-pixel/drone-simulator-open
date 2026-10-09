// P1.6.4 frame rate at default quality on a scripted tour of the seven test places (driven through the real Places list) and
// P1.6.5 time to a visible globe (median of 5 cold loads). Runs on the laptop's real GPU path (Edge, ANGLE/D3D11).
// Since P1.8 the defaults include 3D buildings and tilted fly-tos, so the same run also answers P1.8.4.
// Uses the real token, so it costs some Cesium ion traffic: about 5 small page loads and 7 flights.
import { cameraRest, checker, open, settledAt, webgl, writeSection } from './lib.mjs';

const { check, done } = checker();
const viewport = { width: 1280, height: 720 };
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))];

// ---- P1.6.5: five cold loads, each in a fresh browser (empty HTTP cache), navigation start to settled globe
const loads = [];
for (let i = 0; i < 5; i++) {
  const { browser, page } = await open('?e2e=1', { viewport });
  try {
    loads.push(await settledAt(page, 40_000));
  } finally {
    await browser.close();
  }
}
const loadMedian = median(loads);
check('P1.6.5 median time from navigation start to a visible, loaded globe is 5 s or less', loadMedian <= 5000, `loads ${loads.join(', ')} ms; median ${loadMedian} ms`);

// ---- P1.6.4: the tour
const { browser, page, log } = await open('?e2e=1', { viewport });
try {
  await settledAt(page, 40_000);
  const gl = await webgl(page);
  check('P1.6.4 the browser runs WebGL on the GPU, not in software', gl.kind === 'GPU', gl.renderer);
  await page.evaluate(() => {
    window.__frames = [];
    window.__dw.viewer.scene.postRender.addEventListener(() => window.__frames.push(performance.now()));
  });
  await page.click('#places-toggle');
  const names = await page.locator('#places-list li button').allInnerTexts();
  const t0 = Date.now();
  for (let i = 0; i < 7; i++) {
    await page.locator('#places-list li button').nth(i).click();
    const rest = await cameraRest(page, 25_000);
    await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 40_000 });
    console.log(`info  tour ${i + 1}/7 ${names[i]}: camera at rest after ${rest} ms`);
  }
  const tourMs = Date.now() - t0;
  const heapMb = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  const buildingsOn = await page.evaluate(() => window.__dw.globe.buildings()?.show === true);
  check('P1.8.4 the tour ran with 3D buildings on (the default)', buildingsOn);
  const frames = await page.evaluate(() => window.__frames);
  const deltas = frames.slice(1).map((t, i) => t - frames[i]).filter((d) => d < 500); // gaps over 0.5 s are idle time (render on demand), not slow frames
  const fpsMedian = 1000 / median(deltas);
  const fpsWorst5 = 1000 / pct(deltas, 95);
  const over30 = (100 * deltas.filter((d) => d <= 1000 / 30).length) / deltas.length;
  check('P1.6.4 median frame rate over the tour is 30 fps or better at default quality', fpsMedian >= 30, `${fpsMedian.toFixed(0)} fps median, ${fpsWorst5.toFixed(0)} fps slowest 5%, ${over30.toFixed(0)}% of frames at 30 fps or better, ${deltas.length} frames in ${(tourMs / 1000).toFixed(0)} s`);
  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));

  writeSection(
    'performance',
    `## Performance (P1.6.4 and P1.6.5, e2e/perf.mjs)

Last run ${new Date().toISOString().slice(0, 10)}, default settings (resolution 100%, tile detail 3, 3D buildings ${buildingsOn ? 'on' : 'off'}; every place viewed tilted from 1 km, as a fly-to now ends), ${viewport.width}x${viewport.height} window, real GPU: ${gl.renderer}.

| Measure | Target (plan p.21) | Result |
|---|---|---|
| Frame rate during a scripted tour of the 7 test places (${deltas.length} frames, ${(tourMs / 1000).toFixed(0)} s) | 30 fps or better | median ${fpsMedian.toFixed(0)} fps; slowest 5% of frames ${fpsWorst5.toFixed(0)} fps; ${over30.toFixed(0)}% of frames at 30 fps or better |
| Time to a visible, loaded globe (5 cold loads) | within about 5 s | ${loads.join(', ')} ms; median ${loadMedian} ms |
| Browser JS heap after the tour | watch it: about 1 GB of RAM is free | ${heapMb} MB |

The globe draws only when something changes, so idle time is excluded from the frame rate (an idle globe draws 0 frames a second). The headless window is not vsync-capped, so the number can exceed the display's refresh rate; what matters here is the margin over 30 fps while the camera flies and tiles stream in.`,
  );
} finally {
  await browser.close();
}
done();
