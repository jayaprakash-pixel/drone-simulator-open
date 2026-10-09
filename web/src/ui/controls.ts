import type { Globe } from '../globe/viewer';
import { buildingsNote, useOsmCredit } from './layout';
import { clearNotice, showNotice } from './notices';
import { mountSettingsPanel } from './settings-panel';
import { settings, updateSettings } from './settings';
import type { Layer } from './settings';

/**
 * Top right: layer switch with the active source and its capture date, terrain and 3D buildings on/off, exaggeration
 * slider (always 1x on load), resolution scale, settings.
 */
export function mountControls(tr: HTMLElement, globe: Globe): void {
  const { viewer } = globe;
  const bar = document.createElement('div');
  bar.id = 'controls';
  bar.className = 'panel';
  bar.innerHTML = `
    <div class="row">
      <select class="in" id="layer-select" aria-label="Map layer">
        <option value="satellite">Satellite (Cesium ion)</option>
        <option value="s2">Sentinel-2 2025 (EOX, coarse 10 m)</option>
        <option value="streets">Streets (OpenStreetMap)</option>
      </select>
      <label class="row"><input type="checkbox" id="terrain-toggle"> Terrain</label>
      <label class="row"><input type="checkbox" id="buildings-toggle"> 3D buildings</label>
      <button class="btn" id="open-settings">Settings</button>
    </div>
    <div class="muted" id="imagery-source"></div>
    <div class="row">
      <label class="row">Exaggeration <input type="range" id="exaggeration" min="1" max="5" step="0.5" value="1"> <span id="exag-value">1×</span></label>
      <label class="row">Resolution
        <select class="in" id="quality"><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select>
      </label>
    </div>`;
  tr.append(bar);
  const q = <T extends HTMLElement>(sel: string): T => bar.querySelector<T>(sel)!;

  const layer = q<HTMLSelectElement>('#layer-select');
  layer.value = settings.layer;
  const source = q('#imagery-source');
  const applyLayer = (l: Layer): void => {
    globe.setLayer(l);
    useOsmCredit('streets', l === 'streets');
    source.textContent = globe.imagerySource(l);
  };
  applyLayer(settings.layer);
  void globe.imageryReady.then(() => (source.textContent = globe.imagerySource(settings.layer))); // ion's real source is known once it loads
  layer.addEventListener('change', () => {
    updateSettings({ layer: layer.value as Layer });
    applyLayer(settings.layer);
  });

  const terrain = q<HTMLInputElement>('#terrain-toggle');
  terrain.checked = globe.hasToken;
  terrain.disabled = !globe.hasToken;
  terrain.title = globe.hasToken ? '' : 'Real terrain needs a Cesium ion token';
  terrain.addEventListener('change', () => globe.setTerrain(terrain.checked));

  // Cesium OSM Buildings: OpenStreetMap footprints extruded to their tagged or estimated height
  const buildings = q<HTMLInputElement>('#buildings-toggle');
  buildings.checked = globe.hasToken && settings.buildings;
  buildings.disabled = !globe.hasToken;
  buildings.title = globe.hasToken ? 'OpenStreetMap buildings in 3D (Cesium OSM Buildings); small towns may have few' : '3D buildings need a Cesium ion token';
  const applyBuildings = (on: boolean): Promise<void> =>
    globe.setBuildings(on).then(
      () => {
        clearNotice('buildings-failed');
        buildingsNote(globe.buildings()?.show === true);
      },
      () => {
        buildingsNote(false);
        buildings.checked = false;
        showNotice('buildings-failed', '3D buildings could not load (no internet, or Cesium ion refused the token). The globe works without them.');
      },
    );
  if (buildings.checked) void applyBuildings(true);
  buildings.addEventListener('change', () => {
    updateSettings({ buildings: buildings.checked });
    void applyBuildings(buildings.checked);
  });

  const exaggeration = q<HTMLInputElement>('#exaggeration');
  exaggeration.addEventListener('input', () => {
    viewer.scene.verticalExaggeration = Number(exaggeration.value); // never persisted: 1x on every fresh load
    q('#exag-value').textContent = `${exaggeration.value}×`;
    viewer.scene.requestRender();
  });

  const quality = q<HTMLSelectElement>('#quality');
  quality.value = String(settings.resolutionScale);
  const applyQuality = (): void => {
    viewer.resolutionScale = settings.resolutionScale;
    viewer.scene.requestRender();
  };
  applyQuality();
  quality.addEventListener('change', () => {
    updateSettings({ resolutionScale: Number(quality.value) });
    applyQuality();
  });

  const toggleSettings = mountSettingsPanel(tr);
  q('#open-settings').addEventListener('click', toggleSettings);
}
