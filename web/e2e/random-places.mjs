// P1.12.2 random places: 30 Natural Earth populated places (fixed seed, 5 per continent; scripts/ne-places.mjs). For each,
// one browser, one place at a time: fly there, click the centre, wait for What is here?, press Enter place (360) and
// record the result (360 opened, 360 within 1 km, flat photo, nothing within 1 km, error), the time and console errors.
// Resumable: results go to data/random-places.json as they come; FROM and COUNT pick a batch. When all 30 are in, the
// table and the seed are written to docs/world-coverage.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { places, sample } from '../../scripts/ne-places.mjs';
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const SEED = 20261009;
const OUT = new URL('../../data/random-places.json', import.meta.url);
const DOC = new URL('../../docs/world-coverage.md', import.meta.url);
const picks = sample(await places(), SEED);
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const FROM = Number(process.env.FROM ?? 0), COUNT = Number(process.env.COUNT ?? 30);
const HANDLED = /overpass-api\.de|graph\.mapillary\.com|virtualearth\.net|api\.cesium\.com|assets\.ion\.cesium\.com/;
const errorsOf = (log) => log.errors.filter((e) => !(e.startsWith('console: Failed to load resource') && HANDLED.test(e)));

const { browser, page, log } = await open('?e2e=1', { viewport: { width: 1280, height: 800 } });
try {
  await settledAt(page, 40_000);
  for (const p of picks.slice(FROM, FROM + COUNT)) {
    if (results[p.id]) continue;
    const e0 = log.errors.length;
    const t0 = Date.now();
    await page.evaluate(() => { window.__dw.pano.close(); document.getElementById('side-close')?.click(); });
    await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 1000), [p.lat, p.lon]);
    await cameraRest(page, 25_000);
    await page.waitForFunction(() => window.__dw.settled(), null, { timeout: 30_000 }).catch(() => {});
    await clickAt(page);
    const side = await page.waitForSelector('#side:not(.hidden)', { timeout: 5000 }).then(() => true, () => false);
    // What is here? (all four lines answered)
    const wih = await page.waitForFunction(() => ['imagery', 'buildings', 'photos', 'terrain'].every((k) => { const li = document.querySelector(`#wih-${k}`); return li && li.dataset.state !== 'wait'; }), null, { timeout: 40_000 }).then(() => true, () => false);
    const wihText = await page.evaluate(() => ['imagery', 'buildings', 'photos', 'terrain'].map((k) => document.querySelector(`#wih-${k}`)?.textContent ?? '').join(' | '));
    // Enter place (360)
    const t1 = Date.now();
    let result = 'error', message = '';
    if (side) {
      await page.click('#enter-place');
      await page.waitForFunction(() => window.__dw.pano.isOpen() || document.getElementById('pano-none') || document.querySelector('#notices [id^="pano-"]'), null, { timeout: 45_000 }).catch(() => {});
      const r = await page.evaluate(() => ({ open: window.__dw.pano.isOpen(), none: document.getElementById('pano-none')?.textContent ?? null, notice: document.querySelector('#notices [id^="pano-"]')?.textContent ?? null }));
      if (r.open) result = '360 opened';
      else if (r.none) {
        message = r.none;
        result = /^No street-level images within/.test(r.none) ? 'nothing within 1 km' : /flat photo/.test(r.none) ? 'flat photo' : /360/.test(r.none) ? '360 within 1 km' : 'flat photo';
      } else if (r.notice) message = r.notice;
      else message = 'no answer within 45 s';
    } else message = 'the click did not open the point panel';
    const errs = errorsOf({ errors: log.errors.slice(e0) });
    results[p.id] = { ...p, result, message, whatIsHere: wih ? wihText : `not finished: ${wihText}`, lookupMs: Date.now() - t1, totalMs: Date.now() - t0, consoleErrors: errs.length, firstError: errs[0] ?? '' };
    writeFileSync(OUT, JSON.stringify(results, null, 1) + '\n');
    console.log(`info  ${p.name} (${p.country}): ${result}${message ? ` - ${message.slice(0, 90)}` : ''}; ${((Date.now() - t1) / 1000).toFixed(1)} s; console errors ${errs.length}`);
    await page.evaluate(() => window.__dw.pano.close());
  }
} finally {
  await browser.close();
}

const rows = picks.map((p) => results[p.id]).filter(Boolean);
const uncaught = rows.reduce((n, r) => n + (r.firstError.startsWith('pageerror') ? 1 : 0), 0) + log.errors.filter((e) => e.startsWith('pageerror')).length;
check(`P1.12.2 run so far: ${rows.length} of ${picks.length} places done, 0 uncaught exceptions`, uncaught === 0, `${uncaught} uncaught`);
check('P1.12.2 every failure shows its own message', rows.filter((r) => r.result === 'error').every((r) => r.message), rows.filter((r) => r.result === 'error' && !r.message).map((r) => r.name).join(', '));
if (rows.length === picks.length) {
  const count = (k) => rows.filter((r) => r.result === k).length;
  const table = `<!-- random:start -->
## 30 random places (P1.12.2, \`node web/e2e/random-places.mjs\`, ${new Date().toISOString().slice(0, 10)})
Natural Earth populated places (public domain), seed **${SEED}**, 5 drawn per continent (scripts/ne-places.mjs); one browser, one place at a time, the app's own Enter place (360) and What is here?. Results: 360 opened at the point ${count('360 opened')}, a 360 within 1 km ${count('360 within 1 km')}, flat photos only ${count('flat photo')}, nothing within 1 km ${count('nothing within 1 km')}, errors ${count('error')}. Cached in data/random-places.json.

| Place | Country | Continent | Enter place (360) | Lookup time | Console errors | What is here? (photos line) |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.country} | ${r.continent} | ${r.result}${r.result === 'error' ? `: ${r.message.replace(/\|/g, '/')}` : ''} | ${(r.lookupMs / 1000).toFixed(1)} s | ${r.consoleErrors} | ${(r.whatIsHere.split(' | ')[2] ?? '').replace(/\|/g, '/')} |`).join('\n')}
<!-- random:end -->`;
  let doc = readFileSync(DOC, 'utf8');
  doc = /<!-- random:start -->[\s\S]*?<!-- random:end -->/.test(doc) ? doc.replace(/<!-- random:start -->[\s\S]*?<!-- random:end -->/, () => table) : `${doc.trimEnd()}\n\n${table}\n`;
  writeFileSync(DOC, doc);
  console.log('info  table written to docs/world-coverage.md');
}
done();
