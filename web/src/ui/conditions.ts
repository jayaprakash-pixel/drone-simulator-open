// Conditions panel (P3.2): wind, GPS quality and battery for the simulated drone. Each choice goes to the bridge as a
// command; the panel shows the autopilot's answer (or its refusal in its own words). Presets live in the bridge
// (bridge/commands.py: WIND, GPS, battery_params) so the app never sets simulator parameters itself.
import type { Command, CommandAck } from '../net/contract';

/** speed and gust of each wind preset, m/s: the same numbers as bridge/commands.py WIND (speed, turbulence) */
export const WIND_MS: Record<string, { speed: number; gust: number }> = { calm: { speed: 0, gust: 0 }, breeze: { speed: 3, gust: 0 }, strong: { speed: 8, gust: 0 }, gusty: { speed: 5, gust: 4 } };

type Ask = (cmd: Omit<Command, 'type' | 'id'>) => Promise<CommandAck>;

export function mountConditions(host: HTMLElement, ask: Ask): { wind(): { speed: number; gust: number }; reset(): void } {
  const panel = document.createElement('div');
  panel.id = 'conditions';
  panel.className = 'panel';
  panel.innerHTML = `<details><summary><b>Conditions</b></summary>
    <label class="row">Wind <select id="cond-wind" class="in">
      <option value="calm">Calm</option><option value="breeze">Light breeze 3 m/s</option>
      <option value="strong">Strong 8 m/s</option><option value="gusty">Gusty 5 m/s, gusts 4 m/s</option></select></label>
    <label class="row">GPS <select id="cond-gps" class="in">
      <option value="good">Good</option><option value="weak">Weak (5 satellites, about 2 m off)</option>
      <option value="dropout">Dropout (no GPS)</option></select></label>
    <div class="row">Battery start <input id="cond-batt-start" class="in" type="number" min="1" max="100" value="100" style="width:4.5em"> %
      drain <input id="cond-batt-drain" class="in" type="number" min="0.1" max="100" step="0.1" value="5" style="width:4.5em"> %/min
      <button class="btn" id="cond-batt-apply">Apply</button></div>
    <div class="muted">Drain is exact at hover (it follows the current drawn). Low battery at 25 % returns home; critical at 10 % lands.</div>
    <div id="cond-status" class="muted" role="status"></div></details>`;
  host.append(panel);
  const $ = <T extends HTMLElement>(id: string): T => panel.querySelector<T>(`#${id}`)!;
  const status = (t: string): void => void ($('cond-status').textContent = t);
  const run = async (what: string, cmd: Omit<Command, 'type' | 'id'>): Promise<boolean> => {
    status(`${what}: asking the autopilot…`);
    const a = await ask(cmd);
    status(a.ok ? `${what}: set.` : `${what}: ${a.reason}`);
    return a.ok;
  };
  let wind = 'calm'; // the wind the drone has: the last choice the autopilot confirmed (unknown counts as strong while asking)
  $<HTMLSelectElement>('cond-wind').addEventListener('change', async (e) => {
    const v = (e.target as HTMLSelectElement).value;
    wind = 'pending';
    if (await run('Wind', { command: 'wind', preset: v as Command['preset'] })) wind = v;
  });
  $<HTMLSelectElement>('cond-gps').addEventListener('change', (e) => void run('GPS', { command: 'gps', quality: (e.target as HTMLSelectElement).value as Command['quality'] }));
  $('cond-batt-apply').addEventListener('click', () => {
    const startPct = Number($<HTMLInputElement>('cond-batt-start').value);
    const drainPctPerMin = Number($<HTMLInputElement>('cond-batt-drain').value);
    if (!(startPct >= 1 && startPct <= 100 && drainPctPerMin >= 0.1 && drainPctPerMin <= 100)) return status('Battery: start 1 to 100 %, drain 0.1 to 100 % a minute.');
    void run('Battery', { command: 'battery', startPct, drainPctPerMin });
  });
  return {
    wind: () => WIND_MS[wind] ?? WIND_MS.strong,
    /** a new place starts a fresh simulator: calm, good GPS, full battery */
    reset() {
      wind = 'calm';
      $<HTMLSelectElement>('cond-wind').value = 'calm';
      $<HTMLSelectElement>('cond-gps').value = 'good';
      status('');
    },
  };
}
