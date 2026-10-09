import { compassName } from '../globe/camera';
import { createStandHere } from '../globe/stand';
import type { EnterInfo, EyeMode, StandHere } from '../globe/stand';
import type { Globe } from '../globe/viewer';
import { buildingsNote, button } from './layout';
import type { Regions } from './layout';
import { clearNotice, showNotice } from './notices';

const STAND_MSG =
  'Stand here: your eye is 1.7 m above the ground of a 3D model (terrain about 30 m detail, plus simple OpenStreetMap buildings where they exist) draped with satellite imagery. It is not a photograph. Drag to look around, W A S D or the arrow keys to walk (Shift to run), Esc to go back. Click a building to stand on its roof; walls stop you.';
export const DRONE_DEFAULT_AGL = 100;
const SOFT_BELOW_M = 60; // measured 2026-10-08: Bing stops at level 19 (25-28 cm a pixel) at every Indian test place
const WALL_NOTE_M = 3;

export interface EyeViews {
  stand: StandHere;
  standHere(lat: number, lon: number): void;
  lookAround(lat: number, lon: number): void;
}

/**
 * The two eye views and their on-screen parts: Stand here (notice, close-wall note) and the drone-eye view ("Look around
 * from 100 m": height slider 10-120 m, soft-imagery warning, its own 3D buildings toggle, off by default because the
 * boxes hide the imagery). One Leave button and Esc end either.
 */
export function mountEyeViews(regions: Regions, globe: Globe): EyeViews {
  const panel = document.createElement('div');
  panel.id = 'drone-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <b>3D model view, not a photograph</b>
    <label class="row">Height <input type="range" id="drone-agl" min="10" max="120" step="5" value="${DRONE_DEFAULT_AGL}"> <span id="drone-agl-value" class="mono"></span></label>
    <div id="drone-soft" class="muted hidden">Imagery is enlarged and soft below about ${SOFT_BELOW_M} m here.</div>
    <label class="row"><input type="checkbox" id="drone-buildings"> 3D buildings</label>
    <div class="muted">Drag to look around 360°, W A S D to move, Esc to go back.</div>`;
  regions.br.prepend(panel);
  const q = <T extends HTMLElement>(sel: string): T => panel.querySelector<T>(sel)!;
  const slider = q<HTMLInputElement>('#drone-agl');
  const buildings = q<HTMLInputElement>('#drone-buildings');
  let buildingsBefore = false;

  const setBuildings = (on: boolean): void => {
    void globe.setBuildings(on).then(() => buildingsNote(globe.buildings()?.show === true), () => buildingsNote(false));
  };
  const paintAgl = (): void => {
    const m = Number(slider.value);
    q('#drone-agl-value').textContent = `${m} m AGL`;
    q('#drone-soft').classList.toggle('hidden', m >= SOFT_BELOW_M);
  };
  slider.addEventListener('input', () => {
    paintAgl();
    stand.setAgl(Number(slider.value));
  });
  buildings.addEventListener('change', () => setBuildings(buildings.checked));

  const stand = createStandHere(globe, {
    enter(info: EnterInfo) {
      document.body.classList.add('standing');
      if (info.mode === 'stand') {
        showNotice('standing', STAND_MSG, 'info');
        if (info.wall && info.wall.free < WALL_NOTE_M) showNotice('stand-wall', `Wall ${info.wall.free.toFixed(1)} m ${compassName(info.wall.heading)}`, 'info');
        return;
      }
      panel.classList.remove('hidden');
      buildingsBefore = globe.buildings()?.show === true;
      buildings.checked = false;
      setBuildings(false);
    },
    exit(mode: EyeMode) {
      document.body.classList.remove('standing');
      clearNotice('standing');
      clearNotice('stand-wall');
      if (mode === 'drone') {
        panel.classList.add('hidden');
        setBuildings(buildingsBefore); // the drone view's toggle does not change your normal setting
      }
    },
  });
  regions.br.append(button('Leave this view (Esc)', 'stand-exit', () => stand.exit()));

  return {
    stand,
    standHere: (lat, lon) => void stand.enter(lat, lon),
    lookAround(lat, lon) {
      slider.value = String(DRONE_DEFAULT_AGL);
      paintAgl();
      void stand.enterDrone(lat, lon, DRONE_DEFAULT_AGL);
    },
  };
}
