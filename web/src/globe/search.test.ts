import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearch } from './search';

const item = (name: string, lat: number, lon: number) => ({ display_name: name, lat: String(lat), lon: String(lon), boundingbox: [String(lat - 0.1), String(lat + 0.1), String(lon - 0.1), String(lon + 0.1)], osm_type: 'node', category: 'place', type: 'city' });
const reply = (items: unknown[], ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(items) } as Response);
const asFetch = (f: unknown) => f as typeof fetch;

describe('Nominatim search rules', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('sends one request on Enter with limit=5 and parses places (bbox as numbers)', async () => {
    const f = vi.fn((_u: string) => reply([item('Jaisalmer, Rajasthan, India', 26.9157, 70.9083)]));
    const places = await createSearch(asFetch(f))('Jaisalmer');
    expect(f).toHaveBeenCalledTimes(1);
    const url = new URL(f.mock.calls[0]![0]);
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('q')).toBe('Jaisalmer');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(places![0]).toMatchObject({ name: 'Jaisalmer, Rajasthan, India', lat: 26.9157, lon: 70.9083 });
    expect(places![0]!.bbox.every((n) => typeof n === 'number')).toBe(true);
  });

  it('tells a city node (framed as a town) from an area (framed by its bounding box)', async () => {
    const district = { ...item('Jaisalmer, Rajasthan, India', 27.03, 70.78), osm_type: 'relation', category: 'boundary', type: 'administrative' };
    const places = await createSearch(asFetch(() => reply([district, item('Jaisalmer, Jaisalmer Tehsil, India', 26.91, 70.91)])))('Jaisalmer');
    expect(places!.map((p) => [p.kind, p.point])).toEqual([['administrative', false], ['city', true]]);
  });

  it('three Enter presses within 1 s send only 1 request (repeats are dropped)', async () => {
    const f = vi.fn((_u: string) => reply([item('Jaipur', 26.9, 75.8)]));
    const search = createSearch(asFetch(f));
    const first = search('Jaipur');
    const again = [search('Jaipur'), search('Jaipur')];
    expect(await first).toHaveLength(1);
    expect(await Promise.all(again)).toEqual([null, null]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a different query inside the gap waits for the gap, and the newest held query wins', async () => {
    const f = vi.fn((_u: string) => reply([]));
    const search = createSearch(asFetch(f));
    await search('Jaipur');
    const a = search('Pushkar');
    const b = search('Mount Abu');
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await a).toBeNull();
    expect(await b).toEqual([]);
    expect(f).toHaveBeenCalledTimes(2);
    expect(new URL(f.mock.calls[1]![0]).searchParams.get('q')).toBe('Mount Abu');
  });

  it('never exceeds one request per second over a burst of mixed queries', async () => {
    const times: number[] = [];
    const f = vi.fn((_u: string) => {
      times.push(Date.now());
      return reply([]);
    });
    const search = createSearch(asFetch(f));
    for (const q of ['a', 'b', 'c', 'd', 'e']) {
      void search(q);
      await vi.advanceTimersByTimeAsync(300);
    }
    await vi.advanceTimersByTimeAsync(3000);
    expect(times.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(1000);
  });

  it('empty input sends nothing; a server error rejects; caps at 5 results; drops malformed rows', async () => {
    const f = vi.fn((_u: string) => reply([]));
    expect(await createSearch(asFetch(f))('   ')).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    await expect(createSearch(asFetch(() => reply([], false, 429)))('x')).rejects.toThrow('429');
    const many: unknown[] = Array.from({ length: 8 }, (_, i) => item(`p${i}`, 20 + i, 70));
    many.push({ display_name: 'bad', lat: 'x', lon: 'y', boundingbox: [] });
    expect(await createSearch(asFetch(() => reply(many)))('x')).toHaveLength(5);
  });
});
