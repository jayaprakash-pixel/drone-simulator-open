import { describe, expect, it } from 'vitest';
import { CLEARANCE_SCOPE, terrainHeight, visualAidHeight } from './obstacles';
import type { ClearanceGround, TerrainHeight } from './obstacles';

describe('obstacle types: only terrain counts for clearance', () => {
  it('a terrain height is accepted as clearance ground', () => {
    const g: ClearanceGround = { ground: terrainHeight(433) };
    expect(g.ground).toEqual({ m: 433, type: 'msl' });
  });
  it('a building or tree height is rejected by the type checker (tsc --noEmit fails if this ever compiles)', () => {
    const roof = visualAidHeight(436, 'osm-building');
    // @ts-expect-error a building top is a visual aid, never an obstacle height
    const bad: ClearanceGround = { ground: roof };
    // @ts-expect-error a plain altitude cannot pose as terrain either
    const plain: TerrainHeight = { m: 433, type: 'msl' };
    expect([bad.ground.m, plain.m]).toEqual([436, 433]);
  });
  it('the result text names what is not counted', () => {
    expect(CLEARANCE_SCOPE).toBe('terrain only: not buildings, trees, poles or wires');
  });
});
