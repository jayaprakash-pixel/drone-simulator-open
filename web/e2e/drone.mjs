// P2A.4.1 the drone on the globe.
//  1. Which way the model points, measured on screen with synthetic states (no bridge): over the sea at local noon, the
//     red nose and the green right-hand rotor are found by colour. Heading 90 from above: nose east, green rotor south.
//     Pitch +30 seen from the side: nose above the centre. Roll +30 (right side down) seen from behind: green rotor below.
//  2. Tracking, with the bridge replaying a recorded SITL flight: the drawn model (as Cesium holds it) stays within 1 m
//     and 2 degrees of each latest DroneState.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker, open } from './lib.mjs';

const { check, done } = checker();
const BRIDGE = fileURLToPath(new URL('../../bridge/', import.meta.url));
const R = Math.PI / 180;
const metres = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const SEA = { lat: 15, lon: 65, altMsl: 200 }; // Arabian Sea: no red or green on the water below

// screen positions of the red and green parts and of the drone's centre, from the frame Cesium just drew
const look = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const { viewer, drone } = window.__dw;
        const scene = viewer.scene;
        const off = scene.postRender.addEventListener(() => {
          off();
          const c = scene.canvas;
          const k = c.width / c.clientWidth;
          const cv = document.createElement('canvas');
          cv.width = c.width;
          cv.height = c.height;
          const g = cv.getContext('2d');
          g.drawImage(c, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const acc = { red: [0, 0, 0], green: [0, 0, 0] };
          for (let i = 0; i < d.length; i += 4) {
            const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
            const key = r > 60 && r > 2 * gg && r > 2 * b ? 'red' : gg > 70 && gg > 2 * r && gg > 1.5 * b ? 'green' : null;
            if (!key) continue;
            const p = i / 4;
            acc[key][0] += (p % c.width) / k;
            acc[key][1] += Math.floor(p / c.width) / k;
            acc[key][2]++;
          }
          const centre = scene.cartesianToCanvasCoordinates(drone.entity.position.getValue(viewer.clock.currentTime));
          const at = (a) => (a[2] ? [a[0] / a[2], a[1] / a[2], a[2]] : null);
          resolve({ centre: centre && [centre.x, centre.y], red: at(acc.red), green: at(acc.green) });
        });
        scene.requestRender();
      }),
  );

// sets a synthetic state and puts the camera `dist` m from the drone, looking at it from `from` (compass) or from above
async function pose(page, st, view) {
  await page.evaluate(
    ([st, view]) => {
      const { drone, viewer, mslToEllipsoid } = window.__dw;
      drone.set({ t: new Date().toISOString(), altAgl: 0, groundSpeed: 0, verticalSpeed: 0, batteryPct: 100, mode: 'STABILIZE', armed: false, gpsFix: 3, ...st });
      const h = mslToEllipsoid(st.lat, st.lon, st.altMsl);
      const d = view.dist / 111_195;
      const R = Math.PI / 180;
      const [la, lo, hh, heading, pitch] =
        view.from === 'above' ? [st.lat, st.lon, h + view.dist, 0, -90] : [st.lat + d * Math.cos(view.from * R), st.lon + (d * Math.sin(view.from * R)) / Math.cos(st.lat * R), h, (view.from + 180) % 360, 0];
      viewer.camera.setView({ destination: window.__dw.fromDegrees(lo, la, hh), orientation: { heading: heading * R, pitch: pitch * R, roll: 0 } });
    },
    [st, view],
  );
  await page.waitForTimeout(600); // the smoother settles (5 x 40 ms) and the model loads
  return look(page);
}
const dirOf = (from, to) => (from && to ? ((Math.atan2(to[0] - from[0], -(to[1] - from[1])) * 180) / Math.PI + 360) % 360 : NaN); // screen compass, up = 0

// ---- 1. which way the model points
{
  const { browser, page, log } = await open('?e2e=1&notoken=1', { viewport: { width: 800, height: 600 } });
  try {
    await page.waitForFunction(() => window.__dw?.settled(), null, { timeout: 40_000 });
    await page.evaluate(() => window.__dw.setTime('2026-06-21T07:40:00Z')); // about local noon at 65 E: the sun lights the model
    const s = { ...SEA, headingDeg: 90, pitchDeg: 0, rollDeg: 0 };
    const top = await pose(page, s, { from: 'above', dist: 3 });
    const nose = dirOf(top.centre, top.red), right = dirOf(top.centre, top.green);
    console.log(`info  from above, heading 90: ${JSON.stringify(top)}`);
    check('P2A.4.1 heading 90 seen from above (north up): the red nose points east and the green rotor south (within 10 degrees)', angle(nose, 90) <= 10 && angle(right, 180) <= 10, `nose at ${nose.toFixed(1)}, green at ${right.toFixed(1)} on screen`);
    const side = await pose(page, { ...SEA, headingDeg: 0, pitchDeg: 30, rollDeg: 0 }, { from: 90, dist: 3 });
    check('P2A.4.1 pitch +30 seen from the side: the nose is above the centre', side.red && side.centre && side.red[1] < side.centre[1] - 3, `nose y ${side.red?.[1]?.toFixed(1)}, centre y ${side.centre?.[1]?.toFixed(1)}`);
    const back = await pose(page, { ...SEA, headingDeg: 0, pitchDeg: 0, rollDeg: 30 }, { from: 180, dist: 3 });
    check('P2A.4.1 roll +30 (right side down) seen from behind: the green right-hand rotor is below the centre and to the right', back.green && back.centre && back.green[1] > back.centre[1] + 3 && back.green[0] > back.centre[0], `green ${back.green?.map((v) => v.toFixed(1))}, centre ${back.centre?.map((v) => v.toFixed(1))}`);
    check('part 1: 0 console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}

// ---- 2. tracking a replayed flight
{
  const bridge = spawn(`${BRIDGE}.venv\\Scripts\\python.exe`, ['ws_server.py', '--replay', 'tests\\fixtures\\flight.tlog'], { cwd: BRIDGE, stdio: 'ignore' });
  const { browser, page, log } = await open('?e2e=1&notoken=1&bridge', { viewport: { width: 800, height: 600 } });
  try {
    await page.waitForFunction(() => document.querySelector('#bridge-status')?.textContent === 'connected', null, { timeout: 15_000 });
    await page.evaluate(() => window.__dw.bridge().onState((s) => (window.__last = s)));
    await page.waitForTimeout(4000); // past the recorded SITL boot (bridge.mjs)
    // a whole loop of the recording (about 100 s): on the ground, the climb to 10 m and the landing (measured: about 39 of
    // 620 samples are taken while moving; at least 30 are required so the climb and landing are really covered)
    const worst = { pos: 0, alt: 0, ang: 0, n: 0, moving: 0 };
    for (let i = 0; i < 700; i++) {
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const s = window.__last;
        const now = window.__dw.droneNow();
        return s && now && s.gpsFix >= 3 ? { s, now, h: window.__dw.mslToEllipsoid(s.lat, s.lon, s.altMsl) } : null;
      });
      if (!r) continue;
      worst.n++;
      worst.moving += r.s.groundSpeed > 0.5 || Math.abs(r.s.verticalSpeed) > 0.5 ? 1 : 0;
      worst.pos = Math.max(worst.pos, metres([r.s.lat, r.s.lon], [r.now.lat, r.now.lon]));
      worst.alt = Math.max(worst.alt, Math.abs(r.h - r.now.h));
      worst.ang = Math.max(worst.ang, angle(r.s.headingDeg, r.now.heading), Math.abs(r.s.pitchDeg - r.now.pitch), Math.abs(r.s.rollDeg - r.now.roll));
    }
    check('P2A.4.1 replayed flight: the drawn model stays within 1 m (across and in height) and 2 degrees of each latest state', worst.n >= 500 && worst.moving >= 30 && worst.pos <= 1 && worst.alt <= 1 && worst.ang <= 2,
      `${worst.n} samples (${worst.moving} while moving): worst ${worst.pos.toFixed(2)} m across, ${worst.alt.toFixed(2)} m in height, ${worst.ang.toFixed(2)} degrees`);
    check('part 2: 0 console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    bridge.kill();
  }
}
done();
