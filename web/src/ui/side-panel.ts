import { Cartesian2, Cartesian3, Color, HeightReference, ScreenSpaceEventType } from 'cesium';
import { TOWN_RANGE } from '../globe/camera';
import { formatAltitude, formatDecimal, formatLatLon } from '../globe/coords';
import { pickGround } from '../globe/picking';
import type { Globe } from '../globe/viewer';
import { planning } from '../mission/editor';
import { addPlace } from './places';
import { onSettings, settings } from './settings';

const HOME_KEY = 'dw.home';

function loadHome(): { lat: number; lon: number } | null {
  try {
    const h = JSON.parse(localStorage.getItem(HOME_KEY) ?? 'null');
    return h && Number.isFinite(h.lat) && Number.isFinite(h.lon) ? h : null;
  } catch {
    return null;
  }
}

export interface PointActions {
  standHere(lat: number, lon: number): void;
  /** looks for a street-level image near the point; messages go into `out` */
  enterPlace(lat: number, lon: number, out: HTMLElement): void;
  /** lists your own 360 photos nearest this point; messages go into `out` */
  myPhotos(lat: number, lon: number, out: HTMLElement): void;
  /** fills `box` with what is known about this point (imagery, buildings, photos, terrain) */
  whatIsHere(lat: number, lon: number, box: HTMLElement): void;
  /** starts the simulator with its home here (ground height MSL from the terrain); progress goes into `out` */
  placeDrone(lat: number, lon: number, groundMsl: number, out: HTMLElement): void;
}

/**
 * Click the ground: marker plus a right-hand panel with coordinates, ground elevation, Stand here, Enter place (360),
 * home point, copy and save place.
 */
export function mountSidePanel(side: HTMLElement, globe: Globe, actions: PointActions): void {
  const { viewer } = globe;
  side.innerHTML = `
    <div class="panel" id="side-card">
      <div class="row between"><b>Selected point</b><button class="btn" id="side-close" aria-label="Close">×</button></div>
      <div id="sel-coords" class="mono"></div>
      <div id="sel-elev"></div>
      <div id="whatishere"></div>
      <div class="row"><button class="btn" id="stand-here">Stand here</button><button class="btn" id="enter-place">Enter place (360)</button><button class="btn" id="my-photos">My photos (360)</button></div>
      <div id="pano-result"></div>
      <div class="row"><button class="btn" id="place-drone">Place drone here</button></div>
      <div id="drone-progress" class="muted"></div>
      <div class="row"><button class="btn" id="set-home">Set as home point</button><button class="btn" id="copy-coords">Copy</button></div>
      <div class="row"><input class="in" id="place-name" placeholder="Name this place"><button class="btn" id="save-place">Save place</button></div>
      <div id="sel-status" class="muted"></div>
    </div>`;
  const el = (sel: string): HTMLElement => side.querySelector<HTMLElement>(sel)!;
  const status = (t: string): void => void (el('#sel-status').textContent = t);

  const marker = (id: string, color: Color, text?: string) => ({
    set(lat: number, lon: number): void {
      viewer.entities.removeById(id);
      viewer.entities.add({
        id,
        position: Cartesian3.fromDegrees(lon, lat),
        point: { pixelSize: 12, color, outlineColor: Color.BLACK, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: text
          ? { text, font: '14px system-ui, sans-serif', fillColor: Color.WHITE, showBackground: true, backgroundColor: Color.fromCssColorString('#0f1320').withAlpha(0.85), pixelOffset: new Cartesian2(0, -22), heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY }
          : undefined,
      });
      viewer.scene.requestRender();
    },
    clear(): void {
      viewer.entities.removeById(id);
      viewer.scene.requestRender();
    },
  });
  const selected = marker('selected', Color.YELLOW);
  const home = marker('home', Color.LIME, 'Home');
  const saved = loadHome();
  if (saved) home.set(saved.lat, saved.lon); // the home point survives a reload

  let sel: { lat: number; lon: number } | null = null;
  let elevMsl: number | undefined;
  let elevState: 'none' | 'loading' | 'done' = 'none';
  let seq = 0;
  const paint = (): void => {
    if (!sel) return;
    el('#sel-coords').textContent = formatLatLon(sel.lat, sel.lon, settings.coordFormat);
    el('#sel-elev').textContent =
      !globe.hasTerrain() ? 'Ground elevation: -- (needs terrain: add a Cesium ion token)'
      : elevState === 'loading' ? 'Ground elevation: …'
      : `Ground elevation: ${elevMsl === undefined ? '--' : formatAltitude({ m: elevMsl, type: 'msl' }, settings.units)}`;
  };
  onSettings(paint);

  async function select(lat: number, lon: number): Promise<void> {
    sel = { lat, lon };
    const mine = ++seq;
    selected.set(lat, lon);
    side.classList.remove('hidden');
    status('');
    el('#pano-result').replaceChildren(); // a "no image here" answer belongs to the previous point
    actions.whatIsHere(lat, lon, el('#whatishere'));
    elevMsl = undefined;
    elevState = globe.hasTerrain() ? 'loading' : 'none';
    paint();
    if (elevState === 'none') return;
    const msl = await globe.groundMsl(lat, lon); // most detailed terrain level, not the coarse tile on screen
    if (mine !== seq) return; // a newer click took over
    elevMsl = msl;
    elevState = 'done';
    paint();
  }

  viewer.screenSpaceEventHandler.setInputAction((ev: { position: Cartesian2 }) => {
    if (planning.on) return; // the mission planner owns ground clicks while Plan is on
    const g = pickGround(viewer, ev.position.x, ev.position.y);
    if (g) void select(g.lat, g.lon);
  }, ScreenSpaceEventType.LEFT_CLICK);

  el('#side-close').addEventListener('click', () => {
    sel = null;
    seq++;
    side.classList.add('hidden');
    selected.clear();
  });
  el('#stand-here').addEventListener('click', () => sel && actions.standHere(sel.lat, sel.lon));
  el('#enter-place').addEventListener('click', () => sel && actions.enterPlace(sel.lat, sel.lon, el('#pano-result')));
  el('#my-photos').addEventListener('click', () => sel && actions.myPhotos(sel.lat, sel.lon, el('#pano-result')));
  el('#place-drone').addEventListener('click', () => {
    if (!sel) return;
    if (elevMsl === undefined) {
      el('#drone-progress').textContent = 'The ground height here is not known yet (it needs terrain). Wait for the elevation line, or add a Cesium ion token.';
      return;
    }
    actions.placeDrone(sel.lat, sel.lon, elevMsl, el('#drone-progress'));
  });
  el('#set-home').addEventListener('click', () => {
    if (!sel) return;
    try {
      localStorage.setItem(HOME_KEY, JSON.stringify(sel));
    } catch {
      /* storage blocked: the home point lasts for this page view only */
    }
    home.set(sel.lat, sel.lon);
    status('Home point set.');
  });
  el('#copy-coords').addEventListener('click', async () => {
    if (!sel) return;
    try {
      await navigator.clipboard.writeText(formatDecimal(sel.lat, sel.lon));
      status('Copied.');
    } catch {
      status('The browser blocked copying; select the coordinates by hand.');
    }
  });
  el('#save-place').addEventListener('click', () => {
    if (!sel) return;
    const name = (el('#place-name') as HTMLInputElement).value.trim() || `Place ${formatDecimal(sel.lat, sel.lon)}`;
    addPlace({ name, lat: sel.lat, lon: sel.lon, height: TOWN_RANGE });
    (el('#place-name') as HTMLInputElement).value = '';
    status(`Saved "${name}" to Places.`);
  });
}
