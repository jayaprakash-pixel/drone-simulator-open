// P1.8.5 Enter place (360), with no Mapillary token needed: the flows run on the mock provider (?pano=mock), and the real
// Mapillary provider runs against canned Graph API replies for every failure. No Cesium ion traffic either (?notoken=1:
// the offline globe is enough to click a point).
import { checker, clickAt, open } from './lib.mjs';

const { check, done } = checker();
const small = { width: 960, height: 600 };
const uncaught = (log) => log.errors.filter((e) => e.startsWith('pageerror'));
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b.lat - a.lat) * R) / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(((b.lon - a.lon) * R) / 2) ** 2));
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

async function pickPoint(page) {
  await page.waitForFunction(() => window.__dw?.settled(), null, { timeout: 30_000 });
  await page.evaluate(() => window.__dw.globe.flyToPlace(26.9124, 75.7873, 5000));
  await page.waitForTimeout(3500);
  await clickAt(page);
  await page.waitForSelector('#side:not(.hidden)');
}
const text = (page, sel) => page.locator(sel).innerText();
const marker = (page) => page.evaluate(() => window.__dw.panoMarker());
const panos = (page) => page.evaluate(() => window.__dw.provider.panos);

// ---------------------------------------------------------------- the 360 view on the mock provider
{
  const { browser, page, log } = await open('?e2e=1&notoken=1&pano=mock', { viewport: small });
  try {
    await pickPoint(page);
    await page.click('#enter-place');
    await page.waitForSelector('#pano-view:not(.hidden)');
    await page.waitForFunction(() => /captured/.test(document.querySelector('#pano-info').textContent));
    const info = await text(page, '#pano-info');
    const attrib = await text(page, '#pano-attrib');
    const box = await page.locator('#pano-view').boundingBox();
    check('P1.8.5 Enter place (360) opens a full-screen view', box.width === small.width && box.height === small.height, `${box.width}x${box.height}`);
    check('P1.8.5 the view shows provider, 360 label, capture date and distance from the clicked point', /Mock provider/.test(info) && /360° panorama/.test(info) && /captured 14 Mar 2023/.test(info) && /40 m from the clicked point/.test(info), info);
    check('P1.8.5 the attribution line is shown with the image creator', /Test data/.test(attrib) && /image by mock-user/.test(attrib), attrib);
    check('P1.8.5 the nearer flat photo (20 m) lost to the 360 panorama (40 m)', /mock-a/.test(await text(page, '#mock-id')));

    let [a, b] = await panos(page);
    let m = await marker(page);
    check('P1.8.5 the globe marker sits on the panorama (< 1 m) and points where the view looks (< 1 deg)', !!m && metres(m, a) < 1 && angle(m.bearing, 0) < 1, m ? `${metres(m, a).toFixed(3)} m, bearing ${m.bearing.toFixed(2)}` : 'no marker');
    await page.click('#mock-next');
    m = await marker(page);
    // the second mock panorama is 30 m north of the first (28 m east, 28 m north of the click): 65 m from the click
    check('P1.8.5 moving to the next panorama moves the marker with it (< 1 m) and updates the distance', !!m && metres(m, b) < 1 && /65 m from the clicked point/.test(await text(page, '#pano-info')), m ? `${metres(m, b).toFixed(3)} m; ${await text(page, '#pano-info')}` : 'no marker');
    await page.click('#mock-turn');
    m = await marker(page);
    check('P1.8.5 turning the view turns the marker (bearing 30 +/- 1 deg)', !!m && angle(m.bearing, 30) < 1 && metres(m, b) < 1, m ? `bearing ${m.bearing.toFixed(2)}` : 'no marker');
    await page.click('#mock-next');
    check('P1.8.5 a flat photo is labelled as not 360', /flat photo, not 360°/.test(await text(page, '#pano-info')), await text(page, '#pano-info'));
    await page.click('#pano-back');
    check('P1.8.5 Back to globe closes the view and the marker stays on the globe', (await page.locator('#pano-view').isHidden()) && !!(await marker(page)));
    await page.click('#enter-place');
    await page.waitForSelector('#pano-view:not(.hidden)');
    await page.keyboard.press('Escape');
    check('P1.8.5 Esc closes the view too', await page.locator('#pano-view').isHidden());
    check('mock run: 0 console errors, 0 uncaught exceptions', log.errors.length === 0, log.errors.join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- nothing within 100 m, and nothing within 1 km
for (const scenario of ['far', 'empty']) {
  const { browser, page, log } = await open(`?e2e=1&notoken=1&pano=mock&mock=${scenario}`, { viewport: small });
  try {
    await pickPoint(page);
    await page.click('#enter-place');
    await page.waitForSelector('#pano-none');
    const msg = await text(page, '#pano-none');
    const go = await page.locator('#pano-go-nearest').count();
    const stand = await page.locator('#pano-stand-instead').count();
    if (scenario === 'far') {
      // the mock puts it 640 m east on a rough 111,320 m-per-degree grid, which the haversine distance reads as 639 m
      check('P1.8.5 nothing within 100 m: says how far the nearest is, with Go to nearest and Stand here in 3D instead', /within 100 m/.test(msg) && /6(39|40) m away/.test(msg) && go === 1 && stand === 1, msg);
      await page.click('#pano-go-nearest');
      await page.waitForFunction(() => /captured/.test(document.querySelector('#pano-info').textContent));
      check('P1.8.5 Go to nearest opens it, 640 m from the clicked point', /6(39|40) m from the clicked point/.test(await text(page, '#pano-info')), await text(page, '#pano-info'));
      await page.keyboard.press('Escape');
      await page.click('#pano-stand-instead');
      await page.waitForFunction(() => document.body.classList.contains('standing'), null, { timeout: 10_000 });
      check('P1.8.5 Stand here in 3D instead starts Stand here at the clicked point', await page.locator('#standing').isVisible());
      await page.keyboard.press('Escape');
    } else {
      check('P1.8.5 nothing within 1 km: says so plainly and offers Stand here in 3D instead (no blank screen)', /within 1\.0 km/.test(msg) && go === 0 && stand === 1 && (await page.locator('#pano-view').isHidden()), msg);
    }
    check(`${scenario} run: 0 console errors, 0 uncaught exceptions`, log.errors.length === 0, log.errors.join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- the real Mapillary provider: each failure has its own message
{
  let mode = 'none';
  const graphImage = { id: '1234567890', geometry: { coordinates: [75.7873, 26.9124] }, captured_at: 1678752000000, is_pano: true, camera_type: 'spherical', creator: { username: 'someone' } };
  const replies = {
    none: { status: 200, body: { data: [] } },
    'bad-token': { status: 400, body: { error: { message: 'Error validating application', type: 'OAuthException', code: 190 } } },
    'rate-limit': { status: 400, body: { error: { message: 'Application request limit reached', type: 'OAuthException', is_transient: true, code: 4 } } },
    'provider-error': { status: 503, body: '<html>busy</html>' },
    viewer: { status: 200, body: { data: [graphImage] } }, // search finds an image, but this canned server cannot feed the viewer
  };
  const { browser, page, log } = await open('?e2e=1&notoken=1&pano=mapillary', {
    viewport: small,
    setup: async (context) => {
      await context.addInitScript(() => localStorage.setItem('dw.settings', JSON.stringify({ mapillaryToken: 'MLY|0|not-a-real-token' })));
      await context.route(/graph\.mapillary\.com|mapillary\.com|fbcdn\.net/, (route) => {
        if (mode === 'offline') return route.abort('internetdisconnected');
        const r = replies[mode];
        return route.fulfill({ status: r.status, contentType: typeof r.body === 'string' ? 'text/html' : 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization' }, body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body) });
      });
    },
  });
  try {
    await pickPoint(page);
    const sent = [];
    page.on('request', (r) => /graph\.mapillary\.com/.test(r.url()) && sent.push(r));
    await page.click('#enter-place');
    await page.waitForSelector('#pano-none');
    check('P1.8.5 Mapillary, no image in range: the plain "no street-level images" message', /No street-level images within 1\.0 km .*Mapillary/.test(await text(page, '#pano-none')), await text(page, '#pano-none'));
    const auth = sent.length ? await sent[0].headerValue('authorization') : null;
    check('P1.8.5 the token goes in the Authorization header, never in the URL', sent.length > 0 && sent.every((r) => !/MLY/.test(r.url())) && auth === 'OAuth MLY|0|not-a-real-token', `${sent.length} requests`);
    for (const kind of ['bad-token', 'rate-limit', 'offline', 'provider-error', 'viewer']) {
      mode = kind;
      await page.click('#enter-place');
      const shown = await page.waitForSelector(`#pano-${kind}`, { timeout: 30_000 }).then(() => true, () => false);
      const others = await page.locator('#notices [id^="pano-"]').count();
      check(`P1.8.5 ${kind}: its own plain message (#pano-${kind}), one at a time, the 360 view not left blank`, shown && others === 1 && (await page.locator('#pano-view').isHidden()), shown ? (await text(page, `#pano-${kind}`)).slice(0, 100) : 'no message');
    }
    check('failure run: 0 uncaught exceptions', uncaught(log).length === 0, uncaught(log).join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- no Mapillary token at all
{
  const { browser, page, log } = await open('?e2e=1&notoken=1&pano=mapillary&nomly=1', { viewport: small });
  try {
    await pickPoint(page);
    await page.click('#enter-place');
    await page.waitForSelector('#pano-no-token', { timeout: 10_000 });
    const msg = await text(page, '#pano-no-token');
    check('P1.8.5 no token: says the 360 view needs a free Mapillary client token, where to put it, and offers Stand here', /Mapillary client token/.test(msg) && /Settings/.test(msg) && /Stand here/.test(msg), msg);
    check('no-token run: 0 console errors, 0 uncaught exceptions', log.errors.length === 0, log.errors.join(' | '));
  } finally {
    await browser.close();
  }
}
done();
