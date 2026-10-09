// P2A.7.5 the globe's frame rate while the drone flies: 60 s of the recorded SITL flight at Pushkar (fixtures/hill-flight.json,
// fed at its recorded 5 states a second, the smoother drawing in between) with the chase camera, at default quality
// (Cesium World Terrain, Bing imagery, OSM 3D buildings on), in the installed Edge on this laptop's GPU. Frames counted
// each second; the median must be 30 or more. Written to docs/data-quality.md.
import { readFileSync } from 'node:fs';
import { checker, open, settledAt, webgl, writeSection } from './lib.mjs';

const { check, done } = checker();
const fx = JSON.parse(readFileSync(new URL('./fixtures/hill-flight.json', import.meta.url), 'utf8'));
// the moving part: from the first state above 2 m/s (before that the drone sits or climbs, and a render-on-demand globe
// rightly draws only when something changes: measured 0-5 fps there), 62 s worth, ending before the crash point
const start = fx.states.findIndex((s) => s.groundSpeed > 2);
const flight = fx.states.slice(Math.max(0, start - 10), start + 310);
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
try {
  const gl = await webgl(page);
  await settledAt(page, 40_000);
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 800), fx.home);
  await page.waitForTimeout(4000);
  await page.evaluate((h) => window.__dw.setHome(h), fx.home[2]);
  await page.evaluate(() => {
    window.__fps = [];
    let n = 0;
    window.__dw.viewer.scene.postRender.addEventListener(() => n++);
    window.__tick = setInterval(() => (window.__fps.push(n), (n = 0)), 1000);
  });
  // states fed by the page itself at the recorded pace (200 ms), so the test's own round trips do not pace the flight
  await page.evaluate((states) => {
    let i = 0;
    window.__feed = setInterval(() => {
      if (i >= states.length) return clearInterval(window.__feed);
      window.__dw.feedState(states[i++]);
      if (window.__dw.views.view === 'free' && window.__dw.drone.drawn()) window.__dw.views.set('chase');
    }, 200);
  }, flight);
  await page.waitForTimeout(62_000);
  const fps = await page.evaluate(() => (clearInterval(window.__tick), clearInterval(window.__feed), window.__fps.slice(1, 61)));
  const sorted = [...fps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  const crashed = await page.evaluate(() => window.__dw.crash() !== null);
  console.log(`info  ${gl.kind}: ${gl.renderer}; fps per second: ${fps.join(' ')}`);
  check('P2A.7.5 the globe holds 30 fps or better while the drone flies (median over 60 s)', gl.kind === 'GPU' && fps.length >= 55 && median >= 30 && !crashed, `median ${median} fps, lowest ${sorted[0]}, ${fps.length} s, ${gl.kind}; JS heap ${heap} MB`);
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
  writeSection('drone-fps', `## Frame rate while the drone flies (P2A.7.5, \`npm run e2e:flyfps\`, ${new Date().toISOString().slice(0, 10)})
60 s of the recorded SITL flight at Pushkar while it moves (level, about 9 m/s, chase camera) at default quality: terrain, Bing imagery and 3D buildings on, 1280 x 800, ${gl.renderer} (${gl.kind}).
- Frames per second: median **${median}**, lowest ${sorted[0]}, highest ${sorted.at(-1)}. JS heap afterwards ${heap} MB.
- Per second: ${fps.join(' ')}`);
} finally {
  await browser.close();
}
done();
