// Mapillary street-level images (API v4 Graph API plus the MapillaryJS viewer), checked against the live docs on
// 2026-10-08 (https://www.mapillary.com/developer/api-documentation): images are searched by bbox
// (minLon,minLat,maxLon,maxLat, under 0.01 square degrees, at most 2000 results, no paging), is_pano filters 360
// panoramas, the client token travels in an "Authorization: OAuth" header, and errors carry error.code
// (190 = token not accepted, 4 = request limit reached) whatever the HTTP status. Images are CC BY-SA 4.0.
import { PanoError, bboxAround, chooseNearest, distanceM } from './provider';
import type { Found, OnView, Pano, PanoramaProvider } from './provider';

const GRAPH = 'https://graph.mapillary.com/images';
const SAFE_RADIUS = 500; // m: the widest box Mapillary answered in central Tokyo (2026-10-08)
const FIELDS = 'id,geometry,computed_geometry,captured_at,is_pano,camera_type,compass_angle,computed_compass_angle,creator';

interface Point {
  coordinates?: [number, number]; // GeoJSON: [lon, lat]
}
export interface GraphImage {
  id?: string;
  geometry?: Point;
  computed_geometry?: Point;
  captured_at?: number;
  is_pano?: boolean;
  camera_type?: string;
  compass_angle?: number;
  computed_compass_angle?: number;
  creator?: { username?: string };
}

/** One Graph API image as a Pano (the position after Mapillary's processing when it has one), or undefined without a position. */
export function toPano(g: GraphImage): Pano | undefined {
  const c = g.computed_geometry?.coordinates ?? g.geometry?.coordinates;
  if (!g.id || !c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return undefined;
  const [lon, lat] = c;
  return {
    id: String(g.id),
    lat,
    lon,
    capturedAt: g.captured_at ?? Number.NaN,
    is360: g.is_pano === true || g.camera_type === 'spherical' || g.camera_type === 'equirectangular',
    heading: g.computed_compass_angle ?? g.compass_angle,
    creator: g.creator?.username,
  };
}

/** Mapillary's answer to a box holding too many images: HTTP 500 "Please reduce the amount of data you're asking for". */
export const tooMuchData = (status: number, body: unknown): boolean =>
  status === 500 && /reduce the amount of data/i.test(String((body as { error?: { message?: string } } | undefined)?.error?.message ?? ''));

/** The failure in a Graph API reply, or undefined for a good one ({ data: [...] }). */
export function graphError(status: number, body: unknown): PanoError | undefined {
  const code = (body as { error?: { code?: number } } | undefined)?.error?.code;
  if (code === 190 || status === 401 || status === 403) return new PanoError('bad-token', `Mapillary did not accept the token (HTTP ${status})`);
  if (code === 4 || status === 429) return new PanoError('rate-limit', `Mapillary request limit reached (HTTP ${status})`);
  if (status >= 400 || code !== undefined || !Array.isArray((body as { data?: unknown } | undefined)?.data)) {
    return new PanoError('provider-error', `unexpected Mapillary reply (HTTP ${status})`);
  }
  return undefined;
}

type MlyViewer = { on(type: string, handler: (ev: never) => void): void; moveTo(id: string): Promise<unknown>; remove(): void };
interface MlyImage {
  id: string;
  lngLat: { lat: number; lng: number };
  capturedAt: number;
  cameraType: string;
  computedCompassAngle?: number;
  creatorUsername?: string;
}

export function createMapillaryProvider(token: string, fetchFn: typeof fetch = (...a) => fetch(...a)): PanoramaProvider {
  let viewer: MlyViewer | undefined;

  const search = (lat: number, lon: number, radius: number, panoOnly: boolean): Promise<Pano[]> => searchBox(bboxAround(lat, lon, radius), panoOnly, 0);

  async function searchBox([w, s, e, n]: [number, number, number, number], panoOnly: boolean, depth: number): Promise<Pano[]> {
    const url = `${GRAPH}?fields=${FIELDS}&bbox=${[w, s, e, n].map((v) => v.toFixed(6)).join(',')}&limit=500${panoOnly ? '&is_pano=true' : ''}`;
    let reply: Response;
    try {
      reply = await fetchFn(url, { headers: { Authorization: `OAuth ${token}` } }); // header, never the URL: URLs end up in logs
    } catch {
      throw new PanoError('offline', 'no connection to Mapillary');
    }
    const body = await reply.json().catch(() => undefined);
    if (tooMuchData(reply.status, body) && depth < 2) {
      // Mapillary refuses boxes with too many images (central Tokyo at 1 km, New York at 500 m): ask for the four
      // quarters instead, at most twice over (16 boxes), and merge them
      const [mx, my] = [(w + e) / 2, (s + n) / 2];
      const parts = await Promise.all(([[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]] as [number, number, number, number][]).map((b) => searchBox(b, panoOnly, depth + 1)));
      return [...new Map(parts.flat().map((p) => [p.id, p])).values()];
    }
    const err = graphError(reply.status, body);
    if (err) throw err;
    return ((body as { data: GraphImage[] }).data ?? []).map(toPano).filter((p): p is Pano => p !== undefined);
  }

  // ponytail: a bbox search asks for 500 images with no paging (2000 is the API maximum, but dense areas then fail);
  // panoramas are asked for first, so a busy block can only crowd out flat photos. Use the 50 m radius search if that matters.
  const nearestIn = async (lat: number, lon: number, radius: number): Promise<Found | undefined> =>
    chooseNearest(await search(lat, lon, radius, true), lat, lon, radius) ?? chooseNearest(await search(lat, lon, radius, false), lat, lon, radius);

  return {
    name: 'Mapillary',
    attribution: '© Mapillary contributors, CC BY-SA 4.0',
    async findNearest(lat, lon, radius): Promise<Found | undefined> {
      if (!token) throw new PanoError('no-token', 'no Mapillary token');
      // Mapillary refuses a 1 km box in a dense city ("reduce the amount of data", whatever the limit) but answers 500 m
      // ones, so wider searches go out in steps: the 1 km box is only asked for where nothing lies within 500 m.
      if (radius > SAFE_RADIUS) return (await this.findNearest(lat, lon, SAFE_RADIUS)) ?? (await nearestIn(lat, lon, radius));
      return nearestIn(lat, lon, radius);
    },
    async countNear(lat, lon, radius) {
      if (!token) throw new PanoError('no-token', 'no Mapillary token');
      const within = (ps: Pano[]): number => ps.filter((p) => distanceM(lat, lon, p.lat, p.lon) <= radius).length;
      const [panos, all] = [await search(lat, lon, radius, true), await search(lat, lon, radius, false)];
      return { pano: within(panos), any: within(all), capped: all.length >= 500 };
    },
    async panosIn(box) {
      if (!token) throw new PanoError('no-token', 'no Mapillary token');
      return (await searchBox(box, true, 0)).filter((p) => p.is360).map((p) => ({ lat: p.lat, lon: p.lon }));
    },
    async open(container: HTMLElement, pano: Pano, onView: OnView): Promise<void> {
      if (!token) throw new PanoError('no-token', 'no Mapillary token');
      const { Viewer } = await import('mapillary-js'); // about 1 MB with its own three.js: loaded on first use only
      await import('mapillary-js/dist/mapillary.css');
      const v = new Viewer({ accessToken: token, container, component: { cover: false } }) as unknown as MlyViewer;
      viewer = v;
      let current = pano;
      let bearing = pano.heading ?? 0;
      v.on('image', (ev: { image: MlyImage | null }) => {
        const img = ev.image;
        if (!img) return;
        current = { id: img.id, lat: img.lngLat.lat, lon: img.lngLat.lng, capturedAt: img.capturedAt, is360: img.cameraType === 'spherical', heading: img.computedCompassAngle, creator: img.creatorUsername };
        onView(current, bearing);
      });
      v.on('bearing', (ev: { bearing: number }) => {
        bearing = ev.bearing;
        onView(current, bearing);
      });
      try {
        await v.moveTo(pano.id);
      } catch (e) {
        throw new PanoError('viewer', `MapillaryJS could not show image ${pano.id}: ${String(e)}`);
      }
    },
    close(): void {
      viewer?.remove();
      viewer = undefined;
    },
  };
}
