// P1.7.1, automated half: from a cold page load, search Jaisalmer (live Nominatim), fly to the first result, then zoom with
// the mouse wheel until the camera is below 200 m above the ground. The whole path, measured from navigation start, must take
// under 60 s. The hands-on half (you, a stopwatch) repeats the same path by hand.
import { cameraRest, checker, clickAt, open, settledAt, writeSection } from './lib.mjs';

const { check, done } = checker();
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 720 } });
try {
  const agl = () => page.evaluate(() => { const v = window.__dw.viewer; const c = v.camera.positionCartographic; return c.height - (v.scene.globe.getHeight(c) ?? 0); });
  await settledAt(page, 40_000);
  const tSearch = Date.now();
  await page.locator('#search').pressSequentially('Jaisalmer', { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('#search-results li');
  // the first hit for "Jaisalmer" is the district (283 x 225 km); the person picks the one labelled city
  await page.locator('#search-results li button', { hasText: '· city' }).first().click();
  await cameraRest(page, 20_000);
  const flown = Date.now() - tSearch;
  // zoom in with the wheel (one notch = 120 units, pointing at the middle of the screen) until below 200 m above the ground
  const box = await page.locator('#globe canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let height = await agl();
  let wheels = 0;
  let reachedAt = null; // ms since navigation start when the camera first went below 200 m
  while (height >= 200 && wheels < 60) {
    await page.mouse.wheel(0, -120);
    wheels++;
    await page.waitForTimeout(150);
    height = await agl();
    if (height < 200) reachedAt = await page.evaluate(() => Math.round(performance.now()));
  }
  await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 30_000 }); // the picture must have loaded too
  const total = await page.evaluate(() => Math.round(performance.now()));
  const s = (ms) => (ms / 1000).toFixed(1);
  check('P1.7.1 below 200 m above ground, with the street-level tiles loaded, from a cold load in under 60 s', reachedAt !== null && total < 60_000, `camera below 200 m after ${s(reachedAt ?? 0)} s, tiles loaded after ${s(total)} s (search + flight ${s(flown)} s, ${wheels} wheel notches)`);
  await clickAt(page);
  await page.waitForFunction(() => /Ground elevation: [\d,]+ m MSL/.test(document.querySelector('#sel-elev').textContent), null, { timeout: 15_000 });
  console.log(`info  at street level the click panel reads: ${(await page.locator('#sel-coords').innerText())} | ${(await page.locator('#sel-elev').innerText())}`);
  if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.join(' | '));
  writeSection(
    'street',
    `## Reaching street level, automated half (P1.7.1, e2e/street.mjs)

Cold page load, search "Jaisalmer", Enter, choose the result labelled city, zoom with the mouse wheel (${wheels} notches) to below 200 m above the ground: the camera was below 200 m after **${s(reachedAt ?? 0)} s** and the street-level tiles had finished loading after **${s(total)} s** (target: under 60 s). Last run ${new Date().toISOString().slice(0, 10)}.`,
  );
} finally {
  await browser.close();
}
done();
