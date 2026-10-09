// 360 coverage near the camera (P1.12.4): dots where the panorama provider has true 360 images, so you can see where
// Enter place (360) will work. Only below COVERAGE_MAX_M above the ground; a 3 x 3 grid of TILE_DEG tiles around the
// screen centre, asked for when the camera stops, cached (CACHE_TILES). Method (decisions.md 2026-10-09): Mapillary's
// Search API with is_pano=true, the JSON search the app already uses; its documented coverage vector tiles would need a
// tile decoder this app does not have (upgrade path). Terms: data from the API must be attributed to Mapillary.
import { Cartesian3, Cartographic, Color, Math as CesiumMath, PointPrimitiveCollection } from 'cesium';
import { pickGround } from '../globe/picking';
import type { Globe } from '../globe/viewer';
import { PanoError } from '../panorama/provider';
import type { PanoramaProvider } from '../panorama/provider';

export const COVERAGE_MAX_M = 3000;
export const TILE_DEG = 0.005; // about 550 m of latitude
const CACHE_TILES = 64;

const FAIL: Record<string, string> = {
  'no-token': '360 coverage needs a free Mapillary token (Settings).',
  'bad-token': 'Mapillary rejected the token; check it in Settings.',
  'rate-limit': 'Mapillary is limiting requests right now; the 360 dots will come back in a minute.',
  offline: '360 coverage needs the internet; no connection to Mapillary.',
};

export function mountCoverage(host: HTMLElement, globe: Globe, provider: PanoramaProvider): { update(): Promise<void>; count(): number } {
  const { viewer } = globe;
  const panel = document.createElement('div');
  panel.id = 'coverage';
  panel.className = 'panel';
  panel.innerHTML = `<label class="row"><input type="checkbox" id="coverage-toggle"> 360 coverage near the camera</label>
    <div id="coverage-status" class="muted"></div>
    <div id="coverage-credit" class="muted hidden">Coverage data: ${[
      /Mapillary/.test(provider.name) ? '<a href="https://www.mapillary.com" target="_blank" rel="noopener">© Mapillary</a>, CC BY-SA' : '',
      /Panoramax/.test(provider.name) ? '<a href="https://panoramax.fr" target="_blank" rel="noopener">Panoramax</a> contributors (licence per picture)' : '',
    ].filter(Boolean).join('; ') || provider.attribution}</div>`;
  host.append(panel);
  const toggle = panel.querySelector<HTMLInputElement>('#coverage-toggle')!;
  const status = (t: string): void => void (panel.querySelector('#coverage-status')!.textContent = t);
  const points = viewer.scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection;
  const cache = new Map<string, { lat: number; lon: number }[]>();
  let seq = 0;

  const draw = (dots: { lat: number; lon: number }[]): void => {
    points.removeAll();
    for (const d of dots) {
      const h = viewer.scene.globe.getHeight(Cartographic.fromDegrees(d.lon, d.lat)) ?? 0;
      points.add({ position: Cartesian3.fromDegrees(d.lon, d.lat, h + 1), pixelSize: 7, color: Color.CYAN, outlineColor: Color.BLACK, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY });
    }
    viewer.scene.requestRender();
  };

  async function update(): Promise<void> {
    const mine = ++seq;
    panel.querySelector('#coverage-credit')!.classList.toggle('hidden', !toggle.checked);
    if (!toggle.checked) return void (draw([]), status(''));
    const c = viewer.camera.positionCartographic;
    const ground = viewer.scene.globe.getHeight(c) ?? 0;
    if (c.height - ground > COVERAGE_MAX_M) return void (draw([]), status(`Zoom in below ${COVERAGE_MAX_M / 1000} km to see where 360 images are.`));
    const canvas = viewer.scene.canvas;
    const centre = pickGround(viewer, canvas.clientWidth / 2, canvas.clientHeight / 2) ?? { lat: CesiumMath.toDegrees(c.latitude), lon: CesiumMath.toDegrees(c.longitude) };
    const [ty, tx] = [Math.floor(centre.lat / TILE_DEG), Math.floor(centre.lon / TILE_DEG)];
    const keys: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) keys.push([ty + dy, tx + dx]);
    status('Looking for 360 images around here…');
    try {
      const tiles = await Promise.all(keys.map(async ([y, x]) => {
        const k = `${y}/${x}`;
        if (!cache.has(k)) {
          cache.set(k, (await provider.panosIn!([x * TILE_DEG, y * TILE_DEG, (x + 1) * TILE_DEG, (y + 1) * TILE_DEG])));
          if (cache.size > CACHE_TILES) cache.delete(cache.keys().next().value!); // oldest first
        }
        return cache.get(k)!;
      }));
      if (mine !== seq) return; // the camera moved on
      const dots = tiles.flat();
      draw(dots);
      status(dots.length
        ? `${dots.length} true 360 images around here (cyan dots, ${provider.name}): Enter place (360) works near them.`
        : `No 360 images found by ${provider.name} around here. Enter place (360) will offer flat photos or the 3D view instead.`);
    } catch (e) {
      if (mine !== seq) return;
      draw([]);
      status(FAIL[e instanceof PanoError ? e.kind : ''] ?? `${provider.name} did not answer; the 360 dots could not be loaded.`);
    }
  }

  if (!provider.panosIn) toggle.disabled = true;
  toggle.addEventListener('change', () => void update());
  viewer.camera.moveEnd.addEventListener(() => void update());
  return { update, count: () => points.length };
}

