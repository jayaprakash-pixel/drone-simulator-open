// P1.12.4 the 360 coverage layer, live (real Mapillary): at a place with 360 (Rennes, where Enter place opened a 360 in
// the P1.12.2 run) the toggle shows dots; at a place with none (the first "nothing within 1 km" place of that run) no dots and the plain
// message; above 3 km it asks to zoom in. JS heap after a forced garbage collection; console errors.
import { readFileSync } from 'node:fs';
import { cameraRest, checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const rp = Object.values(JSON.parse(readFileSync(new URL('../../data/random-places.json', import.meta.url), 'utf8')));
const withPano = rp.find((p) => p.result === '360 opened');
const without = rp.find((p) => p.result === 'nothing within 1 km');
const state = (page) => page.evaluate(() => ({ n: window.__dw.coverage.count(), text: document.getElementById('coverage-status').textContent, credit: document.getElementById('coverage-credit').checkVisibility() }));
const settle = (page) => page.waitForFunction(() => !/Looking for/.test(document.getElementById('coverage-status').textContent), null, { timeout: 30_000 }).catch(() => {});

const { browser, page, log } = await open('?e2e=1&pano=mapillary', { viewport: { width: 1280, height: 800 } });
try {
  await settledAt(page, 40_000);
  await page.check('#coverage-toggle');
  await page.waitForTimeout(500);
  const high = await state(page);
  check('P1.12.4 above 3 km the layer asks to zoom in and draws nothing', high.n === 0 && /Zoom in below 3 km/.test(high.text), high.text);
  const at = async (p) => {
    await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), [p.lat, p.lon]);
    await cameraRest(page, 25_000);
    await page.evaluate(() => window.__dw.coverage.update());
    await settle(page);
    return state(page);
  };
  const yes = await at(withPano);
  check(`P1.12.4 at a place with 360 (${withPano.name}) the dots show, with the Mapillary credit`, yes.n > 0 && yes.credit && /true 360 images around here/.test(yes.text), `${yes.n} dots: ${yes.text}`);
  const no = await at(without);
  check(`P1.12.4 at a place with none (${without.name}) no dots and the message`, no.n === 0 && /No 360 images found by Mapillary around here/.test(no.text), no.text);
  await (await page.context().newCDPSession(page)).send('HeapProfiler.collectGarbage');
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  check('P1.12.4 JS heap stays under 300 MB', heap < 300, `${heap} MB`);
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
done();
