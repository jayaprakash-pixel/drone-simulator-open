// P3.3.1 waypoint editor and the real-terrain part of P3.3.2, headless with terrain (needs the Cesium ion token):
// Plan on, 5 clicks add 5 waypoints; dragging one changes its coordinates; deleting one leaves 4; height and speed per
// point survive a reload; the route is draped over the terrain. Then a route at 80 m above a home in the plains below
// Mount Abu, crossing towards Guru Shikhar (1,722 m), is flagged by the terrain check, the chart has one point per sample,
// and the result says "terrain only".
import { cameraRest, checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
const pts = () => page.evaluate(() => window.__dw.mission.points());
try {
  await settledAt(page, 90_000);
  await page.evaluate(() => localStorage.removeItem('dw.mission'));
  await page.evaluate(() => void window.__dw.globe.flyToPlace(26.4897, 74.5511, 1500));
  await cameraRest(page, 25_000);
  await page.click('#mission summary');
  await page.click('#mission-plan');
  const box = await page.locator('#globe canvas').boundingBox();
  const spots = [[-200, -120], [0, -160], [200, -120], [160, 60], [-160, 60]];
  for (const [dx, dy] of spots) {
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await page.waitForTimeout(400);
  }
  const five = await pts();
  check('P3.3.1 5 clicks add 5 waypoints', five.length === 5 && (await page.locator('#mission-list li').count()) === 5, `${five.length} points`);
  check('P3.3.1 a ground click while planning does not open the point panel', await page.locator('#side').evaluate((e) => e.classList.contains('hidden')));

  // drag point 3 by 80 px to the right
  const [sx, sy] = await page.evaluate((p) => window.__dw.screenOf(p.lat, p.lon), five[2]);
  await page.mouse.move(box.x + sx, box.y + sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + sx + i * 10, box.y + sy, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await pts();
  const moved = Math.abs(after[2].lon - five[2].lon) + Math.abs(after[2].lat - five[2].lat);
  check('P3.3.1 dragging a waypoint changes its coordinates (and adds none)', after.length === 5 && moved > 1e-5 && after[0].lon === five[0].lon, `point 3 moved ${(moved * 1e5).toFixed(1)} e-5 degrees; ${after.length} points`);

  await page.locator('#mission-list li').nth(1).locator('.wp-del').click();
  check('P3.3.1 deleting one leaves 4', (await pts()).length === 4 && (await page.locator('#mission-list li').count()) === 4);

  await page.locator('#mission-list li').nth(0).locator('.wp-alt').fill('45');
  await page.locator('#mission-list li').nth(0).locator('.wp-alt').dispatchEvent('change');
  await page.locator('#mission-list li').nth(3).locator('.wp-speed').fill('9');
  await page.locator('#mission-list li').nth(3).locator('.wp-speed').dispatchEvent('change');
  const route = await page.evaluate(() => {
    const e = window.__dw.viewer.entities.getById('mission-route');
    return { clamp: e.polyline.clampToGround.getValue(), n: e.polyline.positions.getValue().length, terrain: !window.__dw.flat() };
  });
  check('P3.3.1 the path is drawn draped over the terrain', route.clamp === true && route.n === 4 && route.terrain, JSON.stringify(route));
  await page.reload({ waitUntil: 'load' });
  await settledAt(page, 90_000);
  const kept = await pts();
  check('P3.3.1 per-point height and speed persist (reload)', kept.length === 4 && kept[0].alt === 45 && kept[3].speed === 9, JSON.stringify(kept.map((p) => [p.alt, p.speed])));

  // ---- P3.3.2 with real terrain: plains below Mount Abu towards Guru Shikhar at 80 m above home
  const home = { lat: 24.585, lon: 72.65 };
  const ground = await page.evaluate((h) => window.__dw.globe.groundMsl(h.lat, h.lon), home);
  await page.evaluate(([h, g]) => window.__dw.setPlace(h.lat, h.lon, g), [home, ground]);
  await page.evaluate(() => localStorage.setItem('dw.mission', JSON.stringify([{ lat: 24.62, lon: 72.71, alt: 80, speed: 8 }, { lat: 24.6497, lon: 72.7787, alt: 80, speed: 8 }])));
  await page.reload({ waitUntil: 'load' });
  await settledAt(page, 90_000);
  await page.evaluate(([h, g]) => window.__dw.setPlace(h.lat, h.lon, g), [home, ground]);
  await page.click('#mission summary');
  const r = await page.evaluate(() => window.__dw.mission.check());
  const drawn = await page.evaluate(() => ({ n: Number(document.querySelector('#mission-chart').dataset.samples), path: document.querySelector('#chart-path').getAttribute('points').trim().split(' ').length, ground: document.querySelector('#chart-ground').getAttribute('points').trim().split(' ').length, flags: document.querySelectorAll('.chart-flag').length }));
  console.log(`info  Mount Abu: home ground ${ground?.toFixed(0)} m MSL; ${r?.samples.length} samples; highest ground ${Math.max(...(r?.samples ?? []).map((s) => s.groundMsl)).toFixed(0)} m; ${r?.text}`);
  check('P3.3.2 with real terrain a Mount Abu route is flagged', r && !r.ok && r.stretches.length > 0 && /terrain only: not buildings, trees, poles or wires/.test(r.text), r?.text);
  check('P3.3.2 the chart draws one point per sample', drawn.path === r.samples.length && drawn.ground === r.samples.length && drawn.n === r.samples.length && drawn.flags === r.samples.filter((s) => s.flagged).length, JSON.stringify(drawn));
  check('whole run: 0 console errors (apart from handled lookups)', log.errors.filter((e) => !/overpass|mapillary|WebSocket connection/.test(e)).length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
done();
