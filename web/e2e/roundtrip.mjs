// P1.7.2, automated half: pick-and-unproject round trip. Fly top-down to 500 m above each reference point; around it, take a
// 3x3 grid of ground points (250 m east/west, 120 m north/south: from the screen centre out to near the screen edges, where
// perspective matters). Project each onto the screen at the rendered terrain surface, round to a whole pixel like a real mouse
// click, pick it back with the click handler's own code, and measure the distance to the starting point.
// The other half (clicked coordinates against a trusted map) needs your eyes: see the steps in docs/data-quality.md.
import { cameraRest, checker, open, settledAt, writeSection } from './lib.mjs';
import { POINTS } from './points.mjs';

const { check, done } = checker();
const OFFSETS_E = [-250, 0, 250];
const OFFSETS_N = [-120, 0, 120];
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 720 } });
try {
  await settledAt(page, 40_000);
  await page.evaluate(() => (window.__dw.globe.topDown = true)); // this check is defined looking straight down
  const rows = [];
  for (const p of POINTS) {
    await page.evaluate(([lat, lon]) => window.__dw.globe.flyToPlace(lat, lon, 500), [p.lat, p.lon]);
    await cameraRest(page, 20_000);
    await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 40_000 });
    const errs = [];
    let farthest = 0; // largest distance of a test pixel from the screen centre
    for (const n of OFFSETS_N) {
      for (const e of OFFSETS_E) {
        const lat = p.lat + n / 111_320;
        const lon = p.lon + e / (111_320 * Math.cos((p.lat * Math.PI) / 180));
        const r = await page.evaluate(([la, lo]) => {
          const h = window.__dw.surface(la, lo);
          const px = window.__dw.project(la, lo, h ?? 0);
          const x = Math.round(px[0]);
          const y = Math.round(px[1]);
          return { x, y, picked: window.__dw.pick(x, y) };
        }, [lat, lon]);
        const dN = (r.picked[0] - lat) * 111_320;
        const dE = (r.picked[1] - lon) * 111_320 * Math.cos((lat * Math.PI) / 180);
        errs.push(Math.hypot(dN, dE));
        farthest = Math.max(farthest, Math.hypot(r.x - 640, r.y - 360));
      }
    }
    rows.push({ ...p, worst: Math.max(...errs), mean: errs.reduce((a, b) => a + b, 0) / errs.length, farthest });
  }
  for (const r of rows) check(`P1.7.2 ${r.name}: 9 picks, from the centre out to ${Math.round(r.farthest)} px, all within 1 m`, r.worst < 1, `worst ${r.worst.toFixed(2)} m, mean ${r.mean.toFixed(2)} m`);
  check('the test really covered off-centre pixels (some point at least 400 px from the centre)', rows.every((r) => r.farthest > 400), rows.map((r) => Math.round(r.farthest)).join(', '));
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.join(' | '));
  writeSection(
    'roundtrip',
    `## Click accuracy, automated half (P1.7.2, e2e/roundtrip.mjs)

The camera flies top-down to 500 m above each reference point. Around it, 9 ground points (a 3 by 3 grid, 250 m east/west and 120 m north/south, so from the screen centre out to near the screen edges) are projected to a screen pixel, rounded to a whole pixel (as a real click is) and picked back with the click handler's own code. One pixel is about 0.45 m on the ground at this height. Last run ${new Date().toISOString().slice(0, 10)}.

| Reference point | Worst of 9 (m) | Mean (m) | Farthest pixel from centre |
|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.worst.toFixed(2)} | ${r.mean.toFixed(2)} | ${Math.round(r.farthest)} px |`).join('\n')}

This proves the screen-to-ground maths; it cannot show that the satellite picture is aligned with the real world. That is the hands-on half (compare against a trusted map), described in the next section.`,
  );
} finally {
  await browser.close();
}
done();
