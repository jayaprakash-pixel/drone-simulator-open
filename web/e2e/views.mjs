// P2A.4.2 the four camera views, with a synthetic drone (no bridge) heading 60, pitch 5, 700 m above sea level:
// C cycles chase, first-person, top-down, free, chase. Chase sits behind and above and looks at the drone; first-person
// is at the nose looking along the heading; top-down looks straight down; free gives back the normal globe controls.
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const R = Math.PI / 180;
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const ST = { lat: 26.4897, lon: 74.5511, altMsl: 700, headingDeg: 60, pitchDeg: 5, rollDeg: 0 };

// camera relative to the drone as drawn: metres north, east and up, plus the camera's heading and pitch
const rel = (page) =>
  page.evaluate(() => {
    const { viewer, drone } = window.__dw;
    const p = drone.drawn();
    const c = viewer.camera.positionCartographic;
    const lat = (c.latitude * 180) / Math.PI, lon = (c.longitude * 180) / Math.PI;
    const n = (lat - p.lat) * 111_195, e = (lon - p.lon) * 111_195 * Math.cos((p.lat * Math.PI) / 180);
    return { n, e, up: c.height - p.alt, heading: (viewer.camera.heading * 180) / Math.PI, pitch: (viewer.camera.pitch * 180) / Math.PI, inputs: viewer.scene.screenSpaceCameraController.enableInputs, view: window.__dw.views.view };
  });
const pressC = async (page) => {
  await page.keyboard.press('c');
  await page.evaluate(() => window.__dw.viewer.scene.requestRender());
  await page.waitForTimeout(300);
  return rel(page);
};

const { browser, page, log } = await open('?e2e=1&notoken=1', { viewport: { width: 1000, height: 700 } });
try {
  await page.waitForFunction(() => window.__dw?.settled(), null, { timeout: 40_000 });
  await page.evaluate((st) => window.__dw.drone.set({ t: new Date().toISOString(), altAgl: 0, groundSpeed: 0, verticalSpeed: 0, batteryPct: 100, mode: 'LOITER', armed: true, gpsFix: 3, ...st }), ST);
  await page.waitForTimeout(500);

  const chase = await pressC(page);
  const back = Math.hypot(chase.n, chase.e), bearing = ((Math.atan2(chase.e, chase.n) * 180) / Math.PI + 360) % 360;
  check('P2A.4.2 C: chase sits behind (bearing heading+180) and above the drone, looking along the heading, user camera input off',
    chase.view === 'chase' && angle(bearing, ST.headingDeg + 180) <= 2 && Math.abs(back - 12) <= 0.5 && Math.abs(chase.up - 5) <= 0.5 && angle(chase.heading, ST.headingDeg) <= 1 && chase.pitch < -15 && !chase.inputs,
    `${back.toFixed(2)} m back at bearing ${bearing.toFixed(1)}, ${chase.up.toFixed(2)} m up, camera heading ${chase.heading.toFixed(1)} pitch ${chase.pitch.toFixed(1)}`);

  const fp = await pressC(page);
  const ahead = Math.hypot(fp.n, fp.e), fpBearing = ((Math.atan2(fp.e, fp.n) * 180) / Math.PI + 360) % 360;
  check('P2A.4.2 C: first-person is at the nose (0.3 m ahead) looking along the heading and pitch',
    fp.view === 'first-person' && Math.abs(ahead - 0.3) <= 0.05 && angle(fpBearing, ST.headingDeg) <= 2 && Math.abs(fp.up) <= 0.05 && angle(fp.heading, ST.headingDeg) <= 1 && Math.abs(fp.pitch - ST.pitchDeg) <= 1 && !fp.inputs,
    `${ahead.toFixed(2)} m ahead at bearing ${fpBearing.toFixed(1)}, ${fp.up.toFixed(2)} m up, heading ${fp.heading.toFixed(1)} pitch ${fp.pitch.toFixed(1)}`);

  const top = await pressC(page);
  check('P2A.4.2 C: top-down looks straight down from 150 m above the drone, north up',
    top.view === 'top-down' && Math.abs(top.pitch + 90) <= 1 && Math.hypot(top.n, top.e) <= 0.5 && Math.abs(top.up - 150) <= 0.5 && !top.inputs,
    `pitch ${top.pitch.toFixed(1)}, ${Math.hypot(top.n, top.e).toFixed(2)} m off, ${top.up.toFixed(1)} m up`);

  const free = await pressC(page);
  const before = await page.evaluate(() => window.__dw.viewer.camera.positionWC.clone());
  await page.evaluate((st) => window.__dw.drone.set({ t: new Date().toISOString(), altAgl: 0, groundSpeed: 0, verticalSpeed: 0, batteryPct: 100, mode: 'LOITER', armed: true, gpsFix: 3, ...st, lat: st.lat + 0.001 }), ST); // drone moves 111 m
  await page.waitForTimeout(500);
  const unmoved = await page.evaluate((b) => { const c = window.__dw.viewer.camera.positionWC; return Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z); }, before);
  const box = await page.locator('#globe canvas').boundingBox();
  await page.mouse.move(box.x + 500, box.y + 350);
  await page.mouse.down();
  await page.mouse.move(box.x + 650, box.y + 380, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const dragged = await page.evaluate((b) => { const c = window.__dw.viewer.camera.positionWC; return Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z); }, before);
  check('P2A.4.2 C: free stops following the drone and the normal globe controls work again (a drag moves the camera)',
    free.view === 'free' && free.inputs && unmoved < 0.01 && dragged > 1, `camera moved ${unmoved.toFixed(3)} m when the drone moved 111 m; ${dragged.toFixed(1)} m after a drag`);

  const again = await pressC(page);
  check('P2A.4.2 C once more: back to chase', again.view === 'chase');

  await page.locator('#search-input, input[type=search], input').first().focus();
  await page.keyboard.press('c');
  check('P2A.4.2 C while typing in a text box does not change the view', (await page.evaluate(() => window.__dw.views.view)) === 'chase');
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
done();
