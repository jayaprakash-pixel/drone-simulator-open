// Instruments and notices (P2A.6.1, plan p.11): altitude AGL and MSL (each labelled), ground speed, vertical speed,
// compass, battery, flight mode, armed state, GPS fix and an artificial horizon, all from the latest DroneState.
// Notices: "GPS not ready, wait" while the fix is below 3D; "Battery low, return home" below BATTERY_LOW_PCT, replaced
// by "Battery critical" below BATTERY_CRIT_PCT.
import { compassName } from '../globe/camera';
import { formatAltitude } from '../globe/coords';
import type { DroneState } from '../net/contract';
import { clearNotice, showNotice } from './notices';
import { settings } from './settings';

export const BATTERY_LOW_PCT = 25; // decisions.md 2026-10-09 (a starting value; tune with real flights)
export const GPS_WAIT = 'GPS not ready, wait';
export const BATTERY_LOW = 'Battery low, return home';
export const BATTERY_CRIT_PCT = 10; // the autopilot lands here (BATT_FS_CRT_ACT 1; bridge/commands.py, P3.2.3)
export const BATTERY_CRIT = 'Battery critical: the drone is landing now';
const HORIZON_PX_PER_DEG = 1.2; // horizon line moves this many pixels per degree of pitch

const FIX = ['no GPS', 'no fix', '2D fix', '3D fix', 'DGPS fix', 'RTK float', 'RTK fixed', 'static', 'PPP fix'];

export function mountInstruments(host: HTMLElement): (s: DroneState | null) => void {
  const panel = document.createElement('div');
  panel.id = 'instruments';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <div class="inst-row"><div class="horizon" id="inst-horizon"><div class="hz-world"></div><div class="hz-plane"></div></div>
      <div class="inst-grid">
        <span id="inst-agl"></span><span id="inst-msl"></span>
        <span id="inst-gs"></span><span id="inst-vs"></span>
        <span id="inst-hdg"></span><span id="inst-bat"></span>
        <span id="inst-mode"></span><span id="inst-armed"></span>
        <span id="inst-gps"></span>
      </div></div>`;
  host.append(panel);
  const el = (id: string): HTMLElement => panel.querySelector<HTMLElement>(`#${id}`)!;
  const put = (id: string, text: string, value: number | string | boolean): void => {
    const e = el(id);
    e.textContent = text;
    e.dataset.value = String(value);
  };
  const world = panel.querySelector<HTMLElement>('.hz-world')!;
  const horizon = el('inst-horizon');

  return (s) => {
    if (!s) {
      panel.classList.add('hidden');
      clearNotice('gps-wait');
      clearNotice('battery-low');
      return;
    }
    panel.classList.remove('hidden');
    const units = settings.units;
    put('inst-agl', `Alt ${formatAltitude({ m: s.altAgl, type: 'agl' }, units)}`, s.altAgl);
    put('inst-msl', formatAltitude({ m: s.altMsl, type: 'msl' }, units), s.altMsl);
    put('inst-gs', `GS ${s.groundSpeed.toFixed(1)} m/s`, s.groundSpeed);
    put('inst-vs', `VS ${s.verticalSpeed >= 0 ? '+' : ''}${s.verticalSpeed.toFixed(1)} m/s`, s.verticalSpeed);
    put('inst-hdg', `HDG ${String(Math.round(s.headingDeg) % 360).padStart(3, '0')}° ${compassName(s.headingDeg)}`, s.headingDeg);
    put('inst-bat', `Battery ${Math.round(s.batteryPct)}%`, s.batteryPct);
    put('inst-mode', s.mode, s.mode);
    put('inst-armed', s.armed ? 'ARMED' : 'disarmed', s.armed);
    put('inst-gps', `GPS ${FIX[s.gpsFix] ?? `fix ${s.gpsFix}`}`, s.gpsFix);
    el('inst-bat').classList.toggle('warn', s.batteryPct < BATTERY_LOW_PCT);
    el('inst-armed').classList.toggle('warn', s.armed);
    // artificial horizon: the world turns against the roll and slides down as the nose comes up
    world.style.transform = `rotate(${-s.rollDeg}deg) translateY(${s.pitchDeg * HORIZON_PX_PER_DEG}px)`;
    horizon.dataset.roll = String(s.rollDeg);
    horizon.dataset.pitch = String(s.pitchDeg);

    if (s.gpsFix < 3) showNotice('gps-wait', GPS_WAIT, 'info');
    else clearNotice('gps-wait');
    // low, then critical in its place (P3.2.3)
    if (s.batteryPct < BATTERY_CRIT_PCT) clearNotice('battery-low'), showNotice('battery-critical', BATTERY_CRIT, 'error');
    else if (s.batteryPct < BATTERY_LOW_PCT) clearNotice('battery-critical'), showNotice('battery-low', BATTERY_LOW, 'warn');
    else clearNotice('battery-low'), clearNotice('battery-critical');
  };
}
