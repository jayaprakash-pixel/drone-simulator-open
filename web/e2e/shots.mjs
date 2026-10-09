// Pictures for the owner's visual check (P1.8.9), saved to docs/shots/ (git-ignored: map imagery is not ours to publish):
// the tilted fly-to view at five places, Stand here at the screenshot spot and in Pushkar, the 360 view (mock provider
// until a Mapillary token exists) and the same view in each imagery source. Uses the real ion token: about 10 flights.
import { mkdirSync } from 'node:fs';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const dir = new URL('../../docs/shots/', import.meta.url);
mkdirSync(dir, { recursive: true });
const file = (name) => new URL(name, dir).pathname.slice(1);
const SPOT = [19.906844, 83.16979];
const FIVE = [
  ['oblique-bhawanipatna', SPOT],
  ['oblique-jaipur', [26.9124, 75.7873]],
  ['oblique-jaisalmer', [26.9157, 70.9083]],
  ['oblique-pushkar', [26.4897, 74.5511]],
  ['oblique-mount-abu', [24.5926, 72.7156]],
];
const saved = [];

{
  const { browser, page, log } = await open('?e2e=1&pano=mock', { viewport: { width: 1280, height: 800 } });
  try {
    await settledAt(page, 40_000);
    const settle = () => page.waitForFunction(() => window.__dw.settled(), null, { timeout: 60_000 }).catch(() => console.log('info  still loading, picture taken anyway'));
    const fly = async ([lat, lon], range = 1000) => {
      await page.evaluate(([la, lo, r]) => void window.__dw.globe.flyToPlace(la, lo, r), [lat, lon, range]);
      await cameraRest(page, 25_000);
      await settle();
      await page.waitForTimeout(500);
    };
    const shot = async (name) => {
      await page.screenshot({ path: file(`${name}.png`) });
      saved.push(`${name}.png`);
    };
    for (const [name, at] of FIVE) {
      await fly(at);
      await shot(name);
    }
    // the same view of the screenshot spot in each imagery source (one source at a time, never mixed)
    await fly(SPOT);
    await shot('imagery-bing-ion');
    await page.selectOption('#layer-select', 's2');
    await page.waitForTimeout(1500);
    await settle();
    await shot('imagery-sentinel2-eox');
    await page.selectOption('#layer-select', 'satellite');
    // Stand here at the screenshot spot, then in Pushkar (the test place with the most OpenStreetMap buildings)
    for (const [name, at] of [['stand-bhawanipatna', SPOT], ['stand-pushkar', [26.4897, 74.5511]]]) {
      await fly(at);
      await clickAt(page);
      await page.waitForSelector('#side:not(.hidden)');
      await page.click('#stand-here');
      await page.waitForFunction(() => document.body.classList.contains('standing'));
      await settle();
      await page.waitForTimeout(1000);
      await shot(`${name}-north`);
      // turn around (900 px of drag at 0.2 degrees a pixel = 180 degrees) to look the other way
      await page.mouse.move(150, 500);
      await page.mouse.down();
      for (let x = 150; x <= 1050; x += 30) await page.mouse.move(x, 500);
      await page.mouse.up();
      await settle();
      await page.waitForTimeout(1000);
      await shot(`${name}-south`);
      await page.keyboard.press('Escape');
    }
    // the 360 view, on the mock provider until a Mapillary token exists
    await clickAt(page);
    await page.click('#enter-place');
    await page.waitForSelector('#pano-view:not(.hidden)');
    await page.waitForTimeout(500);
    await shot('pano-open-mock');
    check('pictures taken, 0 console errors', log.errors.length === 0, log.errors.join(' | '));
  } finally {
    await browser.close();
  }
}
console.log(`info  saved to docs/shots: ${saved.join(', ')}`);
done();
