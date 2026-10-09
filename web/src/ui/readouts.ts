import { Math as CesiumMath } from 'cesium';
import { OBLIQUE_PITCH, TILT_STEP, TURN_STEP, headingLabel, orbitCentre } from '../globe/camera';
import { ellipsoidToMsl, formatAltitude, formatLatLon } from '../globe/coords';
import { pickGround } from '../globe/picking';
import type { Globe } from '../globe/viewer';
import { button } from './layout';
import type { Regions } from './layout';
import { onSettings, settings, updateSettings } from './settings';

/**
 * Bottom-left: lat/lon/elevation under the cursor. Bottom-right: camera height and heading, the camera tools (reset
 * north, turn, tilt, top-down, a gesture hint) and frames per second.
 */
export function mountReadouts(regions: Regions, globe: Globe): void {
  const { viewer } = globe;
  const canvas = viewer.scene.canvas;

  const cursor = document.createElement('div');
  cursor.id = 'cursor-readout';
  cursor.className = 'panel mono';
  regions.bl.append(cursor);
  let last: { lat: number; lon: number; msl?: number } | null = null;
  const paintCursor = (): void => {
    if (!last) {
      cursor.textContent = 'Cursor: --';
      return;
    }
    const ground = last.msl === undefined ? '--' : formatAltitude({ m: last.msl, type: 'msl' }, settings.units);
    cursor.textContent = `Cursor ${formatLatLon(last.lat, last.lon, settings.coordFormat)} · ground ${ground}`;
  };
  let stamp = 0;
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.timeStamp - stamp < 50) return; // at most ~20 updates a second
    stamp = ev.timeStamp;
    const g = pickGround(viewer, ev.offsetX, ev.offsetY);
    last = g ? { lat: g.lat, lon: g.lon, msl: globe.hasTerrain() ? ellipsoidToMsl(g.lat, g.lon, g.hEllipsoid) : undefined } : null;
    paintCursor();
  });
  canvas.addEventListener('pointerleave', () => {
    last = null;
    paintCursor();
  });
  paintCursor();

  const camera = document.createElement('div');
  camera.id = 'camera-readout';
  camera.className = 'panel mono';
  const fps = document.createElement('div');
  fps.id = 'fps';
  fps.className = 'panel mono';
  // camera tools; hidden while standing (Stand here has its own look and walk controls)
  const tools = document.createElement('div');
  tools.id = 'camera-tools';
  tools.className = 'panel';
  const pitchDeg = (): number => CesiumMath.toDegrees(viewer.camera.pitch);
  const row = document.createElement('div');
  row.className = 'row';
  row.append(
    button('Reset north', 'reset-north', () => {
      viewer.camera.setView({ orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 } });
      viewer.scene.requestRender();
    }),
    button('Turn left', 'turn-left', () => void orbitCentre(viewer, -TURN_STEP)),
    button('Turn right', 'turn-right', () => void orbitCentre(viewer, TURN_STEP)),
    button('Tilt up', 'tilt-up', () => void orbitCentre(viewer, 0, pitchDeg() + TILT_STEP)),
    button('Tilt down', 'tilt-down', () => void orbitCentre(viewer, 0, pitchDeg() - TILT_STEP)),
  );
  const topDown = document.createElement('label');
  topDown.className = 'row';
  topDown.innerHTML = '<input type="checkbox" id="top-down"> Top-down';
  const topBox = topDown.querySelector('input')!;
  topBox.checked = globe.topDown = settings.topDown;
  topBox.addEventListener('change', () => {
    updateSettings({ topDown: topBox.checked });
    globe.topDown = topBox.checked;
    void orbitCentre(viewer, 0, topBox.checked ? -90 : OBLIQUE_PITCH);
  });
  const hint = document.createElement('div');
  hint.id = 'gesture-hint';
  hint.className = 'muted';
  hint.textContent = 'Drag: move · wheel: zoom · Ctrl+drag or middle-drag: tilt and turn';
  row.append(topDown);
  tools.append(row, hint);
  regions.br.append(camera, tools, fps);
  const paintCamera = (): void => {
    const c = viewer.camera.positionCartographic;
    const terrain = globe.hasTerrain();
    const ground = terrain ? (viewer.scene.globe.getHeight(c) ?? 0) : 0;
    // above real terrain this is height above ground (AGL); with no terrain it can only be height above the ellipsoid
    camera.textContent = `Camera ${formatAltitude({ m: c.height - ground, type: terrain ? 'agl' : 'ellipsoid' }, settings.units)} · heading ${headingLabel(viewer.camera.heading)}°`;
  };
  let frames = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  viewer.scene.postRender.addEventListener(() => {
    frames++;
    pending ??= setTimeout(() => {
      pending = undefined;
      paintCamera(); // trailing update, so the readout always shows where the camera finally stopped
    }, 150);
  });
  setInterval(() => {
    fps.textContent = frames === 0 ? 'FPS 0 (idle)' : `FPS ${frames}`;
    frames = 0;
  }, 1000);
  paintCamera();
  onSettings(() => {
    paintCursor();
    paintCamera();
  });
}
