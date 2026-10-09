// P1.3 acceptance (search) plus the search-related failure messages of P1.6.1. No token, so no Cesium ion traffic.
// Part 1 mocks Nominatim (deterministic: typing, Enter, rate limit, no results, failure, offline); part 2 is live.
import { cameraAt, cameraRest, checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const NOMINATIM = 'https://nominatim.openstreetmap.org/**';
const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
const item = (name, lat, lon, d = 0.1) => ({ display_name: name, lat: String(lat), lon: String(lon), boundingbox: [lat - d, lat + d, lon - d, lon + d].map(String) });
const seven = Array.from({ length: 7 }, (_, i) => item(`Place ${i}`, 20 + i, 70 + i));
const small = { width: 960, height: 600 };

// ---------------------------------------------------------------- part 1: mocked
{
  const { browser, context, page, log } = await open('?e2e=1&notoken=1', { viewport: small });
  try {
    const requests = [];
    let mode = 'many';
    await page.route(NOMINATIM, (route) => {
      requests.push(route.request().url());
      if (mode === 'fail') return route.fulfill({ status: 500, headers: cors, body: '[]' });
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(mode === 'none' ? [] : seven) });
    });
    await settledAt(page);
    const input = page.locator('#search');

    await input.pressSequentially('Jaisalmer', { delay: 40 });
    await page.waitForTimeout(1300);
    check('P1.3.1 typing alone sends 0 requests', requests.length === 0, `${requests.length} requests`);

    await page.keyboard.press('Enter');
    await page.waitForSelector('#search-results li');
    check('P1.3.1 Enter sends exactly 1 request with limit=5', requests.length === 1 && new URL(requests[0]).searchParams.get('limit') === '5', requests[0]);
    check('P1.3.2 results list shows <= 5 items (mock returned 7)', (await page.locator('#search-results li').count()) === 5);
    check('P1.5.5 OpenStreetMap credit appears while search results are shown', await page.locator('#osm-credit').isVisible() && /OpenStreetMap/.test(await page.locator('#osm-credit').innerText()));

    await page.waitForTimeout(1200); // let the 1 s gap pass, then a fresh query and three Enters at once
    await input.fill('Jaipur');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1600);
    check('P1.3.1 three Enter presses within 1 s send only 1 more request', requests.length === 2, `${requests.length} requests in total`);

    // P1.6.1: empty search and a failing service each show their own message
    mode = 'none';
    await page.waitForTimeout(1100);
    await input.fill('zzzzqx');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#no-results');
    check('P1.6.1 empty search shows #no-results naming the query', /zzzzqx/.test(await page.locator('#no-results').innerText()) && !(await page.locator('#search-results').isVisible()));
    check('P1.5.5 OpenStreetMap credit hides when no OSM data is shown', !(await page.locator('#osm-credit').isVisible()));
    mode = 'fail';
    await page.waitForTimeout(1100);
    await input.fill('qqqqqq');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#search-failed');
    check('P1.6.1 service error shows #search-failed', await page.locator('#search-failed').isVisible());

    // P1.6.1 offline: the page is already loaded, then the network goes away
    await page.route(NOMINATIM, (route) => route.abort('internetdisconnected'));
    await context.setOffline(true);
    await page.waitForSelector('#offline');
    await page.waitForTimeout(1100);
    await input.fill('anywhere');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#search-failed');
    check('P1.6.1 offline shows #offline and the search failure message, globe still drawn', (await page.locator('#offline').isVisible()) && (await page.locator('#search-failed').isVisible()) && (await page.locator('#globe canvas').count()) === 1);
    check('part 1: 0 uncaught exceptions', log.errors.filter((e) => e.startsWith('pageerror')).length === 0, log.errors.filter((e) => e.startsWith('pageerror')).join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- part 2: live Nominatim (about 3 requests, 1.2 s apart)
{
  const { browser, page, log } = await open('?e2e=1&notoken=1', { viewport: small });
  try {
    await settledAt(page);
    const input = page.locator('#search');
    const live = async (q) => {
      const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes('nominatim.openstreetmap.org/search') && r.url().includes(encodeURIComponent(q))), (async () => { await input.fill(q); await page.keyboard.press('Enter'); })()]);
      return res.json();
    };
    const jsl = await live('Jaisalmer');
    const nearJsl = jsl.some((r) => Math.abs(Number(r.lat) - 26.9) < 0.5 && Math.abs(Number(r.lon) - 70.9) < 0.5);
    check('P1.3.1 live: Jaisalmer returns >= 1 result near lat 26.9, lon 70.9', jsl.length >= 1 && nearJsl, `${jsl.length} results; first: ${jsl[0]?.display_name}`);

    await page.waitForTimeout(1300);
    await live('Jaipur');
    await page.waitForSelector('#search-results li');
    const n = await page.locator('#search-results li').count();
    check('P1.3.2 live: Jaipur shows <= 5 items', n >= 1 && n <= 5, `${n} items`);
    await page.locator('#search-results li button').first().click();
    const ms = await cameraRest(page, 10_000);
    const cam = await cameraAt(page);
    const inside = cam.lat > 26.7 && cam.lat < 27.1 && cam.lon > 75.6 && cam.lon < 76.0;
    check('P1.3.2 live: clicking the first result ends inside lat 26.7-27.1, lon 75.6-76.0 within 10 s', ms >= 0 && inside, `${ms} ms; lat ${cam.lat.toFixed(3)} lon ${cam.lon.toFixed(3)} h ${Math.round(cam.h)} m`);
    check('part 2: 0 console errors', log.errors.length === 0, log.errors.join(' | '));
  } finally {
    await browser.close();
  }
}
done();
