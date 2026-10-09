// P1.8.2 tilted camera and its controls, P1.8.3 Stand here, P1.8.4 the 3D buildings toggle. Needs the Cesium ion token in
// the build. One page load in a small window and a handful of flights keep Cesium ion traffic small; place search is
// answered by a canned Nominatim reply, so the public server is not used.
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const W = 960;
const H = 600;
const JAIPUR = [26.9124, 75.7873];
const NOMINATIM = [
  { display_name: 'Jaisalmer, Jaisalmer Tehsil, Jaisalmer District, Rajasthan, India', lat: '26.9157', lon: '70.9083', boundingbox: ['26.7557', '27.0757', '70.7483', '71.0683'], osm_type: 'node', category: 'place', type: 'city' },
];

// metres between lat/lon(/height) points: haversine on the ground, straight line through WGS84 Earth-centred coordinates in 3D
const R = Math.PI / 180;
const ground = (a, b) => 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.sin(((b[0] - a[0]) * R) / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(((b[1] - a[1]) * R) / 2) ** 2));
const ecef = (lat, lon, h) => {
  const s = Math.sin(lat * R);
  const n = 6_378_137 / Math.sqrt(1 - 6.69437999014e-3 * s * s);
  return [(n + h) * Math.cos(lat * R) * Math.cos(lon * R), (n + h) * Math.cos(lat * R) * Math.sin(lon * R), (n * (1 - 6.69437999014e-3) + h) * s];
};
const space = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

const { browser, page, log } = await open('?e2e=1', {
  viewport: { width: W, height: H },
  setup: (context) => context.route(/nominatim\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(NOMINATIM) })),
});
try {
  await settledAt(page, 40_000);
  const settled = (timeout = 30_000) => page.waitForFunction(() => window.__dw.settled(), null, { timeout }).catch(() => console.log('info  tiles still loading, measuring anyway'));
  const cam = () =>
    page.evaluate(() => {
      const c = window.__dw.viewer.camera;
      const p = c.positionCartographic;
      const d = 180 / Math.PI;
      return { lat: p.latitude * d, lon: p.longitude * d, h: p.height, heading: c.heading * d, pitch: c.pitch * d, roll: c.roll * d, agl: window.__dw.aboveTerrain() };
    });
  const centre = () => page.evaluate(([x, y]) => window.__dw.pick(x, y), [W / 2, H / 2]);
  const surface = (p) => page.evaluate(([la, lo]) => window.__dw.surface(la, lo), p);
  const frames = () => page.evaluate(() => window.__frames);
  await page.evaluate(() => {
    window.__frames = 0;
    window.__dw.viewer.scene.postRender.addEventListener(() => window.__frames++);
  });

  // ---- P1.8.2 controls
  const flags = await page.evaluate(() => { const s = window.__dw.viewer.scene.screenSpaceCameraController; return { minZoom: s.minimumZoomDistance, collision: s.enableCollisionDetection, tilt: s.enableTilt }; });
  check('P1.8.2 minimumZoomDistance = 2 m, collision detection on, tilt enabled', flags.minZoom === 2 && flags.collision && flags.tilt, JSON.stringify(flags));
  const hint = await page.locator('#gesture-hint').innerText();
  check('P1.8.2 the gesture hint is visible and names the tilt gesture', (await page.locator('#gesture-hint').isVisible()) && /Ctrl\+drag/.test(hint) && /tilt/.test(hint), hint);
  const tools = ['#reset-north', '#turn-left', '#turn-right', '#tilt-up', '#tilt-down', '#top-down'];
  check('P1.8.2 Reset north, Turn, Tilt and Top-down controls are on screen', (await Promise.all(tools.map((t) => page.locator(t).isVisible()))).every(Boolean));
  check('P1.8.2 the Fly to Rajasthan demo button is gone', (await page.locator('#fly-rajasthan').count()) === 0);

  // a fly-to must rest tilted, looking at its target from about 1 km, above the terrain
  async function restsTilted(label, target) {
    await cameraRest(page, 20_000);
    await settled();
    const c = await cam();
    const at = await centre();
    const th = await surface(target);
    const off = at ? ground(at, target) : Infinity;
    const range = th === undefined ? NaN : space(ecef(c.lat, c.lon, c.h), ecef(target[0], target[1], th));
    check(
      `P1.8.2 ${label} rests tilted (pitch -35 to -45) looking at the target (screen centre within 50 m) from 0.8-1.2 km, above the terrain`,
      c.pitch >= -45 && c.pitch <= -35 && off < 50 && range >= 800 && range <= 1200 && c.agl >= 2,
      `pitch ${c.pitch.toFixed(1)}, centre ${off.toFixed(1)} m from target, ${range.toFixed(0)} m away, ${c.agl?.toFixed(0)} m above terrain`,
    );
  }
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), JAIPUR);
  await restsTilted('globe.flyToPlace (Jaipur)', JAIPUR);
  await page.click('#places-toggle');
  await page.locator('#places-list li button', { hasText: 'Pushkar' }).first().click();
  await restsTilted('the saved place Pushkar', [26.4897, 74.5511]);
  await page.click('#places-toggle');
  await page.fill('#search', 'Jaisalmer');
  await page.press('#search', 'Enter');
  await page.locator('#search-results li button', { hasText: '· city' }).first().click();
  await restsTilted('a search result (Jaisalmer, city)', [26.9157, 70.9083]);

  // Top-down: the toggle turns the view straight down around the screen centre, and fly-tos then end straight down
  const c0 = await centre();
  await page.check('#top-down');
  await page.waitForTimeout(1500);
  let c = await cam();
  let c1 = await centre();
  check('P1.8.2 Top-down on: straight down (pitch -90 +/- 1) over the same point (< 5 m)', Math.abs(c.pitch + 90) <= 1 && ground(c0, c1) < 5, `pitch ${c.pitch.toFixed(1)}, centre moved ${ground(c0, c1).toFixed(2)} m`);
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), JAIPUR);
  await cameraRest(page, 20_000);
  c = await cam();
  check('P1.8.2 with Top-down on, a fly-to ends straight down (pitch -90 +/- 1)', Math.abs(c.pitch + 90) <= 1, `pitch ${c.pitch.toFixed(1)}`);
  await settled();
  await page.uncheck('#top-down');
  await page.waitForTimeout(1500);
  c = await cam();
  check('P1.8.2 Top-down off: back to the tilted view (pitch -40 +/- 1)', Math.abs(c.pitch + 40) <= 1, `pitch ${c.pitch.toFixed(1)}`);
  await settled();

  // Tilt and Turn buttons: one step each, turning around the point at the screen centre
  for (const [id, what, step] of [['#tilt-up', 'pitch', 10], ['#tilt-down', 'pitch', -10], ['#turn-right', 'heading', 15], ['#turn-left', 'heading', -15]]) {
    const before = await cam();
    const p0 = await centre();
    await page.click(id);
    await page.waitForTimeout(1200);
    const after = await cam();
    const p1 = await centre();
    const moved = angle(after[what], before[what] + step);
    check(`P1.8.2 ${id} changes ${what} by ${step} deg (+/- 1) around the screen centre (< 5 m)`, moved <= 1 && ground(p0, p1) < 5, `${what} ${before[what].toFixed(1)} -> ${after[what].toFixed(1)}, centre moved ${ground(p0, p1).toFixed(2)} m`);
  }
  await page.click('#turn-right');
  await page.waitForTimeout(1200);
  await page.click('#reset-north');
  await page.waitForTimeout(300);
  c = await cam();
  check('P1.8.2 Reset north sets heading 0 (+/- 0.5)', angle(c.heading, 0) <= 0.5, `heading ${c.heading.toFixed(2)}`);
  await page.evaluate(() => { const v = window.__dw.viewer; v.camera.setView({ orientation: { heading: (359.7 * Math.PI) / 180, pitch: v.camera.pitch, roll: 0 } }); v.scene.requestRender(); });
  await page.waitForTimeout(500);
  const readout = await page.locator('#camera-readout').innerText();
  check('P1.8.2 a heading of 359.7 deg reads 0, never 360', /heading 0°/.test(readout) && !/360°/.test(readout), readout);

  // never below the terrain in the hills: after the fly-to and after every tilt step towards the horizon
  for (const [name, target] of [['Mount Abu', [24.5926, 72.7156]], ['Spiti Valley', [32.2276, 78.0719]]]) {
    await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), target);
    await cameraRest(page, 25_000);
    await settled();
    const agls = [(await cam()).agl];
    for (let i = 0; i < 3; i++) {
      await page.click('#tilt-up');
      await page.waitForTimeout(1200);
      agls.push((await cam()).agl);
    }
    check(`P1.8.2 ${name}: the camera stays >= 2 m above the terrain after the fly-to and 3 tilt steps`, agls.every((a) => a !== undefined && a >= 2), agls.map((a) => `${a?.toFixed(0)} m`).join(', '));
  }

  // ---- P1.8.4 the 3D buildings toggle (on by default)
  const bShow = () => page.evaluate(() => window.__dw.globe.buildings()?.show ?? null);
  check('P1.8.4 3D buildings: toggle on by default and the OSM Buildings tileset is shown', (await page.locator('#buildings-toggle').isChecked()) && (await bShow()) === true, `tileset show = ${await bShow()}`);
  await page.uncheck('#buildings-toggle');
  const off = await bShow();
  await page.check('#buildings-toggle');
  await page.waitForTimeout(300);
  check('P1.8.4 the toggle hides and shows the tileset', off === false && (await bShow()) === true, `off -> ${off}, on -> ${await bShow()}`);

  // ---- P1.8.3 Stand here, in Jaipur; walking speed is measured on bare terrain (buildings off), walls and roofs after
  await page.uncheck('#buildings-toggle');
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), JAIPUR);
  await cameraRest(page, 25_000);
  await settled();
  const view0 = await cam();
  await clickAt(page);
  await page.waitForSelector('#side:not(.hidden)');
  await page.click('#stand-here');
  await page.waitForFunction(() => document.body.classList.contains('standing'), null, { timeout: 10_000 });
  await settled(40_000);
  c = await cam();
  const note = (await page.locator('#standing').innerText().catch(() => '')) ?? '';
  check('P1.8.3 Stand here: eye 1.7 +/- 0.3 m above the drawn terrain, level (pitch 0 +/- 1, roll 0)', Math.abs(c.agl - 1.7) <= 0.3 && Math.abs(c.pitch) <= 1 && angle(c.roll, 0) < 0.1, `${c.agl?.toFixed(2)} m above terrain, pitch ${c.pitch.toFixed(2)}, roll ${c.roll.toFixed(2)}`);
  check('P1.8.3 the plain notice says it is a 3D model, not a photograph', /not a photograph/.test(note) && /3D model/.test(note), note.slice(0, 120));
  // the readout repaints 150 ms after the frames that moved the camera (readouts.ts), so give it a moment
  await page.waitForFunction(() => /Camera 1\.\d m AGL/.test(document.querySelector('#camera-readout')?.textContent ?? ''), null, { timeout: 2000 }).catch(() => {});
  check('P1.8.3 the camera readout shows the eye height with its type (m AGL)', /Camera 1\.\d m AGL/.test(await page.locator('#camera-readout').innerText()), await page.locator('#camera-readout').innerText());
  check('P1.8.3 the orbit tools give way while standing', !(await page.locator('#camera-tools').isVisible()) && (await page.locator('#stand-exit').isVisible()));

  // look around: drag 100 px to the right turns the view 20 degrees to the left (the scene follows the mouse)
  const h0 = c.heading;
  // drag over open globe on the left: the right-hand column (selected point, controls) is tall at 960x600
  await page.mouse.move(230, 380);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(230 + i * 10, 380);
  await page.mouse.up();
  c = await cam();
  check('P1.8.3 dragging looks around: 100 px turns the heading 20 deg (+/- 3), horizon still level', Math.abs(angle(c.heading, h0) - 20) <= 3 && angle(c.roll, 0) < 0.1, `heading ${h0.toFixed(1)} -> ${c.heading.toFixed(1)}`);

  // walk: W for 2 s at 1.4 m/s, then Shift+W for 2 s at 5 m/s, staying 1.7 m above the terrain
  for (const [label, keys, want, tol] of [['W', ['w'], 2.8, 0.7], ['Shift+W', ['Shift', 'w'], 10, 2.5]]) {
    const p0 = await cam();
    const f0 = await frames();
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(2000);
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
    const p1 = await cam();
    const walked = ground([p0.lat, p0.lon], [p1.lat, p1.lon]);
    const drawn = (await frames()) - f0;
    check(`P1.8.3 holding ${label} for 2 s walks ${want} m (+/- ${tol}) and keeps the eye 1.7 +/- 0.3 m above the terrain`, Math.abs(walked - want) <= tol && Math.abs(p1.agl - 1.7) <= 0.3, `${walked.toFixed(2)} m, eye ${p1.agl?.toFixed(2)} m above terrain`);
    check(`P1.8.3 frames are drawn while walking (${label})`, drawn >= 30, `${drawn} frames in 2 s`);
  }

  // a wall stops the walk: a 10 m tall test wall 6 m ahead, then 3 s of running at it (15 m if nothing were there)
  const w0 = await cam();
  await page.evaluate(([la, lo]) => window.__dw.wall(la + 6 / 111_320, lo), [w0.lat, w0.lon]);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  const w1 = await cam();
  const ran = ground([w0.lat, w0.lon], [w1.lat, w1.lon]);
  check('P1.8.3 a wall stops the walk: 3 s of running at a wall 6 m ahead ends in front of it, eye still 1.7 m above the terrain', ran > 3 && ran < 5 && Math.abs(w1.agl - 1.7) <= 0.3, `ran ${ran.toFixed(2)} m (wall face at 5 m), eye ${w1.agl?.toFixed(2)} m above terrain`);
  await page.evaluate(() => window.__dw.wall());
  await settled();
  await page.waitForTimeout(800);
  // a render loop draws frames in every window; the check passes on the first settled 2 s window with at most 3 frames
  // (up to 5 windows) and prints why each other window drew. In the full chain only, Cesium sometimes draws 9-54 frames
  // in a window with 0 app requestRender calls, 0 tile loads, 0 requests in flight and a still camera (2026-10-09;
  // cause inside Cesium NOT FOUND); a single such window is not a render loop.
  const windows = [];
  let verdict = null;
  for (let i = 0; i < 5 && verdict === null; i++) {
    await settled();
    // what happens during the window: tile loads, camera motion, the drone's pose (diagnostics for a failure)
    await page.evaluate(() => {
      const { viewer, drone } = window.__dw;
      const d = (window.__diag = { tileEvents: 0, h0: viewer.camera.heading, p0: viewer.camera.pitch, cam0: viewer.camera.positionWC.clone(), drone: drone.drawn() !== null, req: 0, stacks: {}, bld: 0 });
      d.off = viewer.scene.globe.tileLoadProgressEvent.addEventListener(() => d.tileEvents++);
      const b = window.__dw.globe.buildings?.();
      d.offB = b ? b.tileLoad.addEventListener(() => d.bld++) : () => {};
      const orig = viewer.scene.requestRender.bind(viewer.scene);
      d.restore = () => (viewer.scene.requestRender = orig);
      viewer.scene.requestRender = () => {
        d.req++;
        const top = (new Error().stack ?? '').split(String.fromCharCode(10)).slice(2, 4).map((l) => l.trim().replace(/https?:\/\/[^/]+\//, '')).join(' < ');
        d.stacks[top] = (d.stacks[top] ?? 0) + 1;
        return orig();
      };
      d.clock = viewer.clock.shouldAnimate;
      d.req0 = window.__dw.activeRequests();
      d.reqMax = d.req0;
      d.poll = setInterval(() => (d.reqMax = Math.max(d.reqMax, window.__dw.activeRequests())), 50);
    });
    const f1 = await frames();
    await page.waitForTimeout(2000);
    const n = (await frames()) - f1;
    const still = await page.evaluate(() => window.__dw.settled());
    const diag = await page.evaluate(() => {
      const d = window.__diag;
      d.off();
      d.offB();
      d.restore();
      clearInterval(d.poll);
      const c = window.__dw.viewer.camera.positionWC;
      const top = Object.entries(d.stacks).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${v}x ${k}`).join(' | ');
      return `tile events ${d.tileEvents}, building tiles ${d.bld}, camera moved ${Math.hypot(c.x - d.cam0.x, c.y - d.cam0.y, c.z - d.cam0.z).toFixed(3)} m and turned ${(((window.__dw.viewer.camera.heading - d.h0) * 180) / Math.PI).toFixed(4)} / ${(((window.__dw.viewer.camera.pitch - d.p0) * 180) / Math.PI).toFixed(4)} deg, drone shown ${d.drone}, stand ${window.__dw.stand.isActive()}, clock animating ${d.clock}, Cesium requests in flight ${d.req0} at start, up to ${d.reqMax}, ${window.__dw.activeRequests()} at end, app requestRender calls ${d.req}${top ? ': ' + top : ''}`;
    });
    windows.push(`${n}${still ? '' : ' (tiles loading)'} [${diag}]`);
    if (still && n <= 3) verdict = true; // idle: done
  }
  verdict ??= false; // every settled window drew frames: something keeps rendering
  check('P1.8.3 standing still afterwards, the globe goes idle (<= 3 frames in a 2 s window that starts and ends settled)', verdict === true, `${windows.join(', ')} frames`);

  // Esc returns to the view before Stand here
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  c = await cam();
  const back = space(ecef(c.lat, c.lon, c.h), ecef(view0.lat, view0.lon, view0.h));
  check('P1.8.3 Esc restores the previous view (< 1 m, < 0.5 deg) and clears the notice', back < 1 && angle(c.heading, view0.heading) < 0.5 && angle(c.pitch, view0.pitch) < 0.5 && !(await page.locator('#standing').count()) && !(await page.evaluate(() => document.body.classList.contains('standing'))), `${back.toFixed(3)} m, heading ${c.heading.toFixed(2)} vs ${view0.heading.toFixed(2)}, pitch ${c.pitch.toFixed(2)} vs ${view0.pitch.toFixed(2)}`);
  check('P1.8.3 after Esc the globe gestures and collision detection are back', await page.evaluate(() => { const s = window.__dw.viewer.scene.screenSpaceCameraController; return s.enableInputs && s.enableCollisionDetection; }));

  // a click on a building stands you on its roof (inside the box you would only see walls): an OpenStreetMap building
  // 10 m north of the owner's screenshot spot
  const ROOF = [19.906934, 83.16979];
  await page.check('#buildings-toggle');
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), ROOF);
  await cameraRest(page, 25_000);
  await settled();
  const top = await page.evaluate(([la, lo]) => window.__dw.topAt(la, lo), ROOF);
  const terrainH = await surface(ROOF);
  await clickAt(page);
  await page.click('#stand-here');
  await page.waitForFunction(() => document.body.classList.contains('standing'), null, { timeout: 10_000 });
  await settled();
  c = await cam();
  check('P1.8.3 clicking a building stands you on its roof: eye 1.7 +/- 0.3 m above the roof, which is over 2 m above the terrain', top - terrainH > 2 && Math.abs(c.h - (top + 1.7)) <= 0.3, `roof ${(top - terrainH).toFixed(2)} m above the terrain, eye ${(c.h - top).toFixed(2)} m above the roof`);
  await page.keyboard.press('Escape');

  check('whole run: 0 console errors, 0 bad responses', log.errors.length === 0 && log.bad.length === 0, [...log.errors, ...log.bad].join(' | '));
} finally {
  await browser.close();
}
done();
