// P1.6.1 failure drills: wrong token, ion unreachable, connection lost while flying, throttled tiles. Each must show its own
// plain message, leave a drawn globe (never a blank screen) and cause no uncaught exception. The empty-search and search-error
// drills live in search.mjs. Small viewport and short runs keep Cesium ion traffic low.
import { cameraRest, checker, open } from './lib.mjs';

const { check, done } = checker();
const small = { width: 960, height: 600 };
const uncaught = (log) => log.errors.filter((e) => e.startsWith('pageerror'));
const visibleLayers = (page) => page.evaluate(() => { const v = window.__dw.viewer; return Array.from({ length: v.imageryLayers.length }, (_, i) => v.imageryLayers.get(i)).filter((l) => l.show && l.ready).length; });

// ---------------------------------------------------------------- drill 1: wrong token
{
  const { browser, page, log } = await open('?e2e=1', {
    viewport: small,
    setup: (context) => context.addInitScript(() => localStorage.setItem('dw.settings', JSON.stringify({ ionToken: 'not-a-real-token' }))),
  });
  try {
    await page.waitForSelector('#token-bad', { timeout: 20_000 });
    const msg = await page.locator('#token-bad').innerText();
    check('drill 1 wrong token: #token-bad names the problem and where to fix it', /rejected the token/.test(msg) && /Settings/.test(msg), msg.slice(0, 90));
    await page.waitForTimeout(1500);
    check('drill 1 wrong token: the globe is not blank (offline map visible and ready)', (await page.locator('#globe canvas').count()) === 1 && (await visibleLayers(page)) >= 1, `${await visibleLayers(page)} ready visible layer(s)`);
    check('drill 1 wrong token: 0 uncaught exceptions', uncaught(log).length === 0, uncaught(log).join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- drill 2: Cesium ion unreachable (blocked at startup)
{
  const { browser, page, log } = await open('?e2e=1', {
    viewport: small,
    setup: (context) => context.route(/cesium\.com|virtualearth\.net/, (route) => route.abort('internetdisconnected')),
  });
  try {
    await page.waitForSelector('#offline', { timeout: 20_000 });
    check('drill 2 map servers unreachable: #offline explains what needs the internet', /internet/.test(await page.locator('#offline').innerText()));
    await page.waitForTimeout(1500);
    check('drill 2 map servers unreachable: the globe is not blank', (await page.locator('#globe canvas').count()) === 1 && (await visibleLayers(page)) >= 1, `${await visibleLayers(page)} ready visible layer(s)`);
    check('drill 2 map servers unreachable: 0 uncaught exceptions', uncaught(log).length === 0, uncaught(log).join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- drill 3: the connection drops while the app is open
{
  const { browser, context, page, log } = await open('?e2e=1&notoken=1', { viewport: small });
  try {
    await page.waitForFunction(() => window.__dw?.settled(), null, { timeout: 30_000 });
    await context.setOffline(true);
    await page.waitForSelector('#offline', { timeout: 5000 });
    await page.click('#places-toggle');
    await page.locator('#places-list li button', { hasText: 'Tokyo' }).first().click(); // a flight that needs new tiles
    const ms = await cameraRest(page, 10_000);
    check('drill 3 connection lost: #offline shown and the app still flies (camera came to rest)', (await page.locator('#offline').isVisible()) && ms >= 0, `${ms} ms`);
    await context.setOffline(false);
    await page.waitForSelector('#offline', { state: 'detached', timeout: 5000 });
    check('drill 3 connection back: the #offline message clears by itself', true);
    check('drill 3 connection lost: 0 uncaught exceptions', uncaught(log).length === 0, uncaught(log).join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- drill 4: throttled tiles (every map-data request waits 12 s)
{
  let delaying = true;
  const { browser, page, log } = await open('?e2e=1', {
    viewport: small,
    setup: (context) =>
      context.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        if (!delaying || u.hostname === '127.0.0.1' || u.hostname === 'api.cesium.com') return route.continue();
        await new Promise((r) => setTimeout(r, 12_000));
        return delaying ? route.continue() : route.abort(); // once the drill is over, drop what is still waiting
      }),
  });
  try {
    await page.waitForSelector('#slow-tiles', { timeout: 30_000 });
    check('drill 4 throttled tiles: #slow-tiles explains the delay', /slowly/.test(await page.locator('#slow-tiles').innerText()));
    check('drill 4 throttled tiles: the globe is drawn, not blank', (await page.locator('#globe canvas').count()) === 1);
    delaying = false;
    await page.waitForSelector('#slow-tiles', { state: 'detached', timeout: 40_000 });
    check('drill 4 throttled tiles: the message clears once tiles arrive', true);
    check('drill 4 throttled tiles: 0 uncaught exceptions', uncaught(log).length === 0, uncaught(log).join(' | '));
  } finally {
    await browser.close();
  }
}
done();
