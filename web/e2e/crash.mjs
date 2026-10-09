// P2A.6.2 a recorded SITL flight into a hill shows the crash screen (the logic is unit-tested in src/drone/ground.test.ts).
// e2e/fixtures/hill-flight.json: home Pushkar at 502.8 m MSL, 30 m up, level at about 533 m MSL toward ground that rises
// past that; SITL's own ground is flat, so it never touched the hill. Fed through the app's state path at 4x speed with
// the chase camera (so the terrain under the drone is loaded in detail).
import { readFileSync } from 'node:fs';
import { checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const fx = JSON.parse(readFileSync(new URL('./fixtures/hill-flight.json', import.meta.url), 'utf8'));

const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1000, height: 700 } });
try {
  await settledAt(page, 40_000);
  await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 800), fx.home);
  await page.waitForTimeout(4000);
  await page.evaluate((home) => window.__dw.setHome(home[2]), fx.home);
  let i = 0;
  for (; i < fx.states.length; i++) {
    const crashed = await page.evaluate((s) => {
      window.__dw.feedState(s);
      if (window.__dw.views.view === 'free' && window.__dw.drone.drawn()) window.__dw.views.set('chase');
      return window.__dw.crash() !== null;
    }, fx.states[i]);
    if (crashed) break;
    await page.waitForTimeout(50);
  }
  const crash = await page.evaluate(() => window.__dw.crash());
  const box = await page.evaluate(() => ({ visible: document.getElementById('crash-result').checkVisibility(), text: document.getElementById('crash-result').innerText }));
  const fine = crash && (await page.evaluate(([la, lo]) => window.__dw.globe.groundMsl(la, lo), [crash.lat, crash.lon]));
  const agl = crash && fine !== undefined ? crash.altMsl - fine : NaN;
  console.log(`info  crash at state ${i} of ${fx.states.length}: ${JSON.stringify(crash)}; most detailed ground there ${fine?.toFixed(1)} m`);
  check('P2A.6.2 the recorded flight into the hill shows the crash screen with time, place and speed', Boolean(crash) && box.visible && /Time \d\d:\d\d:\d\d UTC/.test(box.text) && /Place 26\.\d{5}, 74\.\d{5}/.test(box.text) && /Speed [\d.]+ m\/s/.test(box.text), box.text.replace(/\n/g, ' | '));
  check('P2A.6.2 the crash is where the drone meets the real terrain (most detailed ground within 5 m of the drone height)', Math.abs(agl) <= 5, `drone ${crash?.altMsl.toFixed(1)} m MSL, ground ${fine?.toFixed(1)} m: ${agl.toFixed(1)} m`);
  await page.waitForTimeout(500); // the smoother finishes easing onto the crash state
  const before = await page.evaluate(() => window.__dw.drone.drawn());
  await page.evaluate((rest) => rest.forEach((s) => window.__dw.feedState(s)), fx.states.slice(i + 1, i + 30));
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__dw.drone.drawn());
  check('P2A.6.2 the drone stays frozen at the crash', before && after && before.lat === after.lat && before.lon === after.lon && before.alt === after.alt);
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
done();
