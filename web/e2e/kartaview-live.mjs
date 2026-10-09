// P1.12.5 KartaView live, at a place where only KartaView had photos in the survey sample (data/kartaview-probe.json):
// Enter place (360) reports the nearest flat photo, Go to nearest opens it with the KartaView credit, nothing downloaded.
import { readFileSync } from 'node:fs';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const survey = JSON.parse(readFileSync(new URL('../../data/coverage-survey.json', import.meta.url), 'utf8')).places;
const probe = JSON.parse(readFileSync(new URL('../../data/kartaview-probe.json', import.meta.url), 'utf8'));
const [id] = Object.entries(probe).find(([, v]) => v.photos > 0);
const { name, lat, lon } = survey[id];
const { browser, page, log } = await open('?e2e=1&pano=kartaview', { viewport: { width: 1280, height: 800 } });
let downloads = 0;
page.on('download', () => downloads++);
try {
  await settledAt(page, 40_000);
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 300), [lat, lon]);
  await cameraRest(page, 25_000);
  await clickAt(page);
  await page.waitForSelector('#side:not(.hidden)', { timeout: 5000 });
  await page.click('#enter-place');
  const none = await page.waitForSelector('#pano-none', { timeout: 30_000 }).then((e) => e.innerText(), () => null);
  check(`P1.12.5 KartaView live at ${name}: Enter place reports the nearest flat photo`, /flat photo/.test(none ?? ''), none ?? 'no message');
  await page.click('#pano-go-nearest');
  await page.waitForFunction(() => window.__dw.pano.isOpen(), null, { timeout: 20_000 });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => ({ attrib: document.getElementById('pano-attrib')?.textContent ?? '', visible: document.getElementById('pano-attrib')?.checkVisibility() ?? false, img: document.querySelector('#pano-view img.flat-photo, img.flat-photo')?.naturalWidth ?? 0 }));
  check('P1.12.5 ... Go to nearest opens it with the KartaView credit visible', r.visible && /Grab and KartaView Contributors, CC BY-SA 4\.0/.test(r.attrib) && r.img > 0, `${r.attrib}; image ${r.img} px wide`);
  check('P1.12.5 no image stored on disk (no download), 0 console errors', downloads === 0 && log.errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, `${downloads} downloads; ${log.errors.slice(0, 2).join(' | ')}`);
} finally {
  await browser.close();
}
done();
