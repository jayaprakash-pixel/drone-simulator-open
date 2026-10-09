import { describe, expect, it, vi } from 'vitest';
import { createMapillaryProvider, graphError, toPano } from './mapillary';
import { bboxAround, chooseNearest, distanceM } from './provider';
import type { Pano } from './provider';

const P = { lat: 26.9124, lon: 75.7873 }; // Jaipur
const north = (m: number): number => P.lat + m / 111_195; // m metres north on the haversine sphere
const pano = (id: string, metresNorth: number, is360 = true): Pano => ({ id, lat: north(metresNorth), lon: P.lon, capturedAt: 0, is360 });

describe('chooseNearest', () => {
  it('prefers a 360 panorama within the radius over a closer flat photo', () => {
    const f = chooseNearest([pano('flat', 20, false), pano('far360', 80), pano('near360', 60)], P.lat, P.lon, 100);
    expect(f?.pano.id).toBe('near360');
    expect(f?.distance).toBeCloseTo(60, 3);
  });
  it('takes the nearest flat photo when no panorama is in range', () => {
    expect(chooseNearest([pano('f1', 70, false), pano('f2', 30, false), pano('p', 150)], P.lat, P.lon, 100)?.pano.id).toBe('f2');
  });
  it('returns nothing when nothing is within the radius, and finds it when the radius grows', () => {
    const list = [pano('p', 640)];
    expect(chooseNearest(list, P.lat, P.lon, 100)).toBeUndefined();
    expect(chooseNearest(list, P.lat, P.lon, 1000)?.distance).toBeCloseTo(640, 3);
    expect(chooseNearest([], P.lat, P.lon, 1000)).toBeUndefined();
  });
});

describe('bboxAround', () => {
  it('is [west, south, east, north] and contains the whole circle', () => {
    const [w, s, e, n] = bboxAround(P.lat, P.lon, 100);
    expect(w < P.lon && e > P.lon && s < P.lat && n > P.lat).toBe(true);
    expect(distanceM(P.lat, P.lon, n, P.lon)).toBeGreaterThan(100);
    expect(distanceM(P.lat, P.lon, P.lat, e)).toBeGreaterThan(100);
  });
  it('a 1 km search box stays under the API limit of 0.01 square degrees', () => {
    const [w, s, e, n] = bboxAround(P.lat, P.lon, 1000);
    expect((e - w) * (n - s)).toBeLessThan(0.01);
  });
});

describe('toPano: one Graph API image', () => {
  it('reads the processed position, capture time, 360 flag, compass angle and creator', () => {
    const p = toPano({
      id: '1458307941562975',
      geometry: { coordinates: [13.4050217, 52.5197756] },
      computed_geometry: { coordinates: [13.40503, 52.51978] },
      captured_at: 1641206630491,
      is_pano: true,
      camera_type: 'equirectangular',
      compass_angle: 10,
      computed_compass_angle: 12.5,
      creator: { username: 'someone' },
    });
    expect(p).toEqual({ id: '1458307941562975', lat: 52.51978, lon: 13.40503, capturedAt: 1641206630491, is360: true, heading: 12.5, creator: 'someone' });
  });
  it('falls back to the original position; a spherical camera counts as 360; a perspective one does not', () => {
    expect(toPano({ id: '1', geometry: { coordinates: [1, 2] }, camera_type: 'spherical' })).toMatchObject({ lat: 2, lon: 1, is360: true });
    expect(toPano({ id: '2', geometry: { coordinates: [1, 2] }, camera_type: 'perspective', is_pano: false })?.is360).toBe(false);
  });
  it('skips images without an id or a position', () => {
    expect(toPano({ id: '3' })).toBeUndefined();
    expect(toPano({ geometry: { coordinates: [1, 2] } })).toBeUndefined();
  });
});

describe('graphError: Graph API replies', () => {
  it.each([
    [400, { error: { message: 'Error validating application', type: 'OAuthException', code: 190 } }, 'bad-token'],
    [401, { error: { code: 190 } }, 'bad-token'],
    [400, { error: { message: 'Application request limit reached', type: 'OAuthException', is_transient: true, code: 4, error_subcode: 1349210 } }, 'rate-limit'],
    [429, undefined, 'rate-limit'],
    [500, { error: { code: 1 } }, 'provider-error'],
    [502, undefined, 'provider-error'],
    [200, { nope: 1 }, 'provider-error'],
  ])('HTTP %i %j is %s', (status, body, kind) => {
    expect(graphError(status, body)?.kind).toBe(kind);
  });
  it('a { data: [...] } reply is not an error', () => {
    expect(graphError(200, { data: [] })).toBeUndefined();
  });
});

describe('Mapillary provider with a mocked network', () => {
  const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
  const img = (id: string, metresNorth: number, isPano: boolean) => ({ id, geometry: { coordinates: [P.lon, north(metresNorth)] }, captured_at: 1, is_pano: isPano });

  it('without a token it fails as no-token and never touches the network', async () => {
    const f = vi.fn();
    await expect(createMapillaryProvider('', f).findNearest(P.lat, P.lon, 100)).rejects.toMatchObject({ kind: 'no-token' });
    expect(f).not.toHaveBeenCalled();
  });
  it('asks for panoramas first, in a bbox, with the token in the header and never in the URL', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => reply({ data: [img('7', 30, true)] }));
    const found = await createMapillaryProvider('MLY|1|abc', f as unknown as typeof fetch).findNearest(P.lat, P.lon, 100);
    expect(found?.pano.id).toBe('7');
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    const q = new URL(url).searchParams;
    expect(q.get('is_pano')).toBe('true');
    expect(q.get('fields')).toContain('captured_at');
    const [w, s, e, n] = q.get('bbox')!.split(',').map(Number);
    expect(w < P.lon && e > P.lon && s < P.lat && n > P.lat).toBe(true);
    expect(url).not.toContain('MLY');
    expect((init?.headers as Record<string, string>).Authorization).toBe('OAuth MLY|1|abc');
  });
  it('with no panorama in range it asks again for any image and returns the flat photo', async () => {
    const f = vi.fn(async (url: string) => reply({ data: url.includes('is_pano=true') ? [] : [img('flat', 40, false)] }));
    const found = await createMapillaryProvider('MLY|1|abc', f as unknown as typeof fetch).findNearest(P.lat, P.lon, 100);
    expect(found?.pano).toMatchObject({ id: 'flat', is360: false });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('a 1 km search goes out as a 500 m box first and widens only when that finds nothing (Mapillary refuses big boxes in dense areas)', async () => {
    const half = (url: string) => {
      const [w, , e] = new URL(url).searchParams.get('bbox')!.split(',').map(Number);
      return ((e - w) / 2) * 111_000 * Math.cos((P.lat * Math.PI) / 180); // box half-width in metres
    };
    const dense = vi.fn(async (_url: string) => reply({ data: [img('near', 300, true)] }));
    expect((await createMapillaryProvider('MLY|1|abc', dense as unknown as typeof fetch).findNearest(P.lat, P.lon, 1000))?.pano.id).toBe('near');
    expect(dense.mock.calls.map(([u]) => Math.round(half(u)))).toEqual([500]);
    const sparse = vi.fn(async (url: string) => reply({ data: half(url) > 600 && url.includes('is_pano=true') ? [img('far', 800, true)] : [] }));
    expect((await createMapillaryProvider('MLY|1|abc', sparse as unknown as typeof fetch).findNearest(P.lat, P.lon, 1000))?.pano.id).toBe('far');
    expect(sparse.mock.calls.map(([u]) => Math.round(half(u)))).toEqual([500, 500, 1000]);
  });
  it('a box Mapillary refuses as too much data is asked again as four quarters, merged without duplicates', async () => {
    const refuse = { error: { message: "Please reduce the amount of data you're asking for, then retry your request", code: 1 } };
    let calls = 0;
    const f = vi.fn(async (url: string) => {
      calls++;
      const [w, , e] = new URL(url).searchParams.get('bbox')!.split(',').map(Number);
      if (e - w > 0.006) return reply(refuse, 500); // the full 500 m box is too big; its quarters are fine
      return reply({ data: [img('same-everywhere', 40, true), img(`q${calls}`, 60, true)] });
    });
    const c = await createMapillaryProvider('MLY|1|abc', f as unknown as typeof fetch).countNear!(P.lat, P.lon, 500);
    expect(calls).toBe(1 + 4 + 1 + 4); // pano search and any search, each refused once then split in four
    expect(c).toEqual({ pano: 5, any: 5, capped: false }); // 4 quarter ids + the shared one, counted once
  });
  it('maps a dropped connection to offline, code 190 to bad-token and code 4 to rate-limit', async () => {
    const run = (f: unknown) => createMapillaryProvider('MLY|1|abc', f as typeof fetch).findNearest(P.lat, P.lon, 100);
    await expect(run(async () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toMatchObject({ kind: 'offline' });
    await expect(run(async () => reply({ error: { code: 190 } }, 400))).rejects.toMatchObject({ kind: 'bad-token' });
    await expect(run(async () => reply({ error: { code: 4 } }, 400))).rejects.toMatchObject({ kind: 'rate-limit' });
    await expect(run(async () => new Response('<html>busy</html>', { status: 503 }))).rejects.toMatchObject({ kind: 'provider-error' });
  });
});
