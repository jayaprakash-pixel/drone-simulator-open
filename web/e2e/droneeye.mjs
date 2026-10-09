// P1.9.1 the drone-eye view ("Look around from 100 m"), offered when Enter place (360) finds no true 360. The mock provider
// (?pano=mock&mock=empty) answers "nothing here", so no Mapillary traffic; terrain and imagery come from the real ion token.
// At the six Indian test places and Tokyo: the view sits at the set height above the terrain, level; the slider moves it;
// the soft-imagery warning shows below 60 m; dragging turns it; 3D buildings are off here with their own toggle; Esc restores.
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const PLACES = [
  ['Jaipur', 26.9124, 75.7873], ['Jaisalmer', 26.9157, 70.9083], ['Mount Abu', 24.5926, 72.7156], ['Pushkar', 26.4897, 74.5511],
  ['Thar Desert', 27.0, 70.3], ['Spiti Valley', 32.2276, 78.0719], ['Tokyo', 35.6762, 139.6503],
];
const R = Math.PI / 180;
const ecef = (lat, lon, h) => { const s = Math.sin(lat * R); const n = 6_378_137 / Math.sqrt(1 - 6.69437999014e-3 * s * s); return [(n + h) * Math.cos(lat * R) * Math.cos(lon * R), (n + h) * Math.cos(lat * R) * Math.sin(lon * R), (n * (1 - 6.69437999014e-3) + h) * s]; };
const space = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

const { browser, page, log } = await open('?e2e=1&pano=mock&mock=empty', { viewport: { width: 1280, height: 720 } });
try {
  await settledAt(page, 40_000);
  const settle = () => page.waitForFunction(() => window.__dw.settled(), null, { timeout: 60_000 }).catch(() => {});
  // camera height above the most detailed terrain under it, which is what the view is placed against
  const cam = () => page.evaluate(async () => {
    const c = window.__dw.viewer.camera;
    const p = c.positionCartographic;
    const d = 180 / Math.PI;
    const g = await window.__dw.globe.groundEllipsoid(p.latitude * d, p.longitude * d);
    return { lat: p.latitude * d, lon: p.longitude * d, h: p.height, agl: g === undefined ? NaN : p.height - g, heading: c.heading * d, pitch: c.pitch * d, roll: c.roll * d };
  });
  const setAgl = (m) => page.evaluate((v) => { const s = document.querySelector('#drone-agl'); s.value = String(v); s.dispatchEvent(new Event('input')); }, m);
  for (const [name, lat, lon] of PLACES) {
    await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), [lat, lon]);
    await cameraRest(page, 25_000);
    await settle();
    await clickAt(page);
    await page.waitForSelector('#side:not(.hidden)');
    await page.click('#enter-place');
    const offered = await page.waitForSelector('#pano-look-around', { timeout: 15_000 }).then(() => true, () => false);
    const before = await cam();
    await page.click('#pano-look-around');
    await page.waitForSelector('#drone-panel:not(.hidden)', { timeout: 15_000 });
    await settle();
    const a = await cam();
    const panel = await page.locator('#drone-panel').innerText();
    const soft100 = await page.locator('#drone-soft').isVisible();
    const bOff = await page.evaluate(() => window.__dw.globe.buildings()?.show !== true && !document.querySelector('#drone-buildings').checked);
    await setAgl(40);
    await page.waitForTimeout(400);
    const b = await cam();
    const soft40 = await page.locator('#drone-soft').isVisible();
    await page.mouse.move(640, 360);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(640 + i * 10, 360);
    await page.mouse.up();
    const c = await cam();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const e = await cam();
    const back = space(ecef(e.lat, e.lon, e.h), ecef(before.lat, before.lon, before.h));
    check(
      `P1.9.1 ${name}: offered when no 360 is found; 100 m and 40 m above the terrain (within 1 m), level; warning only below 60 m; label shown; buildings off; drag turns; Esc restores (< 1 m, < 0.1 deg)`,
      offered && Math.abs(a.agl - 100) <= 1 && Math.abs(b.agl - 40) <= 1 && Math.abs(a.pitch) < 0.5 && angle(a.roll, 0) < 0.1 && !soft100 && soft40 && /3D model view, not a photograph/.test(panel) && bOff && angle(c.heading, b.heading) > 15 && back < 1 && angle(e.heading, before.heading) < 0.1 && angle(e.pitch, before.pitch) < 0.1,
      `AGL ${a.agl.toFixed(2)} / ${b.agl.toFixed(2)} m, pitch ${a.pitch.toFixed(2)}, soft ${soft100}/${soft40}, buildings off ${bOff}, turned ${angle(c.heading, b.heading).toFixed(1)} deg, back ${back.toFixed(3)} m, heading ${angle(e.heading, before.heading).toFixed(3)} deg`,
    );
  }
  check('P1.9.1 after leaving, 3D buildings are back as they were (on by default) with the disclaimer in the bottom bar', await page.evaluate(() => window.__dw.globe.buildings()?.show === true) && (await page.locator('#buildings-note').isVisible()));
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  console.log(`info  JS heap after the seven places: ${heap} MB`);
  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
} finally {
  await browser.close();
}
done();
