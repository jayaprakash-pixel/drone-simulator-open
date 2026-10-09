// KartaView street-level photos (P1.12.5), added because the survey found KartaView photos at 2 of 39 sampled places
// where neither Mapillary nor Panoramax had any (docs/world-coverage-survey.md). Measured 2026-10-09: its nearby-photos
// API timed out ("Query timeout. Narrow your filter") for 500 m even in Bucharest but answers 100 m, so searches are
// capped at 100 m; it allows about 100 requests an hour without a token (your earlier notes; its terms page could not be
// read today), so each point is asked once and the coverage layer does not use it. Which "projection" value marks a 360
// was NOT FOUND, so every KartaView image is shown as a flat photo. Credit (your notes): (c) Grab and KartaView
// Contributors, CC BY-SA 4.0. Nothing is stored on disk.
import { chooseNearest, PanoError } from './provider';
import type { Found, OnView, Pano, PanoramaProvider } from './provider';

const API = 'https://api.openstreetcam.org/2.0/photo/';
export const KV_MAX_M = 100;
const ATTRIB = '© Grab and KartaView Contributors, CC BY-SA 4.0';

type Photo = { id: string; lat: string; lng: string; heading?: string; shotDate?: string; fileurlProc?: string };

export function createKartaViewProvider(fetchFn: typeof fetch = (...a) => fetch(...a), timeoutMs = 8000): PanoramaProvider {
  const urls = new Map<string, string>();
  const asked = new Map<string, Promise<Pano[]>>(); // one request per point: the 100 m and 1 km lookups share it

  async function near(lat: number, lon: number): Promise<Pano[]> {
    let r: Response;
    try {
      r = await fetchFn(`${API}?lat=${lat.toFixed(6)}&lng=${lon.toFixed(6)}&radius=${KV_MAX_M}&itemsPerPage=20`, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if ((e as Error)?.name === 'TimeoutError') throw new PanoError('provider-error', `KartaView did not answer within ${timeoutMs / 1000} s`);
      throw new PanoError('offline', 'no connection to KartaView');
    }
    if (r.status === 429) throw new PanoError('rate-limit', 'KartaView is limiting requests');
    const b = (await r.json().catch(() => ({}))) as { status?: { apiCode?: number; apiMessage?: string }; result?: { data?: Photo[] } };
    const code = b.status?.apiCode;
    if (code === 601) return []; // "The request has an empty response": nothing here
    if (code !== 600) throw new PanoError('provider-error', `KartaView: ${code ?? r.status} ${b.status?.apiMessage ?? ''}`.trim());
    return (b.result?.data ?? []).map((p): Pano => {
      if (p.fileurlProc) urls.set(p.id, p.fileurlProc);
      return { id: p.id, lat: Number(p.lat), lon: Number(p.lng), capturedAt: p.shotDate ? Date.parse(p.shotDate.replace(' ', 'T') + 'Z') : 0, is360: false, heading: p.heading ? Number(p.heading) : undefined, attribution: ATTRIB };
    });
  }

  return {
    name: 'KartaView',
    attribution: ATTRIB,
    async findNearest(lat, lon, radius): Promise<Found | undefined> {
      const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
      if (!asked.has(key)) asked.set(key, near(lat, lon).catch((e) => (asked.delete(key), Promise.reject(e))));
      return chooseNearest(await asked.get(key)!, lat, lon, Math.min(radius, KV_MAX_M));
    },
    async open(container: HTMLElement, pano: Pano, onView: OnView) {
      const url = urls.get(pano.id);
      if (!url) throw new PanoError('viewer', `no KartaView picture URL for ${pano.id}`);
      const img = document.createElement('img');
      img.className = 'flat-photo';
      img.alt = 'Street-level photo from KartaView';
      img.src = url;
      container.replaceChildren(img);
      await img.decode().catch(() => { throw new PanoError('viewer', 'KartaView picture did not load'); });
      onView(pano, pano.heading ?? 0);
    },
    close() {},
  };
}
