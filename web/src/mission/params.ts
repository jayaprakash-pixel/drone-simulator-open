// Parameter profile (P3.4): read the whitelisted parameters from the drone, edit, save and load named profiles (this
// browser) or .param files, apply them to the drone, and export a .param file. Only data/param-whitelist.json names
// ever leave or enter: return height, speeds, geofence, failsafe actions and flight modes (owner rule 2026-10-09).
// Never SIM_* values, frame or motor settings, sensor calibration, tuning (PID) or the simulator-shaped battery capacity.
import type { Command, CommandAck } from '../net/contract';
import { WHITELIST } from '../net/contract';
import { REHEARSAL_NOTICE } from '../ui/layout';

export type Profile = Record<string, number>;
const KEY = 'dw.paramProfiles';
export const WHY = 'Only these settings are exported: return height, speed limits, geofence, failsafe actions and flight modes, from ArduPilot\'s parameter list. Simulator settings (SIM_*), frame and motor settings, sensor calibration, tuning (PID) and the battery capacity are never exported: they belong to the simulator, or a real drone must have its own.';

/** ArduPilot .param text (NAME,VALUE per line, as Mission Planner writes it), with the notice and header comments. */
export function toParamFile(p: Profile, when = new Date()): string {
  return [
    `# ${REHEARSAL_NOTICE}`,
    '# The real drone needs its own checks, tuning and calibration: these values come from a simulator rehearsal.',
    `# Drone World Simulator parameter profile, ${when.toISOString().slice(0, 10)}; whitelisted settings only (see data/param-whitelist.json).`,
    ...WHITELIST.filter((w) => w.name in p).map((w) => `${w.name},${p[w.name]}`),
  ].join('\n') + '\n';
}

/** Reads a .param file (NAME,VALUE or NAME VALUE or NAME<tab>VALUE; # comments). Off-whitelist or out-of-range names are left out and listed. */
export function fromParamFile(text: string): { profile: Profile; ignored: string[] } {
  const profile: Profile = {}, ignored: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [name, value] = line.split(/[,\s]+/);
    const w = WHITELIST.find((x) => x.name === name);
    const v = Number(value);
    if (!w || !Number.isFinite(v) || v < w.min || v > w.max) ignored.push(name);
    else profile[name] = v;
  }
  return { profile, ignored };
}

const saved = (): Record<string, Profile> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
};

export function mountParams(host: HTMLElement, ask: (cmd: Omit<Command, 'type' | 'id'>) => Promise<CommandAck>): { current(): Profile } {
  let profile: Profile = {};
  const panel = document.createElement('div');
  panel.id = 'params';
  panel.className = 'panel';
  panel.innerHTML = `<details><summary><b>Parameters</b></summary>
    <div class="muted" id="params-why"></div>
    <div class="row"><button class="btn" id="params-read">Read from drone</button><button class="btn" id="params-apply">Apply to drone</button></div>
    <div class="row"><input class="in" id="params-name" placeholder="Profile name"><button class="btn" id="params-save">Save</button>
      <select class="in" id="params-saved" aria-label="Saved profiles"><option value="">Load saved…</option></select></div>
    <div class="row"><button class="btn" id="params-export">Export .param</button><label class="btn">Load .param<input type="file" id="params-file" accept=".param,.parm,.txt" hidden></label></div>
    <div id="params-status" class="muted" role="status"></div>
    <table id="params-table" class="mono"></table></details>`;
  host.append(panel);
  const $ = <T extends HTMLElement>(id: string): T => panel.querySelector<T>(`#${id}`)!;
  $('params-why').textContent = WHY;
  const status = (t: string): void => void ($('params-status').textContent = t);
  const fillSaved = (): void => {
    $('params-saved').replaceChildren(new Option('Load saved…', ''), ...Object.keys(saved()).map((n) => new Option(n, n)));
  };
  const table = (): void => {
    $('params-table').replaceChildren(...WHITELIST.filter((w) => w.name in profile).map((w) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td title="${w.title}">${w.name}</td><td><input class="in" type="number" min="${w.min}" max="${w.max}" step="any" value="${profile[w.name]}" style="width:6em" aria-label="${w.name}"></td><td class="muted">${w.units}</td>`;
      const input = tr.querySelector('input')!;
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (v >= w.min && v <= w.max) profile[w.name] = v;
        else input.value = String(profile[w.name]); // outside ArduPilot's documented range: back to the last good value
      });
      return tr;
    }));
  };
  fillSaved();

  $('params-read').addEventListener('click', async () => {
    status('Reading from the drone…');
    const a = await ask({ command: 'params' });
    if (!a.ok || !a.values) return status(`Read: ${a.reason || 'no values'}`);
    profile = a.values;
    table();
    status(`Read ${Object.keys(profile).length} settings from the drone.`);
  });
  $('params-apply').addEventListener('click', async () => {
    if (!Object.keys(profile).length) return status('Nothing to apply: read from the drone or load a profile first.');
    status('Applying to the drone…');
    const a = await ask({ command: 'params', values: profile });
    status(a.ok ? `Applied ${Object.keys(profile).length} settings; each read back equal.` : `Apply: ${a.reason}`);
  });
  $('params-save').addEventListener('click', () => {
    const name = $<HTMLInputElement>('params-name').value.trim();
    if (!name || !Object.keys(profile).length) return status('Give the profile a name, and read or load values first.');
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...saved(), [name]: profile }));
    } catch {
      return status('The browser blocked saving; export a .param file instead.');
    }
    fillSaved();
    status(`Saved "${name}".`);
  });
  $<HTMLSelectElement>('params-saved').addEventListener('change', (e) => {
    const name = (e.target as HTMLSelectElement).value;
    if (!name) return;
    profile = { ...saved()[name] };
    table();
    status(`Loaded "${name}" (${Object.keys(profile).length} settings). Apply to drone to use it.`);
  });
  $('params-export').addEventListener('click', () => {
    if (!Object.keys(profile).length) return status('Nothing to export: read from the drone or load a profile first.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toParamFile(profile)], { type: 'text/plain' }));
    a.download = `drone-profile-${new Date().toISOString().slice(0, 10)}.param`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status(`Exported ${Object.keys(profile).length} settings. ${WHY}`);
  });
  $<HTMLInputElement>('params-file').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { profile: p, ignored } = fromParamFile(await file.text());
    profile = p;
    table();
    status(`Loaded ${Object.keys(p).length} settings from ${file.name}.${ignored.length ? ` Left out (not on the list, or out of range): ${ignored.join(', ')}.` : ''} Apply to drone to use it.`);
  });
  return { current: () => ({ ...profile }) };
}

