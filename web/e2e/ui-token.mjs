// P1.4 / P1.5 checks that need real terrain and imagery (the Cesium ion token baked into the local build): cursor readout
// with MSL elevation, ground elevation in the click panel, terrain toggle, provider credits mirrored into the bottom bar.
// One page load plus two close-range flights, to keep Cesium ion traffic small.
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const CURSOR = /^Cursor (-?\d+\.\d{6}), (-?\d+\.\d{6}) · ground ([\d,]+) m MSL$/;

const { browser, context, page, log } = await open('?e2e=1', { viewport: { width: 960, height: 600 } });
try {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await settledAt(page, 40_000);
  const text = (sel) => page.locator(sel).innerText();
  const box = await page.locator('#globe canvas').boundingBox();
  const bar = async () => {
    await page.waitForFunction(() => document.querySelector('#credits-inline').textContent.length > 0, null, { timeout: 8000 }); // credits arrive with the first tiles
    return barNow();
  };
  const barNow = () =>
    page.evaluate(() => {
      const r = document.querySelector('#credits').getBoundingClientRect();
      const reported = Array.from(document.querySelectorAll('.cesium-credit-lightbox li')).map((li) => (li.textContent || li.querySelector('img')?.title || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
      return {
        onScreen: r.height > 0 && r.bottom <= innerHeight + 1 && r.bottom >= innerHeight - 1,
        inline: document.querySelector('#credits-inline').textContent,
        reported: `Data: ${reported.join(' · ')}`, // what Cesium itself lists behind its Data attribution link
        link: document.querySelector('.cesium-credit-expand-link')?.textContent ?? '',
      };
    });

  const b0 = await bar();
  await page.evaluate(() => void window.__dw.globe.flyToPlace(26.9124, 75.7873, 30_000));
  await cameraRest(page, 15_000);
  await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 30_000 });
  const b1 = await bar();

  // ---- P1.4.1 cursor readout: lat/lon to 6 decimals and elevation labelled MSL, within 200 ms of the mouse stopping
  const t0 = Date.now();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#cursor-readout').textContent), CURSOR.source, { timeout: 2000 });
  const ms = Date.now() - t0;
  const m = (await text('#cursor-readout')).match(CURSOR);
  check('P1.4.1 cursor readout shows lat/lon (6 decimals) and ground elevation in m MSL within 200 ms', !!m && ms < 200, `${ms} ms: ${await text('#cursor-readout')}`);
  check('P1.4.1 the elevation is plausible for Jaipur (plan: about 430 m MSL)', !!m && Number(m[3].replace(',', '')) > 380 && Number(m[3].replace(',', '')) < 480, m ? `${m[3]} m` : '');

  // ---- P1.4.2 the click panel shows ground elevation in m MSL (most detailed terrain, not the coarse tile on screen)
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,]+ m MSL/.test(document.querySelector('#sel-elev').textContent), null, { timeout: 15_000 });
  const elev = (await text('#sel-elev')).match(/([\d,]+) m MSL/)[1];
  check('P1.4.2 the click panel shows ground elevation labelled m MSL (plan: Jaipur about 430 m)', Number(elev.replace(',', '')) > 400 && Number(elev.replace(',', '')) < 460, `${elev} m MSL at ${await text('#sel-coords')}`);

  // ---- P1.5.1 terrain toggle: off falls back to the ellipsoid, on switches back
  check('P1.5.1 terrain is on by default with a token', (await page.locator('#terrain-toggle').isChecked()) && !(await page.evaluate(() => window.__dw.flat())));
  await page.uncheck('#terrain-toggle');
  check('P1.5.1 terrain off falls back to the flat ellipsoid', await page.evaluate(() => window.__dw.flat()));
  await page.check('#terrain-toggle');
  check('P1.5.1 terrain on again restores real terrain', !(await page.evaluate(() => window.__dw.flat())));

  // ---- P1.4.1 over space the readout shows --
  await page.evaluate(() => window.__dw.toSpace());
  await page.mouse.move(box.x + 3, box.y + 3);
  await page.waitForTimeout(400);
  check('P1.4.1 over space the cursor readout shows --', (await text('#cursor-readout')) === 'Cursor: --', await text('#cursor-readout'));

  // ---- P1.5.5 provider credits: always on screen, at start, after a fly-to and at street level
  await page.evaluate(() => window.__dw.globe.flyToPlace(26.9124, 75.7873, 150));
  await cameraRest(page, 15_000);
  await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 30_000 });
  const b2 = await bar();
  const bars = [b0, b1, b2];
  check('P1.5.5 bottom bar is on screen at start, after a fly-to and at street level', bars.every((b) => b.onScreen), bars.map((b) => b.onScreen).join(','));
  check('P1.5.5 the bar lists exactly the credits Cesium reports, at all three stages', bars.every((b) => b.inline.length > 6 && b.inline === b.reported), bars.map((b) => b.inline.length).join(','));
  check('P1.5.5 once in range (after the fly-to and at street level) imagery and terrain providers are both listed', [b1, b2].every((b) => /Microsoft/.test(b.inline) && /Copernicus|CGIAR|Geological Survey/.test(b.inline)));
  ['start', 'after fly-to', 'street level'].forEach((s, i) => console.log(`info  credits at ${s}: ${bars[i].inline.slice(0, 230)}`));
  check('P1.5.5 the Data attribution link stays available', bars.every((b) => /Data attribution/.test(b.link)));
  const cam = await page.evaluate(() => { const v = window.__dw.viewer; const c = v.camera.positionCartographic; return c.height - (v.scene.globe.getHeight(c) ?? 0); });
  check('street level reached: camera about 150 m above the ground', cam < 200, `${Math.round(cam)} m`);
  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
} finally {
  await browser.close();
}
done();
