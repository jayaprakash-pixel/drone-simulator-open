// P1.12.5 Panoramax live: a true 360 picture near Rennes (asked from Panoramax's own API first), fly there, click,
// Enter place (360): the viewer opens it and shows provider, producer and licence; nothing is downloaded or stored.
// Then the default (Mapillary + Panoramax combined) also opens a true 360 at the same point.
import { cameraRest, checker, clickAt, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const api = await (await fetch('https://api.panoramax.xyz/api/search?bbox=-1.70,48.10,-1.66,48.12&limit=1&filter=field_of_view%20%3D%20360')).json();
const f = api.features?.[0];
if (!f) throw new Error('Panoramax returned no 360 picture near Rennes');
const [lon, lat] = f.geometry.coordinates;
console.log(`info  Panoramax 360 ${f.id} at ${lat}, ${lon}: ${f.properties['geovisio:producer']}, ${f.properties.license}`);

async function enter(search) {
  const { browser, page, log } = await open(search, { viewport: { width: 1280, height: 800 } });
  let downloads = 0;
  page.on('download', () => downloads++);
  try {
    await settledAt(page, 40_000);
    await page.evaluate(([la, lo]) => void window.__dw.globe.flyToPlace(la, lo, 300), [lat, lon]);
    await cameraRest(page, 25_000);
    await clickAt(page);
    await page.waitForSelector('#side:not(.hidden)', { timeout: 5000 });
    await page.click('#enter-place');
    await page.waitForFunction(() => window.__dw.pano.isOpen() || document.getElementById('pano-none'), null, { timeout: 45_000 });
    await page.waitForFunction(() => !document.getElementById('pano-loading') || document.getElementById('pano-loading').classList.contains('hidden') || window.__dw.pano.isOpen(), null, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => ({ open: window.__dw.pano.isOpen(), info: document.getElementById('pano-info')?.textContent ?? '', attrib: document.getElementById('pano-attrib')?.textContent ?? '', attribVisible: document.getElementById('pano-attrib')?.checkVisibility() ?? false, none: document.getElementById('pano-none')?.textContent ?? '' }));
    return { ...r, downloads, errors: log.errors.filter((e) => !/Failed to load resource/.test(e)) };
  } finally {
    await browser.close();
  }
}

const solo = await enter('?e2e=1&pano=panoramax');
console.log(`info  Panoramax alone: ${JSON.stringify(solo)}`);
check('P1.12.5 live at a place with coverage: Enter place (360) opens the Panoramax 360', solo.open && /360/.test(solo.info), solo.info || solo.none);
check('P1.12.5 the viewer shows provider, producer and licence', solo.attribVisible && /^Panoramax · .+ · CC-BY-SA-4\.0$/.test(solo.attrib), solo.attrib);
check('P1.12.5 no image stored on disk (no download) and no console errors', solo.downloads === 0 && solo.errors.length === 0, `${solo.downloads} downloads; ${solo.errors.slice(0, 2).join(' | ')}`);
const both = await enter('?e2e=1');
console.log(`info  combined: ${JSON.stringify(both)}`);
check('P1.12.5 the default (Mapillary + Panoramax) opens a true 360 here too, with its credit', both.open && /360/.test(both.info) && both.attribVisible && both.attrib.length > 0, `${both.info} | ${both.attrib}`);
done();
