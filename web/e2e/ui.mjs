// P1.4 / P1.5 acceptance for everything that does not need terrain: marker, panel, copy, home point, controls, places,
// settings, attribution bar, and persistence across reloads (localStorage works the same with or without a token).
// Runs without a token, so it costs no Cesium ion traffic. Elevation, terrain and provider credits: ui-token.mjs.
import { cameraAt, cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const small = { width: 960, height: 600 };
const LATLON = /^-?\d+\.\d{6}, -?\d+\.\d{6}$/;
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const { browser, context, page, log } = await open('?e2e=1&notoken=1', { viewport: small });
try {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  await settledAt(page);
  const text = (sel) => page.locator(sel).innerText();
  const marker = (id) => page.evaluate((i) => window.__dw.marker(i), id);
  const same = (a, b) => a && b && Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;

  // ---- P1.4.2 click to select: marker, panel with details, Copy, clicking elsewhere moves the marker
  check('P1.4.2 panel is hidden before any click', !(await page.locator('#side').isVisible()));
  await clickAt(page);
  await page.waitForSelector('#side:not(.hidden)');
  const c1 = await text('#sel-coords');
  const m1 = await marker('selected');
  check('P1.4.2 click adds a marker and fills the panel (lat, lon, elevation line, Set as home point, Copy)', LATLON.test(c1) && !!m1 && (await page.locator('#sel-elev').isVisible()) && (await page.locator('#set-home').isVisible()) && (await page.locator('#copy-coords').isVisible()), `${c1}`);
  check('P1.4.2 marker sits at the clicked coordinates', same(m1, c1.split(', ').map(Number)));
  check('P1.4.2 with no terrain the elevation line says why it is missing', /needs terrain/.test(await text('#sel-elev')));
  await page.click('#copy-coords');
  check('P1.4.2 Copy puts "lat, lon" on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === c1, c1);
  await clickAt(page, -150, 60); // left of centre: the right-hand column (selected point, controls) is tall since P1.8
  await page.waitForFunction((old) => document.querySelector('#sel-coords').textContent !== old, c1);
  const c2 = await text('#sel-coords');
  check('P1.4.2 clicking elsewhere moves the marker and the readout', c2 !== c1 && same(await marker('selected'), c2.split(', ').map(Number)), `${c1} -> ${c2}`);

  // ---- P1.4.3 home point survives a reload (exact string match)
  await page.click('#set-home');
  const homeBefore = await marker('home');
  check('P1.4.3 Set as home point draws the home marker', same(homeBefore, c2.split(', ').map(Number)));
  await page.reload({ waitUntil: 'load' });
  await settledAt(page);
  const homeAfter = await marker('home');
  check('P1.4.3 after reload the home marker is back at the same lat/lon (6 decimals, exact)', !!homeAfter && homeAfter[0].toFixed(6) === c2.split(', ')[0] && homeAfter[1].toFixed(6) === c2.split(', ')[1], `${homeAfter?.map((v) => v.toFixed(6)).join(', ')} vs ${c2}`);
  check('P1.4.3 the selection panel starts closed after reload', !(await page.locator('#side').isVisible()));

  // ---- P1.5.1 layer switch, terrain toggle, exaggeration slider, FPS counter
  const flags = () => page.evaluate(() => { const v = window.__dw.viewer; return Array.from({ length: v.imageryLayers.length }, (_, i) => v.imageryLayers.get(i).show); });
  // layers: satellite, Sentinel-2 (P1.8.7), streets; exactly one is shown
  check('P1.5.1 satellite layer is the default', JSON.stringify(await flags()) === '[true,false,false]', JSON.stringify(await flags()));
  await page.selectOption('#layer-select', 'streets');
  check('P1.5.1 layer switch changes the visible imagery layer', JSON.stringify(await flags()) === '[false,false,true]', JSON.stringify(await flags()));
  check('P1.5.5 OpenStreetMap credit shows while the streets layer is on', await page.locator('#osm-credit').isVisible());
  await page.selectOption('#layer-select', 'satellite');
  check('P1.5.1 terrain toggle is disabled without a token (explains why)', (await page.locator('#terrain-toggle').isDisabled()) && /token/.test((await page.locator('#terrain-toggle').getAttribute('title')) ?? ''));
  const exag = () => page.evaluate(() => window.__dw.viewer.scene.verticalExaggeration);
  check('P1.5.1 exaggeration defaults to 1x (slider and scene)', (await page.locator('#exaggeration').inputValue()) === '1' && (await exag()) === 1);
  await page.locator('#exaggeration').fill('3');
  check('P1.5.1 slider sets the scene exaggeration', (await exag()) === 3 && /3×/.test(await text('#exag-value')));
  await page.evaluate(() => void window.__dw.globe.flyToPlace(26.9124, 75.7873, 30_000)); // frames get drawn during the flight, so the counter moves
  let sawFps = 0;
  for (let i = 0; i < 12 && sawFps === 0; i++) {
    await page.waitForTimeout(400);
    sawFps = Number(((await text('#fps')).match(/^FPS (\d+)/) ?? [])[1] ?? 0);
  }
  check('P1.5.1 FPS counter shows a number that is above 0 while the camera moves', sawFps > 0, `FPS ${sawFps}`);
  await cameraRest(page, 8000);
  await page.waitForTimeout(2200);
  check('P1.5.1 FPS counter reads idle when nothing moves', /^FPS 0 \(idle\)$/.test(await text('#fps')), await text('#fps'));

  // ---- P1.5.2 resolution scale
  const drawn = () => page.evaluate(() => { const v = window.__dw.viewer; const c = document.querySelector('#globe canvas'); return { scale: v.resolutionScale, ratio: c.width / c.clientWidth }; });
  for (const s of ['0.5', '0.75', '1']) {
    await page.selectOption('#quality', s);
    await page.waitForTimeout(500);
    const d = await drawn();
    check(`P1.5.2 resolution ${Number(s) * 100}% sets resolutionScale and the drawing size to match`, d.scale === Number(s) && Math.abs(d.ratio - Number(s)) < 0.01, `scale ${d.scale}, canvas/css ${d.ratio.toFixed(3)}`);
  }
  await page.selectOption('#quality', '0.5');

  // ---- P1.5.3 saved places
  await page.click('#places-toggle');
  const names = await page.locator('#places-list li').allInnerTexts();
  const want = ['Jaipur', 'Jaisalmer', 'Mount Abu', 'Pushkar', 'Thar', 'Spiti', 'Tokyo'];
  check('P1.5.3 list shows the seven test places', names.length >= 7 && want.every((w) => names.some((n) => n.includes(w))), names.join(' | '));
  await page.locator('#places-list li button', { hasText: 'Pushkar' }).first().click();
  const ms = await cameraRest(page, 10_000);
  const cam = await cameraAt(page);
  check('P1.5.3 clicking Pushkar flies there (within 0.05 degrees)', ms >= 0 && Math.abs(cam.lat - 26.4897) < 0.05 && Math.abs(cam.lon - 74.5511) < 0.05, `${ms} ms; lat ${cam.lat.toFixed(4)} lon ${cam.lon.toFixed(4)}`);
  await clickAt(page);
  await page.waitForSelector('#side:not(.hidden)');
  await page.fill('#place-name', 'My test place');
  await page.click('#save-place');
  check('P1.5.3 a user-added place appears in the list', (await page.locator('#places-list li').allInnerTexts()).some((n) => n.includes('My test place')));

  // ---- P1.5.4 settings: units and coordinate format apply at once
  await page.click('#open-settings');
  check('P1.5.4 the token field is a password input (never shown in the page)', (await page.locator('#token-input').getAttribute('type')) === 'password');
  await page.selectOption('#units', 'ft');
  await page.waitForTimeout(300);
  check('P1.5.4 units to feet updates the camera readout at once', / ft /.test(await text('#camera-readout')), await text('#camera-readout'));
  await page.selectOption('#coord-format', 'dms');
  check('P1.5.4 coordinate format to DMS updates the panel at once', /°.*′.*″[NS] .*°.*′.*″[EW]/.test(await text('#sel-coords')), await text('#sel-coords'));

  // ---- reload: persisted choices come back; exaggeration does not
  await page.reload({ waitUntil: 'load' });
  await settledAt(page);
  await page.click('#places-toggle');
  const after = {
    quality: await page.locator('#quality').inputValue(),
    scale: (await drawn()).scale,
    place: (await page.locator('#places-list li').allInnerTexts()).some((n) => n.includes('My test place')),
    exag: await exag(),
    exagSlider: await page.locator('#exaggeration').inputValue(),
  };
  await page.click('#open-settings');
  const prefs = { units: await page.locator('#units').inputValue(), format: await page.locator('#coord-format').inputValue() };
  check('P1.5.2 resolution choice survives a reload', after.quality === '0.5' && after.scale === 0.5, JSON.stringify(after));
  check('P1.5.3 the user-added place survives a reload', after.place);
  check('P1.5.4 units and coordinate format survive a reload', prefs.units === 'ft' && prefs.format === 'dms', JSON.stringify(prefs));
  check('P1.5.1 exaggeration is back to 1x on every fresh load (never persisted)', after.exag === 1 && after.exagSlider === '1');

  // ---- P1.5.5 always-visible bar at start, after a fly-to, and at close range
  const bar = async () => page.evaluate(() => { const r = document.querySelector('#credits').getBoundingClientRect(); return { visible: r.height > 0 && r.bottom <= innerHeight + 1 && r.bottom >= innerHeight - 1, text: document.querySelector('#credits').innerText }; });
  const b0 = await bar();
  await page.evaluate(() => void window.__dw.globe.flyToPlace(26.9124, 75.7873, 30_000));
  await cameraRest(page, 8000);
  const b1 = await bar();
  await page.evaluate(() => window.__dw.globe.flyToPlace(26.9124, 75.7873, 150));
  await cameraRest(page, 10_000);
  const b2 = await bar();
  check('P1.5.5 bottom bar is on screen and shows the rehearsal-only notice at start, after a fly-to and at street level', [b0, b1, b2].every((b) => b.visible && /Rehearsal tool only/.test(b.text)), [b0, b1, b2].map((b) => b.visible).join(','));
  check('whole run: 0 console errors, 0 bad responses (the 1x1 streets tiles are mocked)', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
} finally {
  await browser.close();
}
done();
