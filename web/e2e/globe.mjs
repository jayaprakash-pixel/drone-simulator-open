// P1.2 acceptance: token-missing message, terrain + imagery with the real token, fly-to. Needs the token in web/.env.local
// (baked into the build). Keeps ion traffic small on purpose: two page loads, a small viewport, no repeated runs in a loop.
import { checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const small = { width: 960, height: 600 };

// ---- P1.2.1 (no token): offline map plus a clear message, no errors
{
  const { browser, page, log } = await open('?e2e=1&notoken=1', { viewport: small });
  try {
    await settledAt(page);
    const msg = page.locator('#token-missing');
    check('P1.2.1 no token: #token-missing is visible', await msg.isVisible());
    check('P1.2.1 no token: message names the Cesium ion token', /Cesium ion token/.test(await msg.innerText()));
    const visible = await page.evaluate(() => { const v = window.__dw.viewer; return Array.from({ length: v.imageryLayers.length }, (_, i) => v.imageryLayers.get(i).show).filter(Boolean).length; });
    check('P1.2.1 no token: exactly one imagery layer is visible (the offline map), globe canvas exists', visible === 1 && (await page.locator('#globe canvas').count()) === 1, `${visible} visible`);
    check('P1.2.1 no token: 0 console errors', log.errors.length === 0, log.errors.join(' | '));
  } finally {
    await browser.close();
  }
}

// ---- P1.2.1 (token) + P1.2.2 + P1.2.3, one page load
{
  const { browser, page, log } = await open('?e2e=1', { viewport: small });
  try {
    const ms = await settledAt(page, 40_000);
    const info = await page.evaluate(() => {
      const v = window.__dw.viewer;
      return {
        flat: window.__dw.flat(),
        layers: v.imageryLayers.length,
        tilesLoaded: v.scene.globe.tilesLoaded,
        height: v.camera.positionCartographic.height,
        toolbarButtons: document.querySelectorAll('#globe .cesium-button').length,
        tokenNotice: !!document.querySelector('#token-missing'),
        canvas: (() => { const c = document.querySelector('#globe canvas'); return c ? [c.clientWidth, c.clientHeight] : [0, 0]; })(),
      };
    });
    check('P1.2.1 token: no token notice, Cesium canvas created and visible', !info.tokenNotice && info.canvas[0] > 0 && info.canvas[1] > 0, `canvas ${info.canvas.join('x')}`);
    check('P1.2.2 terrain provider is not the flat ellipsoid', !info.flat);
    check('P1.2.2 at least 1 imagery layer', info.layers >= 1, `${info.layers}`);
    // settledAt resolves only once globe.tilesLoaded is true (with imagery and terrain ready); a second read afterwards
    // can catch the next tile request in flight, so the measured time is the evidence
    check('P1.2.2 globe.tilesLoaded within 20 s', ms < 20_000, `${ms} ms after navigation start (tilesLoaded at the time read again: ${info.tilesLoaded})`);
    check('P1.2.2 start view above 10,000 km', info.height > 10_000_000, `${Math.round(info.height / 1000)} km`);
    check('P1.2.2 default toolbar hidden (no Cesium buttons)', info.toolbarButtons === 0);

    // laptop budget: after loading, the globe must go idle (no frame for 1.5 s within 20 s) and then stay idle
    const quietAfter = await page.evaluate(
      () => new Promise((resolve) => {
        const start = performance.now();
        let last = start;
        const off = window.__dw.viewer.scene.postRender.addEventListener(() => { last = performance.now(); });
        const t = setInterval(() => {
          const now = performance.now();
          if (now - last > 1500) { clearInterval(t); off(); resolve(Math.round(now - start)); }
          else if (now - start > 20_000) { clearInterval(t); off(); resolve(-1); }
        }, 100);
      }),
    );
    check('laptop budget: globe goes idle after loading (no frame for 1.5 s, within 20 s)', quietAfter >= 0, quietAfter >= 0 ? `quiet after ${quietAfter} ms` : 'kept drawing for 20 s');
    const idleFrames = await page.evaluate(
      () => new Promise((res) => { let n = 0; const off = window.__dw.viewer.scene.postRender.addEventListener(() => n++); setTimeout(() => { off(); res(n); }, 2000); }),
    );
    check('laptop budget: idle globe draws <= 3 frames in 2 s (render on demand)', idleFrames <= 3, `${idleFrames} frames`);
    const heapMb = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
    console.log(`info  JS heap in use after load: ${heapMb} MB`);

    // P1.2.3 the fly-to function (its 'Fly to Rajasthan' demo button was removed on 2026-10-08 at the owner's request;
    // search results and saved places use the same function)
    const t0 = Date.now();
    await page.evaluate(() => void window.__dw.globe.flyToPlace(26.9124, 75.7873, 30_000));
    // wait for the camera to come to rest: it must have moved, then sit still between two polls 300 ms apart
    let prev = null, moved = false, atRest = false;
    while (Date.now() - t0 < 10_000 && !atRest) {
      const cur = await page.evaluate(() => { const c = window.__dw.viewer.camera.positionWC; return [c.x, c.y, c.z]; });
      if (prev) {
        const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
        if (d > 100) moved = true;
        else if (moved && d < 1) atRest = true;
      }
      prev = cur;
      if (!atRest) await page.waitForTimeout(300);
    }
    const last = await page.evaluate(() => { const c = window.__dw.viewer.camera.positionCartographic; return { lat: c.latitude * 180 / Math.PI, lon: c.longitude * 180 / Math.PI, h: c.height }; });
    const inBox = atRest && last.lat > 23 && last.lat < 30.5 && last.lon > 69 && last.lon < 78.5 && last.h < 50_000;
    check('P1.2.3 a fly-to over Rajasthan comes to rest in lat 23-30.5, lon 69-78.5, height < 50 km within 10 s', inBox, `${Date.now() - t0} ms; lat ${last.lat.toFixed(3)} lon ${last.lon.toFixed(3)} h ${Math.round(last.h)} m`);
    await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 30_000 });
    if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
    check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
  } finally {
    await browser.close();
  }
}
done();
