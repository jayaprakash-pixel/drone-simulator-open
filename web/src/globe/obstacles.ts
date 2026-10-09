// What may count as an obstacle (owner decision 2026-10-08). Only terrain heights are verified obstacle data; OSM building
// boxes and tree data are a visual aid: most Indian buildings have no mapped height (drawn at 3 m per level) and trees,
// poles and wires are missing. The types make that rule hold at compile time: a Phase 3 clearance check takes
// TerrainHeight only, and a VisualAidHeight can never be passed in its place.
import type { Altitude } from './coords';

declare const terrainBrand: unique symbol;
declare const visualBrand: unique symbol;

/** A ground height from the terrain model (Cesium World Terrain), MSL. The only obstacle height a clearance check accepts. */
export type TerrainHeight = Altitude & { readonly type: 'msl'; readonly [terrainBrand]: true };

/** The top of something drawn only as a visual aid (an OSM building box, a tree): never an obstacle for clearance. */
export type VisualAidHeight = Altitude & { readonly source: 'osm-building' | 'tree'; readonly [visualBrand]: true };

/** Wraps a terrain-model ground height (metres MSL). Call it only with heights from the terrain provider. */
export const terrainHeight = (mMsl: number): TerrainHeight => ({ m: mMsl, type: 'msl' }) as TerrainHeight;

/** Wraps the top of a drawn building or tree (metres MSL). */
export const visualAidHeight = (mMsl: number, source: VisualAidHeight['source']): VisualAidHeight => ({ m: mMsl, type: 'msl', source }) as VisualAidHeight;

/** Every clearance result carries this text (Phase 3 rule, decisions.md 2026-10-08). */
export const CLEARANCE_SCOPE = 'terrain only: not buildings, trees, poles or wires';
/** Shown uncertainty of a terrain clearance, metres: at least the worst elevation error measured in P1.6.2 (24.7 m). */
export const CLEARANCE_UNCERTAINTY_M = 25;
/** Default minimum terrain margin for the Phase 3 clearance check, metres. */
export const DEFAULT_CLEARANCE_MARGIN_M = 50;

/** The shape a Phase 3 clearance check takes: terrain only. (The check itself is built in P3.3.2, not now.) */
export interface ClearanceGround {
  ground: TerrainHeight;
}
