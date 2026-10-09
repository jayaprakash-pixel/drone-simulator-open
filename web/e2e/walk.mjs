// P1.6.3 support (the walk-through itself is hands-on): fly to 700 m above each of the seven test places, capture the map with
// the panels hidden into docs/shots/ (git-ignored, regenerate any time) and record objective facts about the data there.
import { mkdirSync } from 'node:fs';
import { cameraRest, checker, open, settledAt, writeSection } from './lib.mjs';

const { check, done } = checker();
const SHOTS = new URL('../../docs/shots/', import.meta.url);
mkdirSync(SHOTS, { recursive: true });
const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 720 } });
try {
  await settledAt(page, 40_000);
  await page.evaluate(() => (window.__dw.globe.topDown = true)); // the walk-through pictures are taken looking straight down
  const places = await page.evaluate(() => window.__dw.places().filter((p) => !p.user));
  const rows = [];
  for (const p of places) {
    await page.evaluate(([lat, lon]) => window.__dw.globe.flyToPlace(lat, lon, 700), [p.lat, p.lon]);
    await cameraRest(page, 25_000);
    await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 40_000 });
    await page.waitForTimeout(800);
    const facts = await page.evaluate(async ([lat, lon]) => ({ msl: await window.__dw.globe.groundMsl(lat, lon), level: window.__dw.terrainLevel(lat, lon) }), [p.lat, p.lon]);
    const slug = p.name.split(' (')[0].toLowerCase().replace(/[^a-z]+/g, '-');
    await page.evaluate(() => (document.getElementById('ui').style.visibility = 'hidden'));
    await page.screenshot({ path: new URL(`${slug}.png`, SHOTS).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
    await page.evaluate(() => (document.getElementById('ui').style.visibility = ''));
    rows.push({ ...p, ...facts, slug });
    console.log(`info  ${p.name}: ground ${facts.msl?.toFixed(0)} m MSL, finest terrain level ${facts.level}, shot ${slug}.png`);
  }
  check('seven places captured with a ground height and a terrain level each', rows.length === 7 && rows.every((r) => r.msl !== undefined && r.level !== undefined));
  check('whole run: 0 console errors', log.errors.length === 0, log.errors.join(' | '));
  // level L has tiles 180/2^L degrees wide with about 64 height points across: spacing = 180/2^L * 111320 / 64 metres
  const spacing = (l) => Math.round(((180 / 2 ** l) * 111_320) / 64);
  writeSection(
    'walkdata',
    `### Facts measured for each place (e2e/walk.mjs, ${new Date().toISOString().slice(0, 10)})

Camera 700 m above the ground, looking straight down; pictures are saved in \`docs/shots/\` (not in git, regenerate with \`npm run e2e:walk\`).

| Place | Ground (m MSL) | Finest terrain level | About this far between terrain height points | Picture |
|---|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.msl.toFixed(0)} | ${r.level} | ${spacing(r.level)} m | docs/shots/${r.slug}.png |`).join('\n')}`,
  );
} finally {
  await browser.close();
}
done();
