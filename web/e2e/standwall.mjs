// P1.9.2 obstacle honesty at the owner's screenshot spot, 19.906845, 83.169790, where OSM way 344167942 ("Sabha Mandap")
// has a wall 0.8 m north: Stand here keeps the clicked position, is not inside a building, faces away from the wall and
// says how close it is; the building disclaimer is in the bottom bar while 3D buildings are on, and only then.
import { cameraRest, checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const [LAT, LON] = [19.906845, 83.16979];
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
try {
  await settledAt(page, 40_000);
  const note = page.locator('#buildings-note');
  check('P1.9.2 the building disclaimer is in the bottom bar while 3D buildings are on', (await note.isVisible()) && /most have no mapped height \(drawn at 3 m per level\), and trees, poles and wires are missing\. Do not use for clearance\./.test(await note.innerText()), await note.innerText());
  await page.uncheck('#buildings-toggle');
  check('P1.9.2 ... and gone when they are off', !(await note.isVisible()));
  await page.check('#buildings-toggle');
  await page.waitForFunction(() => window.__dw.globe.buildings()?.show === true);

  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 300), [LAT, LON]);
  await cameraRest(page, 25_000);
  await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 60_000 }).catch(() => {});
  const drawn = await page.evaluate(async ([la, lo]) => (await window.__dw.topAt(la, lo)) - window.__dw.surface(la, lo), [LAT, LON]);
  await page.evaluate(([la, lo]) => window.__dw.eyes.standHere(la, lo), [LAT, LON]);
  await page.waitForFunction(() => document.body.classList.contains('standing'), null, { timeout: 15_000 });
  await page.waitForSelector('#stand-wall', { timeout: 10_000 }).catch(() => {});
  const c = await page.evaluate(() => {
    const cam = window.__dw.viewer.camera;
    const p = cam.positionCartographic;
    return { lat: (p.latitude * 180) / Math.PI, lon: (p.longitude * 180) / Math.PI, heading: (cam.heading * 180) / Math.PI, agl: window.__dw.aboveTerrain() };
  });
  const wall = await page.locator('#stand-wall').innerText().catch(() => '');
  check('P1.9.2 Stand here keeps the clicked position (< 0.5 m) on the ground, not inside a building (nothing drawn above the terrain at the spot, eye 1.7 m above it)', metres([c.lat, c.lon], [LAT, LON]) < 0.5 && drawn < 0.5 && Math.abs(c.agl - 1.7) <= 0.3, `${metres([c.lat, c.lon], [LAT, LON]).toFixed(2)} m from the click, drawn ${drawn.toFixed(2)} m above terrain at the spot, eye ${c.agl?.toFixed(2)} m`);
  check('P1.9.2 it faces away from the wall to the north (more than 45 deg off north)', angle(c.heading, 0) > 45, `heading ${c.heading.toFixed(1)} deg`);
  check('P1.9.2 a one-line note says how close the wall is', /^Wall [0-2]\.\d m north$/.test(wall.trim()), wall);
  await page.keyboard.press('Escape');
  check('P1.9.2 the wall note clears with Esc', (await page.locator('#stand-wall').count()) === 0);
  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
} finally {
  await browser.close();
}
done();
