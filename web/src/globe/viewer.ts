import {
  BingMapsImageryProvider,
  Cartesian3,
  Cartographic,
  Credit,
  EllipsoidTerrainProvider,
  ImageryLayer,
  Ion,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventType,
  Terrain,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  Viewer,
  buildModuleUrl,
  createOsmBuildingsAsync,
  sampleTerrainMostDetailed,
} from 'cesium';
import type { Cesium3DTileset, TerrainProvider } from 'cesium';
import { OBLIQUE_PITCH, viewFrom } from './camera';
import { ellipsoidToMsl } from './coords';
import type { Layer } from '../ui/settings';

// Earth from space, facing the viewer's own longitude (from the time zone: 15 degrees per hour east of UTC), not a
// fixed country: the app works anywhere (decisions.md 2026-10-09)
export const START_VIEW = { lon: Math.max(-180, Math.min(180, -new Date().getTimezoneOffset() / 4)), lat: 22, height: 20_000_000 };

/** What went wrong with remote map data: ion refused the token, or the network/service is unreachable. */
export type Problem = 'token' | 'network';

export interface GlobeOptions {
  creditContainer: HTMLElement;
  onProblem: (p: Problem) => void;
}

export interface Globe {
  viewer: Viewer;
  hasToken: boolean;
  /** True when real terrain is active (not the flat ellipsoid). */
  hasTerrain(): boolean;
  setTerrain(on: boolean): void;
  /** Shows exactly one imagery layer. */
  setLayer(layer: Layer): void;
  /** Who supplies a layer and when it was captured, or that the source does not say. */
  imagerySource(layer: Layer): string;
  /** Resolves once the ion imagery has loaded (or failed), when its real source is known. */
  imageryReady: Promise<void>;
  /**
   * The finest satellite (ion) imagery level that really exists at a point: asks for the tile there at levels 21 down
   * to 17 and returns the first that is not an empty "no imagery" tile (at most five small requests, cached by tile).
   * Undefined when none of those levels has imagery or there is no ion layer; rejects when the requests fail.
   */
  finestImagery(lat: number, lon: number): Promise<{ level: number; cmPerPixel: number } | undefined>;
  /** Terrain detail at a point: the finest level available and about how far apart its height points are. */
  terrainDetail(lat: number, lon: number): { level: number; spacingM: number } | undefined;
  /** Terrain height at a point, most detailed level, metres above the ellipsoid; undefined without terrain. */
  groundEllipsoid(lat: number, lon: number): Promise<number | undefined>;
  /** Same height as metres above mean sea level (EGM96). */
  groundMsl(lat: number, lon: number): Promise<number | undefined>;
  /** the same for many points in one terrain request (a mission route, P3.3.2); undefined where unknown */
  groundMslMany(points: { lat: number; lon: number }[]): Promise<(number | undefined)[]>;
  /** Fly-tos end straight down instead of tilted (the Top-down toggle). */
  topDown: boolean;
  /**
   * The one camera-move entry point: looks at the ground at lat/lon from `range` metres, tilted (pitch -40 deg, north
   * up) or straight down with topDown, never ending inside a hill.
   */
  flyToPlace(lat: number, lon: number, range: number): Promise<void>;
  /** Frames a Nominatim bounding box [south, north, west, east]. */
  flyToBox(bbox: [number, number, number, number]): Promise<void>;
  /** Shows or hides Cesium OSM Buildings (ion asset 96188), loading it on first use. Rejects when it cannot load. */
  setBuildings(on: boolean): Promise<void>;
  /** The buildings tileset once loaded (for the checks). */
  buildings(): Cesium3DTileset | undefined;
}

const isAuthError = (e: unknown): boolean => {
  const status = (e as { statusCode?: number } | null)?.statusCode;
  return status === 401 || status === 403 || /\b40[13]\b/.test(String((e as Error | null)?.message ?? ''));
};

/**
 * Creates the globe, tuned for a 7 GB laptop with an integrated GPU: it draws only when something changes
 * (an idle globe costs about nothing), with no MSAA, no 2D/Columbus modes and a coarser tile detail.
 * Flight (Phase 2a) will switch to continuous rendering. Without a token only bundled imagery is used.
 */
export async function createGlobe(container: HTMLElement, token: string, opts: GlobeOptions): Promise<Globe> {
  Ion.defaultAccessToken = token; // '' when missing: never fall back to Cesium's bundled evaluation token
  const viewer = new Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    msaaSamples: 1,
    orderIndependentTranslucency: false,
    creditContainer: opts.creditContainer,
  });
  viewer.scene.globe.maximumScreenSpaceError = 3;
  // gestures (Cesium defaults, kept): drag pans, wheel or right-drag zooms, middle-drag or Ctrl+drag tilts and turns,
  // Shift+drag looks around; collision detection keeps the camera at least this far above the terrain
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 2;
  viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK); // clicks pick points, not entities
  const requestRender = () => viewer.scene.requestRender();

  // imagery: ion satellite (or the bundled offline map without a token), Sentinel-2 cloudless and OpenStreetMap streets,
  // exactly one shown at a time: Cesium ion's terms forbid combining its Bing imagery with any other imagery or map
  const offline = await TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII'));
  const satellite = token ? ImageryLayer.fromWorldImagery({}) : new ImageryLayer(offline); // ion world imagery, aerial by default
  const s2 = new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
      maximumLevel: 14, // 10 m data: EOX serves tiles to level 18, but past 14 they are only enlarged; Cesium enlarges them locally instead
      credit: new Credit('EOxCloudless <a href="https://cloudless.eox.at" target="_blank" rel="noopener">cloudless.eox.at</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025), CC BY-NC-SA 4.0', true),
    }),
    { show: false },
  );
  const streets = new ImageryLayer(new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/', credit: '© OpenStreetMap contributors' }), { show: false });
  viewer.imageryLayers.add(satellite);
  viewer.imageryLayers.add(s2);
  viewer.imageryLayers.add(streets);

  let fallbackAdded = false;
  const report = (e: unknown): void => {
    if (!fallbackAdded) {
      fallbackAdded = true; // never leave a blank globe: put the offline map underneath
      viewer.imageryLayers.addImageryProvider(offline, 0);
      requestRender();
    }
    opts.onProblem(isAuthError(e) ? 'token' : 'network');
  };

  // terrain: ion World Terrain when there is a token; the provider is kept so the toggle can switch back without a refetch
  const flat = new EllipsoidTerrainProvider();
  let worldTerrain: TerrainProvider | undefined;
  let terrainSettled: Promise<void> = Promise.resolve(); // resolves when world terrain is ready or has failed
  if (token) {
    satellite.errorEvent.addEventListener(report);
    const terrain = Terrain.fromWorldTerrain();
    terrainSettled = new Promise((resolve) => {
      terrain.readyEvent.addEventListener((p) => {
        worldTerrain = p;
        resolve();
      });
      terrain.errorEvent.addEventListener(() => resolve());
    });
    terrain.errorEvent.addEventListener(report);
    viewer.scene.setTerrain(terrain);
  }
  viewer.camera.setView({ destination: Cartesian3.fromDegrees(START_VIEW.lon, START_VIEW.lat, START_VIEW.height) });

  // While world terrain loads, Cesium parks `terrainProvider` at undefined (a placeholder), so "not the flat ellipsoid" is not enough
  const hasTerrain = (): boolean => {
    const p = viewer.terrainProvider as TerrainProvider | undefined;
    return Boolean(p) && !(p instanceof EllipsoidTerrainProvider);
  };
  const groundEllipsoid = async (lat: number, lon: number): Promise<number | undefined> => {
    await Promise.race([terrainSettled, new Promise((r) => setTimeout(r, 5000))]); // a lookup right after start waits for terrain
    if (!hasTerrain()) return undefined;
    try {
      const [c] = await sampleTerrainMostDetailed(viewer.terrainProvider, [Cartographic.fromDegrees(lon, lat)]);
      return c && Number.isFinite(c.height) ? c.height : undefined;
    } catch (e) {
      const err = e as Error | undefined;
      console.warn('terrain height lookup failed', lat, lon, `${err?.name}: ${err?.message ?? String(e)}`); // a warning, not an error: callers show "--"
      return undefined;
    }
  };
  const flyToPlace = async (lat: number, lon: number, range: number): Promise<void> => {
    const h = (await groundEllipsoid(lat, lon)) ?? 0; // terrain-aware: a 4 km valley must not put the camera underground
    await viewFrom(viewer, { lat, lon, h }, 0, globe.topDown ? -90 : OBLIQUE_PITCH, range, groundEllipsoid);
  };

  // OSM Buildings: loaded on first use, with a small tile cache (the default is 512 MB) for this 7 GB laptop
  let buildings: Cesium3DTileset | undefined;
  let buildingsLoad: Promise<Cesium3DTileset> | undefined;
  let wantBuildings = false;
  const tileHasImagery = new Map<string, boolean>(); // finestImagery's cache: "level/x/y" -> real imagery there

  const globe: Globe = {
    viewer,
    hasToken: Boolean(token),
    topDown: false,
    hasTerrain,
    setTerrain(on) {
      if (!worldTerrain) return;
      viewer.terrainProvider = on ? worldTerrain : flat;
      requestRender();
    },
    setLayer(layer) {
      satellite.show = layer === 'satellite';
      s2.show = layer === 's2';
      streets.show = layer === 'streets';
      requestRender();
    },
    imagerySource(layer) {
      if (layer === 's2') return 'Sentinel-2 cloudless by EOX · a 2025 mosaic of summer-like images (months not published) · 10 m per pixel: coarse, no buildings';
      if (layer === 'streets') return 'OpenStreetMap standard map · a drawn map, not imagery';
      if (!token) return 'Natural Earth II, the offline map bundled with Cesium · a shaded-relief picture, not satellite photos';
      // ponytail: Cesium keeps the ion asset's real source in a private field; if ion swaps Bing for its announced
      // replacement, the label falls back to the generic name and the credits bar names the new providers
      const inner = (satellite.ready ? (satellite.imageryProvider as unknown as { _imageryProvider?: unknown })._imageryProvider : undefined);
      return `${inner instanceof BingMapsImageryProvider ? 'Bing Maps Aerial' : 'World imagery'} via Cesium ion · capture date not published by this source`;
    },
    async finestImagery(lat, lon) {
      if (!token || !satellite.ready) return undefined;
      const provider = satellite.imageryProvider;
      const c = Cartographic.fromDegrees(lon, lat);
      for (let level = 21; level >= 17; level--) {
        const xy = provider.tilingScheme.positionToTileXY(c, level);
        const key = `${level}/${xy.x}/${xy.y}`;
        let has = tileHasImagery.get(key);
        if (has === undefined) {
          const image = await provider.requestImage(xy.x, xy.y, level); // no Request object: not throttled
          if (image === undefined) throw new Error('imagery request was not made');
          has = !(provider.tileDiscardPolicy?.shouldDiscardImage(image as HTMLImageElement) ?? false);
          tileHasImagery.set(key, has);
        }
        if (has) return { level, cmPerPixel: Math.round((15654303.4 * Math.cos((lat * Math.PI) / 180)) / 2 ** level) };
      }
      return undefined;
    },
    terrainDetail(lat, lon) {
      const p = viewer.terrainProvider as TerrainProvider | undefined;
      const level = hasTerrain() ? p?.availability?.computeMaximumLevelAtPosition(Cartographic.fromDegrees(lon, lat)) : undefined;
      // a level-L tile spans 180/2^L degrees with about 64 height points across: north-south spacing, the P1.6.3 estimate
      return level === undefined ? undefined : { level, spacingM: Math.round(((180 / 2 ** level) * 111_320) / 64) };
    },
    imageryReady: new Promise<void>((resolve) => {
      if (!token) return resolve();
      satellite.readyEvent.addEventListener(() => resolve());
      satellite.errorEvent.addEventListener(() => resolve());
    }),
    groundEllipsoid,
    async groundMsl(lat, lon) {
      const h = await groundEllipsoid(lat, lon);
      return h === undefined ? undefined : ellipsoidToMsl(lat, lon, h);
    },
    async groundMslMany(points) {
      await Promise.race([terrainSettled, new Promise((r) => setTimeout(r, 5000))]);
      if (!hasTerrain()) return points.map(() => undefined);
      const cs = await sampleTerrainMostDetailed(viewer.terrainProvider, points.map((p) => Cartographic.fromDegrees(p.lon, p.lat)));
      return cs.map((c, i) => (Number.isFinite(c.height) ? ellipsoidToMsl(points[i].lat, points[i].lon, c.height) : undefined));
    },
    flyToPlace,
    async flyToBox([south, north, west, east]) {
      const midLat = (south + north) / 2;
      const extent = Math.max((north - south) * 111_320, (east - west) * 111_320 * Math.cos((midLat * Math.PI) / 180)); // metres
      await flyToPlace(midLat, (west + east) / 2, Math.max(extent * 0.9, 800)); // 0.9 x width fits it in the default 60 degree view
    },
    async setBuildings(on) {
      wantBuildings = on;
      if (on && !buildings) {
        buildingsLoad ??= createOsmBuildingsAsync().then((t) => {
          t.cacheBytes = 64 * 1024 * 1024; // 128 + 64 MB held 322 MB of JS heap after five dense cities (P1.10.3)
          t.maximumCacheOverflowBytes = 32 * 1024 * 1024;
          return (buildings = viewer.scene.primitives.add(t) as Cesium3DTileset);
        });
        try {
          await buildingsLoad;
        } catch (e) {
          buildingsLoad = undefined; // let the next toggle try again
          throw e;
        }
      }
      if (buildings) buildings.show = wantBuildings; // the latest toggle wins if it changed while loading
      requestRender();
    },
    buildings: () => buildings,
  };
  return globe;
}

/** Calls onSlow(true) when tiles have been loading for 8 s, and onSlow(false) when they finish. */
export function watchTiles(viewer: Viewer, onSlow: (slow: boolean) => void): void {
  let since = 0;
  let slow = false;
  setInterval(() => {
    if (document.hidden) return; // a background tab stops drawing, which would look like a stall
    if (viewer.scene.globe.tilesLoaded) {
      since = 0;
      if (slow) onSlow((slow = false));
      return;
    }
    since ||= Date.now();
    if (!slow && Date.now() - since > 8000) onSlow((slow = true));
  }, 1000);
}
