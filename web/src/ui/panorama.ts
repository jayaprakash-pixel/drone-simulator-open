import { Cartesian3, Color, ConstantPositionProperty, ConstantProperty, HeightReference } from 'cesium';
import { moveLatLon } from '../globe/camera';
import type { Globe } from '../globe/viewer';
import { PanoError, distanceM } from '../panorama/provider';
import type { Found, Pano, PanoFailure, PanoramaProvider } from '../panorama/provider';
import { button } from './layout';
import { clearNotice, showNotice } from './notices';

const NEAR_M = 100; // "Enter place" opens an image this close to the clicked point
const SEARCH_M = 1000; // otherwise it says how far the nearest one is, up to here
const ARROW_M = 25; // length of the view-direction line on the globe

const FAILURES: Record<PanoFailure, string> = {
  'no-token': 'The 360 view needs a free Mapillary client token: add it in Settings (or in web/.env.local as VITE_MAPILLARY_TOKEN). Until then, Stand here shows the place in 3D.',
  'bad-token': 'Mapillary rejected the token. Check the Mapillary token in Settings.',
  'rate-limit': 'Mapillary is limiting requests right now. Wait a minute and try again.',
  offline: 'No connection to Mapillary: the 360 view needs the internet.',
  'provider-error': 'Mapillary did not answer properly. Try again later.',
  viewer: 'The 360 viewer could not show this image. Try another point, or Stand here.',
};

const dateLabel = (ms: number): string => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const metres = (m: number): string => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const kindLabel = (p: Pano): string => (p.is360 ? '360° panorama' : 'flat photo, not 360°');

export interface PanoramaUi {
  /** Finds the nearest street-level image to a clicked point and opens it, or explains in `out` why not. */
  enterPlace(lat: number, lon: number, out: HTMLElement): Promise<void>;
  /** Opens an image from another provider (My photos) in the same full-screen view, measured from lat/lon. */
  openFrom(from: PanoramaProvider, found: Found, lat: number, lon: number): Promise<void>;
  close(): void;
  isOpen(): boolean;
}

/**
 * The full-screen 360 view: Back to globe (or Esc) closes it; capture date, distance from the clicked point, provider
 * and attribution stay on screen; a marker on the globe shows where the image was taken and which way you look.
 */
export function mountPanorama(
  globe: Globe,
  provider: PanoramaProvider,
  actions: { standHere(lat: number, lon: number): void; lookAround(lat: number, lon: number): void },
): PanoramaUi {
  const { viewer } = globe;
  const overlay = document.createElement('div');
  overlay.id = 'pano-view';
  overlay.className = 'pano hidden';
  overlay.innerHTML = `
    <div id="pano-canvas"></div>
    <div id="pano-loading" class="pano-loading">Loading the image…</div>
    <div class="pano-bar panel">
      <div class="row"><button class="btn" id="pano-back">Back to globe (Esc)</button><span id="pano-info"></span></div>
      <div id="pano-attrib" class="muted"></div>
    </div>`;
  document.body.append(overlay);
  const q = (sel: string): HTMLElement => overlay.querySelector<HTMLElement>(sel)!;
  const canvas = q('#pano-canvas');
  let open = false;
  let clicked = { lat: 0, lon: 0 };
  let current = provider; // the provider of the image on screen: Mapillary, or My photos

  // The marker is updated in place on every turn, but the globe behind the full-screen view is only redrawn on close:
  // drawing it on every bearing event would double the GPU work while you look around.
  const marker = (pano: Pano, bearing: number): void => {
    const tip = moveLatLon(pano.lat, pano.lon, ARROW_M * Math.sin((bearing * Math.PI) / 180), ARROW_M * Math.cos((bearing * Math.PI) / 180));
    const position = Cartesian3.fromDegrees(pano.lon, pano.lat);
    const positions = Cartesian3.fromDegreesArray([pano.lon, pano.lat, tip.lon, tip.lat]);
    const e = viewer.entities.getById('pano');
    if (e?.polyline) {
      e.position = new ConstantPositionProperty(position);
      e.polyline.positions = new ConstantProperty(positions);
      return;
    }
    viewer.entities.add({
      id: 'pano',
      position,
      point: { pixelSize: 11, color: Color.CYAN, outlineColor: Color.BLACK, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      polyline: { positions, clampToGround: true, width: 4, material: Color.CYAN },
    });
  };

  const onView = (pano: Pano, bearing: number): void => {
    q('#pano-loading').classList.add('hidden');
    const distance = distanceM(clicked.lat, clicked.lon, pano.lat, pano.lon);
    q('#pano-info').textContent = `${current.name} · ${kindLabel(pano)} · captured ${dateLabel(pano.capturedAt)} · ${metres(distance)} from the clicked point`;
    q('#pano-attrib').textContent = pano.attribution ?? `${current.attribution}${pano.creator ? ` · image by ${pano.creator}` : ''}`;
    marker(pano, bearing);
  };

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation(); // capture phase: Esc closes the 360 view only, not Stand here underneath
    close();
  };

  function close(): void {
    if (!open) return;
    open = false;
    current.close();
    overlay.classList.add('hidden');
    window.removeEventListener('keydown', onKey, true);
    viewer.scene.requestRender();
  }
  q('#pano-back').addEventListener('click', close);

  const fail = (e: unknown): void => {
    const kind: PanoFailure = e instanceof PanoError ? e.kind : 'provider-error';
    if (!(e instanceof PanoError)) console.warn('360 view:', e); // unexpected: keep the details for debugging, show the plain message
    showNotice(`pano-${kind}`, FAILURES[kind], kind === 'no-token' ? 'info' : 'error');
  };

  async function show(found: Found, from: PanoramaProvider = provider): Promise<void> {
    if (open) close();
    current = from;
    open = true;
    overlay.classList.remove('hidden');
    q('#pano-loading').classList.remove('hidden');
    q('#pano-info').textContent = `${current.name} · ${kindLabel(found.pano)} · ${metres(found.distance)} from the clicked point`;
    q('#pano-attrib').textContent = found.pano.attribution ?? current.attribution;
    window.addEventListener('keydown', onKey, true);
    try {
      await current.open(canvas, found.pano, onView);
    } catch (e) {
      if (!open) return; // closed while loading: not a failure
      close();
      fail(e instanceof PanoError ? e : new PanoError('viewer', String(e)));
    }
  }

  async function enterPlace(lat: number, lon: number, out: HTMLElement): Promise<void> {
    for (const k of Object.keys(FAILURES)) clearNotice(`pano-${k}`);
    clicked = { lat, lon };
    out.replaceChildren('Looking for street-level images near this point…');
    try {
      // only a true 360 opens straight away; otherwise say what there is and offer the 3D views
      const near = await provider.findNearest(lat, lon, NEAR_M);
      if (near?.pano.is360) {
        out.replaceChildren();
        return await show(near);
      }
      const nearest = near ?? (await provider.findNearest(lat, lon, SEARCH_M));
      const msg = document.createElement('p');
      msg.id = 'pano-none';
      msg.textContent = !nearest
        ? `No street-level images within ${metres(SEARCH_M)} of this point (${provider.name}).`
        : near
          ? `No true 360 panorama within ${NEAR_M} m of this point. The nearest image is a flat photo ${metres(near.distance)} away (${provider.name}).`
          : `No street-level image within ${NEAR_M} m of this point. The nearest is ${metres(nearest.distance)} away (${kindLabel(nearest.pano)}, ${provider.name}).`;
      const row = document.createElement('div');
      row.className = 'row';
      if (nearest) row.append(button('Go to nearest', 'pano-go-nearest', () => void show(nearest)));
      row.append(
        button('Look around from 100 m', 'pano-look-around', () => actions.lookAround(lat, lon)),
        button('Stand here in 3D instead', 'pano-stand-instead', () => actions.standHere(lat, lon)),
      );
      out.replaceChildren(msg, row);
    } catch (e) {
      out.replaceChildren();
      fail(e);
    }
  }

  return {
    enterPlace,
    openFrom(from, found, lat, lon) {
      clicked = { lat, lon };
      return show(found, from);
    },
    close,
    isOpen: () => open,
  };
}
