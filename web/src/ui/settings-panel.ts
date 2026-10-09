import { settings, updateSettings } from './settings';
import type { CoordFormat, Units } from './settings';

/** The Settings panel (plan p.8): map-data token, Mapillary token, units, coordinate format. Returns a function that opens or closes it. */
export function mountSettingsPanel(tr: HTMLElement): () => void {
  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <div class="row between"><b>Settings</b><button class="btn" id="settings-close" aria-label="Close">×</button></div>
    <label class="col">Cesium ion token
      <input class="in" id="token-input" type="password" autocomplete="off" placeholder="paste an access token">
    </label>
    <div class="row"><button class="btn" id="token-save">Save token and reload</button><button class="btn" id="token-clear">Clear saved token</button></div>
    <p class="muted" id="token-state"></p>
    <label class="col">Mapillary client token (360 view)
      <input class="in" id="mly-token-input" type="password" autocomplete="off" placeholder="free from mapillary.com/dashboard/developers">
    </label>
    <div class="row"><button class="btn" id="mly-token-save">Save and reload</button><button class="btn" id="mly-token-clear">Clear</button></div>
    <p class="muted" id="mly-token-state"></p>
    <label class="row">Units
      <select class="in" id="units"><option value="m">Meters</option><option value="ft">Feet</option></select>
    </label>
    <label class="row">Coordinates
      <select class="in" id="coord-format"><option value="dec">Decimal degrees</option><option value="dms">Degrees, minutes, seconds</option></select>
    </label>`;
  tr.append(panel);
  const q = <T extends HTMLElement>(sel: string): T => panel.querySelector<T>(sel)!;
  const toggle = (): void => {
    panel.classList.toggle('hidden');
    q('#token-state').textContent = settings.ionToken
      ? 'A token is saved in this browser. It is never shown again.'
      : 'No token saved here: the token from web/.env.local is used, if there is one. It stays in this browser only.';
    q('#mly-token-state').textContent = settings.mapillaryToken
      ? 'A Mapillary token is saved in this browser. It is never shown again.'
      : 'None saved here: VITE_MAPILLARY_TOKEN from web/.env.local is used, if there is one.';
  };
  q('#settings-close').addEventListener('click', () => panel.classList.add('hidden'));
  q<HTMLSelectElement>('#units').value = settings.units;
  q<HTMLSelectElement>('#coord-format').value = settings.coordFormat;
  q<HTMLSelectElement>('#units').addEventListener('change', (e) => updateSettings({ units: (e.target as HTMLSelectElement).value as Units }));
  q<HTMLSelectElement>('#coord-format').addEventListener('change', (e) => updateSettings({ coordFormat: (e.target as HTMLSelectElement).value as CoordFormat }));
  q('#token-save').addEventListener('click', () => {
    const v = q<HTMLInputElement>('#token-input').value.trim();
    if (!v) return;
    updateSettings({ ionToken: v });
    location.reload(); // the globe is built once with its token
  });
  q('#token-clear').addEventListener('click', () => {
    updateSettings({ ionToken: '' });
    location.reload();
  });
  q('#mly-token-save').addEventListener('click', () => {
    const v = q<HTMLInputElement>('#mly-token-input').value.trim();
    if (!v) return;
    updateSettings({ mapillaryToken: v });
    location.reload(); // the 360 provider is built once with its token
  });
  q('#mly-token-clear').addEventListener('click', () => {
    updateSettings({ mapillaryToken: '' });
    location.reload();
  });
  return toggle;
}
