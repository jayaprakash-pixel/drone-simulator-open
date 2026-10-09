// Panoramax street-level pictures (P1.12.5): the open STAC API at api.panoramax.xyz (no key). Read 2026-10-09: search by
// bbox (answers sorted by distance to the box centre), filter field_of_view = 360 for true panoramas; every picture
// carries its own licence ("license", e.g. CC-BY-SA-4.0, plus a licence link) and producer, which go into its credit
// line. Rate limits and attribution wording: NOT FOUND in the API description or docs, so lookups stay few (one or two
// searches per click). Pictures are shown from their URLs; nothing is stored on disk.
import { bboxAround, chooseNearest, PanoError } from './provider';
import type { OnView, Pano, PanoramaProvider } from './provider';

const API = 'https://api.panoramax.xyz/api/search';

type Feature = {
  id: string;
  geometry: { coordinates: [number, number] };
  properties: { datetime?: string; license?: string; 'view:azimuth'?: number; 'geovisio:producer'?: string; 'pers:interior_orientation'?: { field_of_view?: number } };
  assets?: { sd?: { href: string }; hd?: { href: string } };
};
type PannellumViewer = { on(e: string, f: (...a: unknown[]) => void): void; getYaw(): number; destroy(): void };

export function createPanoramaxProvider(fetchFn: typeof fetch = (...a) => fetch(...a)): PanoramaProvider {
  let viewer: PannellumViewer | undefined;
  const urls = new Map<string, string>(); // picture id -> image URL, for open()

  const toPano = (f: Feature): Pano => {
    const p = f.properties;
    const url = f.assets?.sd?.href ?? f.assets?.hd?.href;
    if (url) urls.set(f.id, url);
    return {
      id: f.id,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      capturedAt: p.datetime ? Date.parse(p.datetime) : 0,
      is360: p['pers:interior_orientation']?.field_of_view === 360,
      heading: p['view:azimuth'],
      creator: p['geovisio:producer'],
      attribution: `Panoramax${p['geovisio:producer'] ? ` · ${p['geovisio:producer']}` : ''} · ${p.license ?? 'licence not given'}`,
    };
  };

  async function search(box: [number, number, number, number], only360: boolean, limit: number): Promise<Pano[]> {
    const q = new URLSearchParams({ bbox: box.map((v) => v.toFixed(6)).join(','), limit: String(limit) });
    if (only360) q.set('filter', 'field_of_view = 360');
    let r: Response;
    try {
      r = await fetchFn(`${API}?${q}`);
    } catch {
      throw new PanoError('offline', 'no connection to Panoramax');
    }
    if (r.status === 429) throw new PanoError('rate-limit', 'Panoramax is limiting requests');
    if (!r.ok) throw new PanoError('provider-error', `Panoramax HTTP ${r.status}`);
    const body = (await r.json().catch(() => ({}))) as { features?: Feature[] };
    return (body.features ?? []).map(toPano);
  }

  return {
    name: 'Panoramax',
    attribution: 'Panoramax contributors (licence of each picture shown with it)',
    async findNearest(lat, lon, radius) {
      const box = bboxAround(lat, lon, radius);
      return chooseNearest(await search(box, true, 20), lat, lon, radius) ?? chooseNearest(await search(box, false, 20), lat, lon, radius);
    },
    async countNear(lat, lon, radius) {
      const box = bboxAround(lat, lon, radius);
      const within = (ps: Pano[]) => ps.filter((p) => chooseNearest([p], lat, lon, radius)).length;
      const [panos, all] = [await search(box, true, 100), await search(box, false, 100)];
      return { pano: within(panos), any: within(all), capped: all.length >= 100 };
    },
    async panosIn(box) {
      return (await search(box, true, 500)).map((p) => ({ lat: p.lat, lon: p.lon }));
    },
    async open(container: HTMLElement, pano: Pano, onView: OnView) {
      const url = urls.get(pano.id);
      if (!url) throw new PanoError('viewer', `no picture URL for ${pano.id}`);
      container.replaceChildren();
      if (!pano.is360) {
        // a flat photo: shown as it is, not stretched round a sphere
        const img = document.createElement('img');
        img.className = 'flat-photo';
        img.alt = 'Street-level photo from Panoramax';
        img.src = url;
        container.append(img);
        await img.decode().catch(() => { throw new PanoError('viewer', 'Panoramax picture did not load'); });
        return onView(pano, pano.heading ?? 0);
      }
      await import('pannellum/build/pannellum.js'); // sets window.pannellum
      await import('pannellum/build/pannellum.css');
      const lib = (window as unknown as { pannellum: { viewer(el: HTMLElement, cfg: object): PannellumViewer } }).pannellum;
      const heading = pano.heading ?? 0;
      await new Promise<void>((resolve, reject) => {
        viewer = lib.viewer(container, { type: 'equirectangular', panorama: url, autoLoad: true, crossOrigin: 'anonymous', northOffset: heading, compass: pano.heading !== undefined, showFullscreenCtrl: false, showZoomCtrl: false });
        viewer.on('load', () => resolve());
        viewer.on('error', (msg: unknown) => reject(new PanoError('viewer', `Pannellum: ${String(msg)}`)));
      });
      const report = (): void => onView(pano, (((heading + (viewer?.getYaw() ?? 0)) % 360) + 360) % 360);
      viewer?.on('animatefinished', report);
      viewer?.on('mouseup', report);
      report();
    },
    close() {
      viewer?.destroy();
      viewer = undefined;
    },
  };
}
