import { describe, expect, it, vi } from 'vitest';
import { buildingQuery, countBuildings, parseCounts } from './osmcount';

const count = (total: number) => ({ type: 'count', id: 0, tags: { nodes: '0', ways: String(total), relations: '0', total: String(total) } });

describe('OSM building count (Overpass)', () => {
  it('asks for buildings in a box around the point, then the height- or levels-tagged ones', () => {
    const q = buildingQuery(26.4897, 74.5511, 250);
    expect(q).toContain('out count;');
    expect(q.match(/out count/g)).toHaveLength(2);
    expect(q).toContain('["building:levels"]');
    const [s, w, n, e] = /\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(q)!.slice(1).map(Number);
    expect((n - s) * 110_574).toBeCloseTo(500, 0);
    expect((e - w) * 111_320 * Math.cos((26.4897 * Math.PI) / 180)).toBeCloseTo(500, 0);
  });
  it('reads the two counts, and names each failure', () => {
    expect(parseCounts(200, { elements: [count(42), count(3)] })).toEqual({ buildings: 42, tagged: 3 });
    expect(parseCounts(200, { elements: [count(0), count(0)] })).toEqual({ buildings: 0, tagged: 0 });
    expect(() => parseCounts(429, undefined)).toThrow(expect.objectContaining({ kind: 'rate-limit' }));
    expect(() => parseCounts(504, undefined)).toThrow(expect.objectContaining({ kind: 'busy' }));
    expect(() => parseCounts(200, { elements: [] })).toThrow(expect.objectContaining({ kind: 'error' }));
  });
  it('a dropped connection is offline', async () => {
    const f = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(countBuildings(0, 0, 250, undefined, f as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'offline' });
  });
});
