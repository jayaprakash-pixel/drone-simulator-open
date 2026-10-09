// Street-level images behind one interface, so the provider (Mapillary first) can change without touching the UI.

export interface Pano {
  id: string;
  lat: number;
  lon: number;
  /** capture time, milliseconds since 1970 (UTC) */
  capturedAt: number;
  /** a full 360 degree panorama; false for an ordinary (flat) photo */
  is360: boolean;
  /** compass direction of the image centre, degrees clockwise from north, when known */
  heading?: number;
  /** the contributor's user name, needed for attribution */
  creator?: string;
  /** this image's own credit line (provider, author, licence) when it differs per image (Panoramax) */
  attribution?: string;
}

export interface Found {
  pano: Pano;
  /** metres from the point asked about */
  distance: number;
}

/** What the open viewer reports: the image shown and the direction looked at (degrees from north). */
export type OnView = (pano: Pano, bearing: number) => void;

export interface PanoramaProvider {
  readonly name: string;
  /** Licence and credit line to show next to every image (the image's creator is added by the UI). */
  readonly attribution: string;
  /** Best image within `radius` metres: the nearest 360 degree panorama, else the nearest flat photo. */
  findNearest(lat: number, lon: number, radius: number): Promise<Found | undefined>;
  /** How many true 360 panoramas and images of any kind lie within `radius` metres (for "What is here?"). */
  countNear?(lat: number, lon: number, radius: number): Promise<{ pano: number; any: number; capped: boolean }>;
  /** Positions of the true 360 images in a box [west, south, east, north] (the coverage dots, P1.12.4). */
  panosIn?(box: [number, number, number, number]): Promise<{ lat: number; lon: number }[]>;
  /** Shows `pano` in `container` and reports every image change and turn through `onView`. */
  open(container: HTMLElement, pano: Pano, onView: OnView): Promise<void>;
  close(): void;
}

export type PanoFailure = 'no-token' | 'bad-token' | 'rate-limit' | 'offline' | 'provider-error' | 'viewer';

export class PanoError extends Error {
  constructor(
    readonly kind: PanoFailure,
    message: string,
  ) {
    super(message);
    this.name = 'PanoError';
  }
}

/**
 * Several providers as one (P1.12.5): a true 360 from any of them, nearest first, then the nearest flat photo; one
 * provider failing does not hide the others' answers (only all failing is an error). open() goes to the provider that
 * found the image.
 */
export function combineProviders(list: PanoramaProvider[]): PanoramaProvider {
  const from = new Map<string, PanoramaProvider>();
  let current: PanoramaProvider | undefined;
  const ask = async <T>(f: (p: PanoramaProvider) => Promise<T> | undefined): Promise<{ p: PanoramaProvider; v: T }[]> => {
    const got = await Promise.allSettled(list.map(async (p) => ({ p, v: await f(p) })));
    const ok = got.filter((g): g is PromiseFulfilledResult<{ p: PanoramaProvider; v: Awaited<T> }> => g.status === 'fulfilled').map((g) => g.value);
    if (!ok.length) throw (got.find((g) => g.status === 'rejected') as PromiseRejectedResult).reason;
    return ok as { p: PanoramaProvider; v: T }[];
  };
  return {
    name: list.map((p) => p.name).join(' + '),
    attribution: list.map((p) => p.attribution).join('; '),
    async findNearest(lat, lon, radius) {
      const found = (await ask((p) => p.findNearest(lat, lon, radius))).filter((x) => x.v);
      for (const { p, v } of found) from.set(v!.pano.id, p);
      const best = chooseNearest(found.map((x) => x.v!.pano), lat, lon, radius);
      return best && found.find((x) => x.v!.pano.id === best.pano.id)!.v;
    },
    async countNear(lat, lon, radius) {
      const n = (await ask((p) => p.countNear?.(lat, lon, radius))).map((x) => x.v).filter(Boolean) as { pano: number; any: number; capped: boolean }[];
      return { pano: n.reduce((t, x) => t + x.pano, 0), any: n.reduce((t, x) => t + x.any, 0), capped: n.some((x) => x.capped) };
    },
    async panosIn(box) {
      return (await ask((p) => p.panosIn?.(box))).flatMap((x) => (x.v as { lat: number; lon: number }[] | undefined) ?? []);
    },
    async open(container, pano, onView) {
      current = from.get(pano.id) ?? list[0];
      return current.open(container, pano, onView);
    },
    close() {
      current?.close();
      current = undefined;
    },
  };
}

/** Great-circle distance in metres (haversine, mean Earth radius): plenty for "within 100 m". */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The nearest 360 degree panorama within `radius`, else the nearest flat photo within it, else undefined. */
export function chooseNearest(panos: Pano[], lat: number, lon: number, radius: number): Found | undefined {
  let best: Found | undefined;
  for (const pano of panos) {
    const distance = distanceM(lat, lon, pano.lat, pano.lon);
    if (distance > radius) continue;
    const better = !best || (pano.is360 && !best.pano.is360) || (pano.is360 === best.pano.is360 && distance < best.distance);
    if (better) best = { pano, distance };
  }
  return best;
}

/**
 * A box around a point, [west, south, east, north] in degrees, a little larger than the circle of `radius` metres
 * (metres per degree rounded down): chooseNearest then keeps only what is really within the radius.
 */
export function bboxAround(lat: number, lon: number, radius: number): [number, number, number, number] {
  const dLat = radius / 110_000;
  const dLon = radius / (111_000 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}
