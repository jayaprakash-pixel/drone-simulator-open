import { describe, expect, it } from 'vitest';
import { createPanoramaxProvider } from './panoramax';
import { combineProviders, PanoError } from './provider';
import type { PanoramaProvider } from './provider';

const feature = (id: string, lat: number, lon: number, fov: number) => ({
  id, geometry: { coordinates: [lon, lat] },
  properties: { datetime: '2024-02-01T18:06:09+00:00', license: 'CC-BY-SA-4.0', 'view:azimuth': 90, 'geovisio:producer': 'mw014', 'pers:interior_orientation': { field_of_view: fov } },
  assets: { sd: { href: `https://example.org/${id}.jpg` } },
});
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const kindOf = async (p: Promise<unknown>) => p.then(() => 'no error', (e) => (e instanceof PanoError ? e.kind : String(e)));

describe('Panoramax provider (P1.12.5), mocked replies', () => {
  it('rate limit (HTTP 429) is a rate-limit failure', async () => {
    expect(await kindOf(createPanoramaxProvider(reply(429, {}) as typeof fetch).findNearest(48.11, -1.68, 100))).toBe('rate-limit');
  });
  it('no connection is an offline failure', async () => {
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    expect(await kindOf(createPanoramaxProvider(down).findNearest(48.11, -1.68, 100))).toBe('offline');
  });
  it('a server error is a provider-error failure', async () => {
    expect(await kindOf(createPanoramaxProvider(reply(503, {}) as typeof fetch).findNearest(48.11, -1.68, 100))).toBe('provider-error');
  });
  it('no result is undefined, not an error', async () => {
    expect(await createPanoramaxProvider(reply(200, { features: [] }) as typeof fetch).findNearest(48.11, -1.68, 100)).toBeUndefined();
  });
  it('a 360 picture is marked 360 and carries its producer and licence', async () => {
    const f = await createPanoramaxProvider(reply(200, { features: [feature('p1', 48.11, -1.68, 360)] }) as typeof fetch).findNearest(48.11, -1.68, 100);
    expect(f?.pano.is360).toBe(true);
    expect(f?.pano.attribution).toBe('Panoramax · mw014 · CC-BY-SA-4.0');
  });
});

describe('combined providers: a true 360 from any provider first, nearest first, then flat photos', () => {
  const fake = (name: string, pano: { id: string; lat: number; is360: boolean } | null, fail?: PanoError): PanoramaProvider => ({
    name, attribution: name,
    async findNearest(lat, lon) {
      if (fail) throw fail;
      return pano ? { pano: { ...pano, lon, capturedAt: 0 }, distance: Math.abs(pano.lat - lat) * 111_195 } : undefined;
    },
    async open() {}, close() {},
  });
  it('a 360 50 m away beats a flat photo 5 m away', async () => {
    const c = combineProviders([fake('A', { id: 'flat', lat: 48.11 + 5 / 111_195, is360: false }), fake('B', { id: 'pano', lat: 48.11 + 50 / 111_195, is360: true })]);
    expect((await c.findNearest(48.11, -1.68, 100))?.pano.id).toBe('pano');
  });
  it('of two 360s the nearer wins', async () => {
    const c = combineProviders([fake('A', { id: 'far', lat: 48.11 + 80 / 111_195, is360: true }), fake('B', { id: 'near', lat: 48.11 + 20 / 111_195, is360: true })]);
    expect((await c.findNearest(48.11, -1.68, 100))?.pano.id).toBe('near');
  });
  it('one provider rate-limited or offline: the other still answers', async () => {
    const c = combineProviders([fake('A', null, new PanoError('rate-limit', 'x')), fake('B', { id: 'ok', lat: 48.11, is360: true })]);
    expect((await c.findNearest(48.11, -1.68, 100))?.pano.id).toBe('ok');
  });
  it('all providers failing is the first failure', async () => {
    const c = combineProviders([fake('A', null, new PanoError('offline', 'x')), fake('B', null, new PanoError('rate-limit', 'y'))]);
    expect(await kindOf(c.findNearest(48.11, -1.68, 100))).toBe('offline');
  });
  it('no result anywhere is undefined', async () => {
    expect(await combineProviders([fake('A', null), fake('B', null)]).findNearest(48.11, -1.68, 100)).toBeUndefined();
  });
});

describe('KartaView provider (P1.12.5), mocked replies', () => {
  const kv = async (reply: () => Promise<Response>) => (await import('./kartaview')).createKartaViewProvider(reply as unknown as typeof fetch, 200);
  const ok = (data: unknown[]) => async () => new Response(JSON.stringify({ status: { apiCode: 600 }, result: { data } }), { status: 200 });
  it('rate limit (HTTP 429) is a rate-limit failure', async () => {
    expect(await kindOf((await kv(reply(429, {}))).findNearest(30, 70, 100))).toBe('rate-limit');
  });
  it('no connection is an offline failure', async () => {
    expect(await kindOf((await kv(async () => { throw new TypeError('Failed to fetch'); })).findNearest(30, 70, 100))).toBe('offline');
  });
  it('its query timeout (apiCode 408) is a provider-error failure', async () => {
    expect(await kindOf((await kv(reply(400, { status: { apiCode: 408, apiMessage: 'Query timeout' } }))).findNearest(30, 70, 100))).toBe('provider-error');
  });
  it('no result (apiCode 601) is undefined', async () => {
    expect(await (await kv(reply(200, { status: { apiCode: 601 } }))).findNearest(30, 70, 100)).toBeUndefined();
  });
  it('a photo is flat, carries the KartaView credit, and one point is asked once', async () => {
    let calls = 0;
    const p = await kv(async () => (calls++, ok([{ id: '1', lat: '30.0001', lng: '70', heading: '52', shotDate: '2016-05-04 23:39:14', fileurlProc: 'https://x/1.jpg' }])()));
    const a = await p.findNearest(30, 70, 100);
    await p.findNearest(30, 70, 1000); // the wider lookup reuses the answer
    expect(a?.pano.is360).toBe(false);
    expect(a?.pano.attribution).toBe('© Grab and KartaView Contributors, CC BY-SA 4.0');
    expect(calls).toBe(1);
  });
});
