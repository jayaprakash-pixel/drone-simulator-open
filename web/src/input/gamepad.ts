// Game controllers (P2B). The browser Gamepad API has no change events for sticks, so the pads are read every animation
// frame while one is connected; browsers only report a pad after its first button press.
import { shape } from './controls';
import type { Action } from './keyboard';
import { calibrate, defaultProfile, loadProfile, padSticks, saveProfile } from './pad-profile';
import type { Profile, Stick } from './pad-profile';

export type PadSnapshot = { index: number; id: string; axes: number[]; buttons: number[] };

const snap = (g: Gamepad): PadSnapshot => ({ index: g.index, id: g.id, axes: [...g.axes], buttons: g.buttons.map((b) => b.value) });

/** The first connected pad, or null. */
export function readPad(): PadSnapshot | null {
  const g = [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => Boolean(p?.connected));
  return g ? snap(g) : null;
}

/** Calls `frame` with the current pad every animation frame while one is connected, and `gone` when it disconnects. */
export function watchPads(frame: (p: PadSnapshot) => void, gone: () => void): void {
  let raf = 0;
  const loop = (): void => {
    const p = readPad();
    if (!p) {
      raf = 0;
      return gone();
    }
    frame(p);
    raf = requestAnimationFrame(loop);
  };
  window.addEventListener('gamepadconnected', () => (raf ||= requestAnimationFrame(loop)));
  window.addEventListener('gamepaddisconnected', () => {
    if (!readPad()) {
      cancelAnimationFrame(raf);
      raf = 0;
      gone();
    }
  });
  if (readPad()) raf = requestAnimationFrame(loop);
}

export const ARM_HOLD_MS = 1000; // the arm button must be held this long (P2B.2.3): no arming by a bump
export const PAD_ACTIONS: Action[] = ['arm', 'takeoff', 'land', 'rtl', 'loiter', 'altHold', 'stabilize', 'camera'];
const ACTION_LABEL: Record<string, string> = { arm: 'Arm / disarm', takeoff: 'Take off', land: 'Land', rtl: 'Return home', loiter: 'Loiter', altHold: 'AltHold', stabilize: 'Stabilize', camera: 'Camera view' };
const STICKS: Stick[] = ['throttle', 'yaw', 'pitch', 'roll'];
export const LOITER_NOTE =
  'Loiter is suggested with a gamepad: its sticks spring back to the middle, and in Loiter a centred stick holds position and height. In Stabilize a centred throttle is a fixed half power, so the drone climbs or sinks on its own.';

export interface PadSetup {
  /** the profile in use (calibrated and mapped), or null */
  profile(): Profile | null;
  /** the four sticks of the connected pad in pilot terms (null without a pad and profile) */
  sticks(): Record<Stick, number> | null;
}

/** P2B.1.1-1.3 the controller panel: prompt, live values, calibration, mapping, save. `onAction` gets assigned buttons. */
export function mountPadSetup(host: HTMLElement, onAction: (a: Action) => void, onGone: () => void = () => {}): PadSetup {
  const panel = document.createElement('div');
  panel.id = 'gamepad-panel';
  panel.className = 'panel';
  panel.innerHTML = `<b>Controller</b>
    <div id="input-indicator">Input: Keyboard</div>
    <div id="gp-prompt">Press any button on your controller (USB or Bluetooth). Browsers only report a controller after a button press.</div>
    <div id="gp-live" class="hidden"><div id="gp-name" class="mono"></div><div id="gp-axes" class="mono"></div><div id="gp-buttons" class="mono"></div></div>
    <div id="gp-cal" class="hidden"><div id="gp-cal-text">New controller: move both sticks to every edge a few times, let go, then press Done.</div><button class="btn" id="gp-cal-btn">Start calibration</button></div>
    <div id="gp-map" class="hidden">
      <div class="row"><label>Stick mode <select id="gp-mode"><option value="2">Mode 2: left throttle and yaw, right pitch and roll</option><option value="1">Mode 1: left pitch and yaw, right throttle and roll</option></select></label></div>
      <div class="row wrap">Invert: ${STICKS.map((s) => `<label><input type="checkbox" id="gp-inv-${s}"> ${s}</label>`).join(' ')}</div>
      <div class="row"><label>Deadzone <input type="number" id="gp-deadzone" min="0" max="30" step="1" style="width:4em"> %</label></div>
      <div class="row wrap">${PAD_ACTIONS.map((a) => `<label>${ACTION_LABEL[a]} <select id="gp-btn-${a}"><option value="">none</option>${Array.from({ length: 17 }, (_, i) => `<option value="${i}">button ${i}</option>`).join('')}</select></label>`).join(' ')}</div>
      <div id="gp-loiter-note" class="muted">${LOITER_NOTE} The arm button must be held for 1 s.</div>
      <div class="row"><button class="btn" id="gp-save">Save for this controller</button><span id="gp-status" class="muted"></span></div>
    </div>`;
  host.append(panel);
  const el = <T extends HTMLElement = HTMLElement>(id: string): T => panel.querySelector<T>(`#${id}`)!;
  const show = (id: string, on: boolean): void => void el(id).classList.toggle('hidden', !on);

  let pad: PadSnapshot | null = null;
  let profile: Profile | null = null;
  let recording: number[][] | null = null;
  let prevButtons: number[] = [];
  let armSince: number | null = null; // when the arm button went down (fires once after ARM_HOLD_MS)

  const fillMap = (p: Profile): void => {
    el<HTMLSelectElement>('gp-mode').value = String(p.mode);
    for (const s of STICKS) el<HTMLInputElement>(`gp-inv-${s}`).checked = p.invert[s];
    el<HTMLInputElement>('gp-deadzone').value = String(Math.round(p.deadzone * 100));
    for (const a of PAD_ACTIONS) {
      const b = Object.entries(p.buttons).find(([, act]) => act === a)?.[0];
      el<HTMLSelectElement>(`gp-btn-${a}`).value = b ?? '';
    }
  };
  // every change on the mapping screen applies at once; Save stores it
  panel.addEventListener('change', () => {
    if (!profile) return;
    profile.mode = Number(el<HTMLSelectElement>('gp-mode').value) as 1 | 2;
    for (const s of STICKS) profile.invert[s] = el<HTMLInputElement>(`gp-inv-${s}`).checked;
    profile.deadzone = Math.min(30, Math.max(0, Number(el<HTMLInputElement>('gp-deadzone').value) || 0)) / 100;
    profile.buttons = {};
    for (const a of PAD_ACTIONS) {
      const v = el<HTMLSelectElement>(`gp-btn-${a}`).value;
      if (v !== '') profile.buttons[Number(v)] = a;
    }
  });
  el('gp-save').addEventListener('click', () => {
    if (!profile) return;
    saveProfile(profile);
    el('gp-status').textContent = 'Saved for this controller.';
  });
  el('gp-cal-btn').addEventListener('click', () => {
    if (!pad) return;
    if (!recording) {
      recording = [];
      el('gp-cal-btn').textContent = 'Done (sticks let go)';
      return;
    }
    profile = defaultProfile(pad.id, calibrate(recording));
    recording = null;
    el('gp-cal-btn').textContent = 'Start calibration';
    show('gp-cal', false);
    show('gp-map', true);
    fillMap(profile);
    el('gp-status').textContent = 'Calibrated. Check the mapping, then save.';
  });

  const frame = (p: PadSnapshot): void => {
    if (pad?.id !== p.id) {
      // a controller appeared: its saved profile loads with no calibration prompt
      profile = loadProfile(p.id);
      show('gp-cal', !profile);
      show('gp-map', Boolean(profile));
      if (profile) {
        fillMap(profile);
        el('gp-status').textContent = 'Profile loaded for this controller.';
      }
    }
    pad = p;
    recording?.push(p.axes);
    show('gp-prompt', false);
    show('gp-live', true);
    el('gp-name').textContent = p.id;
    el('gp-axes').textContent = `Axes ${p.axes.map((v, i) => `${i}:${v.toFixed(2)}`).join('  ')}`;
    el('gp-axes').dataset.values = JSON.stringify(p.axes);
    el('gp-buttons').textContent = `Buttons ${p.buttons.map((v, i) => (v > 0.5 ? `${i}` : '')).filter(Boolean).join(' ') || 'none pressed'}`;
    // assigned buttons fire on the press, once; the arm button only after being held ARM_HOLD_MS
    if (profile && !recording) {
      p.buttons.forEach((v, i) => {
        const a = profile!.buttons[i];
        if (!a) return;
        const down = v > 0.5, was = (prevButtons[i] ?? 0) > 0.5;
        if (a === 'arm') {
          if (down && !was) armSince = performance.now();
          if (!down) armSince = null;
          if (down && armSince !== null && performance.now() - armSince >= ARM_HOLD_MS) {
            armSince = null; // once per hold
            onAction('arm');
          }
        } else if (down && !was) onAction(a);
      });
    }
    prevButtons = p.buttons;
  };
  watchPads(frame, () => {
    const wasActive = Boolean(pad && profile);
    pad = null;
    armSince = null;
    if (wasActive) onGone();
    recording = null;
    prevButtons = [];
    show('gp-prompt', true);
    for (const id of ['gp-live', 'gp-cal', 'gp-map']) show(id, false);
  });
  return {
    profile: () => profile,
    sticks: () => (pad && profile ? padSticks(pad.axes, profile, shape) : null),
  };
}
