import { OsmCountError, countBuildings } from '../globe/osmcount';
import type { Globe } from '../globe/viewer';
import { PanoError } from '../panorama/provider';
import type { PanoramaProvider } from '../panorama/provider';
import { settings } from './settings';

const BUILDINGS_HALF_M = 250; // building count box: +-250 m
const PHOTOS_M = 500; // Mapillary refuses bigger boxes in dense places
const SETTLE_MS = 600; // network lookups start only when the click has settled: quick clicking sends nothing
const SLOW_MS = 4000;

const BUILDING_FAIL: Record<string, string> = {
  offline: 'Buildings: the count needs the internet (no connection to OpenStreetMap Overpass).',
  'rate-limit': 'Buildings: OpenStreetMap Overpass is limiting requests right now; click again in a minute.',
  busy: 'Buildings: OpenStreetMap Overpass is busy and did not answer; click again later.',
  error: 'Buildings: OpenStreetMap Overpass gave an answer this app cannot read.',
};
const PHOTO_FAIL: Record<string, string> = {
  'no-token': 'Street-level photos: needs a free Mapillary token (Settings).',
  'bad-token': 'Street-level photos: Mapillary rejected the token (Settings).',
  'rate-limit': 'Street-level photos: Mapillary is limiting requests right now; click again in a minute.',
  offline: 'Street-level photos: the check needs the internet (no connection to Mapillary).',
  'provider-error': 'Street-level photos: Mapillary did not answer properly.',
  viewer: 'Street-level photos: Mapillary did not answer properly.',
};

/**
 * "What is here?" for a clicked point, in plain words: imagery source and its finest detail, OpenStreetMap buildings
 * nearby, street-level photos within 500 m, terrain detail. Terrain and the imagery source are read locally at once;
 * the imagery detail (up to five small tile requests), the building count (one Overpass count query) and the photo count
 * (two Mapillary box queries) start once the click has settled for 0.6 s, each line filling in on its own. A newer click
 * replaces older lookups; a lookup still running after 4 s says so.
 */
export function mountWhatIsHere(globe: Globe, provider: PanoramaProvider): (lat: number, lon: number, box: HTMLElement) => void {
  let seq = 0;
  let abort: AbortController | undefined;

  return (lat, lon, box) => {
    const mine = ++seq;
    abort?.abort();
    abort = new AbortController();
    const { signal } = abort;
    box.innerHTML = '<b>What is here?</b><ul class="list wih"><li id="wih-imagery"></li><li id="wih-buildings"></li><li id="wih-photos"></li><li id="wih-terrain"></li></ul>';
    const line = (id: string, text: string, state: 'ok' | 'wait' | 'fail' = 'ok'): void => {
      if (mine !== seq) return; // a newer click owns the panel
      const li = box.querySelector<HTMLElement>(`#${id}`);
      if (li) {
        li.textContent = text;
        li.dataset.state = state;
      }
    };
    const t = globe.terrainDetail(lat, lon);
    line('wih-terrain', t ? `Terrain: detail level ${t.level} here, height points about ${t.spacingM} m apart.` : 'Terrain: none (flat globe: real terrain needs a Cesium ion token).');
    const source = globe.imagerySource(settings.layer);
    line('wih-imagery', `Imagery: ${source}.`, 'wait');
    line('wih-buildings', 'Buildings: checking OpenStreetMap…', 'wait');
    line('wih-photos', 'Street-level photos: checking Mapillary…', 'wait');

    const run = (id: string, work: () => Promise<string>, fail: (e: unknown) => string, waitText: string): void => {
      const slow = setTimeout(() => {
        if (box.querySelector<HTMLElement>(`#${id}`)?.dataset.state === 'wait') line(id, `${waitText} still checking (slow answer)…`, 'wait');
      }, SLOW_MS);
      work().then(
        (text) => line(id, text),
        (e) => {
          if ((e as Error)?.name !== 'AbortError') line(id, fail(e), 'fail');
        },
      ).finally(() => clearTimeout(slow));
    };

    setTimeout(() => {
      if (mine !== seq) return;
      run(
        'wih-imagery',
        async () => {
          if (settings.layer !== 'satellite' || !globe.hasToken) return `Imagery: ${source}.`;
          const f = await globe.finestImagery(lat, lon);
          return f
            ? `Imagery: ${source}. Finest detail here: level ${f.level}, about ${f.cmPerPixel} cm per pixel${f.cmPerPixel > 30 ? ', soft below about 60 m' : ''}.`
            : `Imagery: ${source}. Finest detail here is coarser than level 17 (over about 1 m per pixel).`;
        },
        () => `Imagery: ${source}. Its detail here could not be checked (no connection, or the imagery service did not answer).`,
        'Imagery:',
      );
      run(
        'wih-buildings',
        async () => {
          const c = await countBuildings(lat, lon, BUILDINGS_HALF_M, signal);
          if (c.buildings === 0) return 'Buildings: none mapped in OpenStreetMap within 250 m.';
          return `Buildings: ${c.buildings} mapped in OpenStreetMap within 250 m, ${c.tagged === 0 ? 'none' : c.tagged} with a height or levels tag. A visual aid only, never obstacle data.`;
        },
        (e) => BUILDING_FAIL[e instanceof OsmCountError ? e.kind : 'error'],
        'Buildings:',
      );
      run(
        'wih-photos',
        async () => {
          if (!provider.countNear) return `Street-level photos: ${provider.name} cannot count photos.`;
          const c = await provider.countNear(lat, lon, PHOTOS_M);
          if (c.any === 0) return `Street-level photos: none within 500 m (${provider.name}).`;
          return `Street-level photos within 500 m (${provider.name}): ${c.pano === 0 ? 'no true 360' : `${c.pano} true 360`}, ${c.any}${c.capped ? '+' : ''} in all.`;
        },
        (e) => PHOTO_FAIL[e instanceof PanoError ? e.kind : 'provider-error'],
        'Street-level photos:',
      );
    }, SETTLE_MS);
  };
}
