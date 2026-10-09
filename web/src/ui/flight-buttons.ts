// Arm, disarm, take off, land, return-home and mode buttons (P2A.5.3), each disabled with a reason shown as text.
// buttonStates() is the whole rule table; the panel only draws it.
import type { DroneState } from '../net/contract';

export const BUTTONS = ['arm', 'disarm', 'takeoff', 'land', 'rtl', 'loiter', 'altHold', 'stabilize'] as const;
export type ButtonId = (typeof BUTTONS)[number];
export const LABELS: Record<ButtonId, string> = { arm: 'Arm', disarm: 'Disarm', takeoff: 'Take off', land: 'Land', rtl: 'Return home', loiter: 'Loiter', altHold: 'AltHold', stabilize: 'Stabilize' };
export type ButtonState = { enabled: boolean; reason: string };

export const REASONS = {
  link: 'Not connected to the drone (place it first, and keep the bridge running)',
  gps: 'GPS not ready, wait', // the plan's own wording (p.11)
  armed: 'Already armed',
  disarmed: 'Already disarmed',
  armFirst: 'Arm first',
  ground: 'Already on the ground',
  flyFirst: 'Take off first',
  flying: 'Already flying',
};

/** airborne: armed and more than 0.5 m above home (the simulator's own ground) */
export const isAirborne = (s: DroneState | null): boolean => Boolean(s?.armed && s.altAgl > 0.5);

export function buttonStates(connected: boolean, s: DroneState | null): Record<ButtonId, ButtonState> {
  const on: ButtonState = { enabled: true, reason: '' };
  const off = (reason: string): ButtonState => ({ enabled: false, reason });
  if (!connected || !s) return Object.fromEntries(BUTTONS.map((b) => [b, off(REASONS.link)])) as Record<ButtonId, ButtonState>;
  const fix = s.gpsFix >= 3;
  const air = isAirborne(s);
  return {
    arm: s.armed ? off(REASONS.armed) : fix ? on : off(REASONS.gps),
    disarm: s.armed ? on : off(REASONS.disarmed), // in the air it asks first (keyboard.ts DISARM_IN_AIR)
    takeoff: air ? off(REASONS.flying) : !s.armed ? off(fix ? REASONS.armFirst : REASONS.gps) : on,
    land: air ? on : off(REASONS.ground),
    rtl: air ? on : off(fix ? REASONS.flyFirst : REASONS.gps),
    loiter: fix ? on : off(REASONS.gps), // Loiter holds position by GPS
    altHold: on,
    stabilize: on,
  };
}

/** The panel: one button each, and under the row the reasons of the disabled ones as plain text. */
export function mountFlightButtons(host: HTMLElement, press: (b: ButtonId) => void): (connected: boolean, s: DroneState | null) => void {
  const panel = document.createElement('div');
  panel.id = 'flight-buttons';
  panel.className = 'panel';
  const row = document.createElement('div');
  row.className = 'row wrap';
  const reasons = document.createElement('ul');
  reasons.id = 'flight-reasons';
  const btns = Object.fromEntries(
    BUTTONS.map((b) => {
      const el = document.createElement('button');
      el.className = 'btn';
      el.id = `fb-${b}`;
      el.textContent = LABELS[b];
      el.addEventListener('click', () => press(b));
      row.append(el);
      return [b, el];
    }),
  ) as Record<ButtonId, HTMLButtonElement>;
  panel.append(row, reasons);
  host.append(panel);
  let last = '';
  return (connected, s) => {
    const st = buttonStates(connected, s);
    const key = JSON.stringify(st);
    if (key === last) return; // states arrive 25 times a second; redraw only on a change
    last = key;
    for (const b of BUTTONS) {
      btns[b].disabled = !st[b].enabled;
      btns[b].title = st[b].reason;
    }
    // identical reasons are grouped so the list stays short
    const groups = new Map<string, string[]>();
    for (const b of BUTTONS) if (!st[b].enabled) groups.set(st[b].reason, [...(groups.get(st[b].reason) ?? []), LABELS[b]]);
    reasons.replaceChildren(
      ...[...groups].map(([reason, names]) => {
        const li = document.createElement('li');
        li.textContent = `${names.join(', ')}: ${reason}`;
        return li;
      }),
    );
  };
}
