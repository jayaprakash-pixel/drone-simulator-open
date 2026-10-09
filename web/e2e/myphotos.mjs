// P1.9.4 "My photos": your own 360 photos from a local folder (never uploaded). Builds a test folder in the system temp
// directory: a real 2:1 JPEG with EXIF GPS 30 m north of Pushkar's centre, one with a JSON sidecar 80 m north, one with no
// position, one that is not a JPEG and one too large to draw. Picks it through the real folder chooser, checks the list,
// opens the nearest in Pannellum inside the full-screen view, and checks the marker, Esc and the JS heap.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jpegHeader, withExif } from './jpeg-fixtures.mjs';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const PUSHKAR = [26.4897, 74.5511];
const north = (m) => PUSHKAR[0] + m / 110_850; // metres north at Pushkar's latitude (WGS84 meridian)
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const dir = join(tmpdir(), `dw-myphotos-${process.pid}`);

const { browser, context, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
try {
  // a real 2048x1024 JPEG: a sky-to-ground gradient with a grid, rendered by the browser itself
  const art = await context.newPage();
  await art.setViewportSize({ width: 2048, height: 1024 });
  await art.setContent('<body style="margin:0;height:1024px;background:repeating-linear-gradient(90deg,#0003 0 2px,#0000 2px 128px),linear-gradient(#4a7fc0,#bcd4ec 50%,#7a6a4a 50%,#4b3d28)"></body>');
  const jpeg = new Uint8Array(await art.screenshot({ type: 'jpeg', quality: 80 }));
  await art.close();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'a-exif.jpg'), withExif(jpeg, { lat: north(30), lon: PUSHKAR[1], heading: 90, taken: '2024:03:14 09:30:00' }));
  writeFileSync(join(dir, 'b-sidecar.jpg'), jpeg);
  writeFileSync(join(dir, 'b-sidecar.json'), JSON.stringify({ lat: north(80), lon: PUSHKAR[1], heading: 0 }));
  writeFileSync(join(dir, 'c-no-gps.jpg'), jpeg);
  writeFileSync(join(dir, 'd-broken.jpg'), 'this is not a JPEG');
  writeFileSync(join(dir, 'e-huge.jpg'), jpegHeader(65000, 32500));

  await settledAt(page, 40_000);
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), PUSHKAR);
  await cameraRest(page, 25_000);
  await clickAt(page);
  await page.waitForSelector('#side:not(.hidden)');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#my-photos');
  await (await chooser).setFiles(dir);
  await page.waitForSelector('#myphotos');
  const items = await page.locator('#myphotos li').allInnerTexts();
  check('P1.9.4 the usable photos are listed nearest first (EXIF 30 m, sidecar 80 m)', /^a-exif\.jpg · 3\d m$/.test(items[0]) && /^b-sidecar\.jpg · 8\d m$/.test(items[1]), items.slice(0, 2).join(' | '));
  for (const [cls, name] of [['no-gps', 'c-no-gps.jpg'], ['unreadable', 'd-broken.jpg'], ['too-large', 'e-huge.jpg']]) {
    const t = await page.locator(`.myphotos-problem-${cls}`).innerText().catch(() => '');
    check(`P1.9.4 ${name} gets its own message (${cls})`, t.startsWith(name), t);
  }
  await page.click('#myphoto-open-0');
  await page.waitForSelector('#pano-view:not(.hidden)');
  const drawn = await page.waitForFunction(() => /captured/.test(document.querySelector('#pano-info').textContent) && document.querySelector('#pano-canvas canvas'), null, { timeout: 30_000 }).then(() => true, () => false);
  const info = await page.locator('#pano-info').innerText();
  const m = await page.evaluate(() => window.__dw.panoMarker());
  check('P1.9.4 the nearest opens in Pannellum in the full-screen view: provider, 360 label, capture date, distance', drawn && /My photos \(local\)/.test(info) && /360° panorama/.test(info) && /captured 14 Mar 2024/.test(info), info);
  check('P1.9.4 the globe marker sits on the photo position (< 1 m) and points along its view (90 deg)', !!m && metres([m.lat, m.lon], [north(30), PUSHKAR[1]]) < 1 && Math.abs(m.bearing - 90) < 1, m ? `${metres([m.lat, m.lon], [north(30), PUSHKAR[1]]).toFixed(2)} m, bearing ${m.bearing.toFixed(1)}` : 'no marker');
  await page.screenshot({ path: new URL('../../docs/shots/myphotos-open.png', import.meta.url).pathname.slice(1) });
  await page.keyboard.press('Escape');
  check('P1.9.4 Esc closes it', await page.locator('#pano-view').isHidden());
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  check('P1.9.4 JS heap stays under 300 MB', heap < 300, `${heap} MB`);
  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
done();
