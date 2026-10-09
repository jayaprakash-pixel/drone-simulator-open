// P1.10.3 "What is here?" in the selected-point panel.
//  1. Live at five places on five continents (real Cesium ion, Mapillary token from the build, OpenStreetMap Overpass):
//     every line fills in and none is left waiting.
//  2. Each failure with canned replies: Overpass rate limit, busy, offline and a slow answer; Mapillary rate limit and
//     offline; no Mapillary token; imagery tiles unreachable. Each must show its own wording. JS heap under 300 MB.
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const FIVE = [['London', 51.515618, -0.091998], ['Lagos', 6.455057, 3.394179], ['Sao Paulo', -23.550651, -46.633382], ['Mumbai', 19.054999, 72.869203], ['Sydney', -33.869844, 151.208285]];
const lines = (page) => page.evaluate(() => Object.fromEntries(['imagery', 'buildings', 'photos', 'terrain'].map((k) => { const li = document.querySelector(`#wih-${k}`); return [k, li ? { text: li.textContent, state: li.dataset.state } : null]; })));
// Edge logs every failed request as a console error. Failures of Overpass and Mapillary are handled and shown in plain words
// on their line, so they are not app errors; anything else is.
const HANDLED = /overpass-api\.de|graph\.mapillary\.com|virtualearth\.net/;
const appErrors = (log) => log.errors.filter((e) => !(e.startsWith('console: Failed to load resource') && HANDLED.test(e)));
const settledLines = (page, timeout = 60_000) => page.waitForFunction(() => ['imagery', 'buildings', 'photos', 'terrain'].every((k) => { const li = document.querySelector(`#wih-${k}`); return li && li.dataset.state !== 'wait'; }), null, { timeout }).then(() => true, () => false);

// ---- 1. live
{
  const { browser, page, log } = await open('?e2e=1&pano=mapillary', { viewport: { width: 1280, height: 800 }, liveOverpass: true });
  try {
    await settledAt(page, 40_000);
    for (const [name, lat, lon] of FIVE) {
      await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), [lat, lon]);
      await cameraRest(page, 25_000);
      await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 60_000 }).catch(() => {});
      const t0 = Date.now();
      await clickAt(page);
      const clickedPanel = await page.waitForSelector('#side:not(.hidden) #wih-terrain', { timeout: 3000 }).then(() => Date.now() - t0, () => -1);
      const ok = await settledLines(page);
      const l = await lines(page);
      console.log(`info  ${name}:\n    ${Object.values(l).map((x) => `[${x?.state}] ${x?.text}`).join('\n    ')}`);
      check(`P1.10.3 ${name}: the panel opens at once (${clickedPanel} ms) and all four lines fill in, none left waiting`, clickedPanel >= 0 && clickedPanel < 1500 && ok && /level \d+|coarser than level 17/.test(l.imagery.text) && /^Buildings: /.test(l.buildings.text) && /^Street-level photos/.test(l.photos.text) && /^Terrain: detail level \d+/.test(l.terrain.text), Object.values(l).map((x) => x?.state).join(','));
    }
    await (await page.context().newCDPSession(page)).send('HeapProfiler.collectGarbage'); // what is really held, not garbage waiting to be collected
    const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
    check('P1.10.3 JS heap after five continents stays under 300 MB', heap < 300, `${heap} MB`);
    check('live run: 0 console errors (failed Overpass/Mapillary/tile requests excluded: the app shows them on their line)', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}

// ---- 2. each failure with its own wording
{
  const mode = { overpass: 'ok', mapillary: 'ok', tiles: 'ok' };
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization' }, body: JSON.stringify(body) });
  const counts = { elements: [{ type: 'count', tags: { total: '12' } }, { type: 'count', tags: { total: '1' } }] };
  const { browser, page, log } = await open('?e2e=1&pano=mapillary', {
    viewport: { width: 1280, height: 800 },
    setup: async (context) => {
      await context.route(/overpass-api\.de/, async (route) => {
        if (mode.overpass === 'offline') return route.abort('internetdisconnected');
        if (mode.overpass === '429') return json(route, 429, {});
        if (mode.overpass === '504') return json(route, 504, {});
        if (mode.overpass === 'slow') await new Promise((r) => setTimeout(r, 6000));
        return json(route, 200, counts);
      });
      await context.route(/graph\.mapillary\.com/, (route) => {
        if (mode.mapillary === 'offline') return route.abort('internetdisconnected');
        if (mode.mapillary === 'rate') return json(route, 400, { error: { message: 'Application request limit reached', code: 4 } });
        return json(route, 200, { data: [] });
      });
      await context.route(/virtualearth\.net\/tiles/, (route) => (mode.tiles === 'offline' ? route.abort('internetdisconnected') : route.continue()));
    },
  });
  try {
    await settledAt(page, 40_000);
    await page.evaluate(() => void window.__dw.globe.flyToPlace(26.4897, 74.5511, 1000));
    await cameraRest(page, 25_000);
    let dx = -300;
    const tryCase = async (label, set, line, pattern, opts = {}) => {
      Object.assign(mode, { overpass: 'ok', mapillary: 'ok', tiles: 'ok' }, set);
      dx += 40; // a fresh point each time (imagery answers are cached per 20 m tile)
      await clickAt(page, dx, 120);
      let slowSeen = true;
      if (opts.slow) slowSeen = await page.waitForFunction((id) => /still checking \(slow answer\)/.test(document.querySelector(`#wih-${id}`)?.textContent ?? ''), line, { timeout: 8000 }).then(() => true, () => false);
      await settledLines(page, 30_000);
      const t = (await lines(page))[line];
      check(`P1.10.3 ${label}: its own wording on the ${line} line`, slowSeen && pattern.test(t?.text ?? ''), `[${t?.state}] ${t?.text}`);
    };
    await tryCase('Overpass rate limit', { overpass: '429' }, 'buildings', /limiting requests/);
    await tryCase('Overpass busy (504)', { overpass: '504' }, 'buildings', /busy and did not answer/);
    await tryCase('Overpass unreachable', { overpass: 'offline' }, 'buildings', /needs the internet/);
    await tryCase('Overpass slow (6 s)', { overpass: 'slow' }, 'buildings', /12 mapped in OpenStreetMap within 250 m, 1 with a height or levels tag/, { slow: true });
    await tryCase('Mapillary rate limit', { mapillary: 'rate' }, 'photos', /Mapillary is limiting requests/);
    await tryCase('Mapillary unreachable', { mapillary: 'offline' }, 'photos', /needs the internet/);
    await tryCase('imagery tiles unreachable', { tiles: 'offline' }, 'imagery', /could not be checked/);
    check('failure run: 0 uncaught exceptions', log.errors.filter((e) => e.startsWith('pageerror')).length === 0, log.errors.filter((e) => e.startsWith('pageerror')).join(' | '));
  } finally {
    await browser.close();
  }
}

// ---- no Mapillary token at all
{
  const { browser, page, log } = await open('?e2e=1&pano=mapillary&nomly=1', { viewport: { width: 1280, height: 800 } });
  try {
    await settledAt(page, 40_000);
    await clickAt(page);
    await settledLines(page, 30_000);
    const t = (await lines(page)).photos;
    check('P1.10.3 no Mapillary token: its own wording', /needs a free Mapillary token/.test(t?.text ?? ''), t?.text);
    check('no-token run: 0 console errors (handled request failures excluded)', appErrors(log).length === 0, appErrors(log).slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}
done();
