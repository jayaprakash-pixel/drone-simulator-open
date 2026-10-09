// Key bindings (P2A.5.2, plan p.10). Held keys push a stick (controls.ts); the rest fire an action once per press.
//   W/S throttle up/down   A/D yaw left/right   arrows up/down pitch forward/back, left/right roll
//   Enter arm or disarm (asks first when airborne)   T take off to 10 m   L land   H return to home
//   1/2/3 Loiter, AltHold, Stabilize   C cycle the camera   R reset to home   Esc release all sticks
import type { Axis, Push, Sticks } from './controls';

export type Action = 'arm' | 'takeoff' | 'land' | 'rtl' | 'loiter' | 'altHold' | 'stabilize' | 'camera' | 'reset' | 'release';
type Binding = { axis: Axis; push: Exclude<Push, 0> } | { action: Action };

export const KEYMAP: Record<string, Binding> = {
  w: { axis: 'throttle', push: 1 },
  s: { axis: 'throttle', push: -1 },
  a: { axis: 'yaw', push: -1 },
  d: { axis: 'yaw', push: 1 },
  arrowup: { axis: 'forward', push: 1 },
  arrowdown: { axis: 'forward', push: -1 },
  arrowleft: { axis: 'right', push: -1 },
  arrowright: { axis: 'right', push: 1 },
  enter: { action: 'arm' },
  t: { action: 'takeoff' },
  l: { action: 'land' },
  h: { action: 'rtl' },
  '1': { action: 'loiter' },
  '2': { action: 'altHold' },
  '3': { action: 'stabilize' },
  c: { action: 'camera' },
  r: { action: 'reset' },
  escape: { action: 'release' },
};

export const DISARM_IN_AIR = 'Disarm while flying? The motors stop and the drone falls.';

export interface KeyContext {
  sticks: Sticks;
  /** true while another view owns these keys (Stand here walks with W A S D) */
  busy(): boolean;
  airborne(): boolean;
  confirm(question: string): boolean;
  run(a: Action): void;
}

/** Text boxes keep their keys; a focused checkbox, slider or button does not. */
export const isTyping = (t: EventTarget | null): boolean =>
  (typeof HTMLTextAreaElement !== 'undefined' && t instanceof HTMLTextAreaElement) ||
  (typeof HTMLInputElement !== 'undefined' && t instanceof HTMLInputElement && !['checkbox', 'range', 'button', 'radio'].includes(t.type));

/** Handles one keydown or keyup; returns true when the key was used (the caller then prevents the default). */
export function handleKey(ev: { key: string; type: string; repeat?: boolean; typing: boolean; mods: boolean }, held: Set<string>, ctx: KeyContext): boolean {
  const key = ev.key.toLowerCase();
  const b = KEYMAP[key];
  if (!b || ev.typing || ev.mods || ctx.busy()) return false;
  if ('axis' in b) {
    if (ev.type === 'keydown') held.add(key);
    else held.delete(key);
    // the newest key still held on this axis wins (W then S: down; let go of S: up again)
    const still = [...held].map((k) => KEYMAP[k]).filter((x): x is { axis: Axis; push: 1 | -1 } => 'axis' in x && x.axis === b.axis);
    ctx.sticks.push[b.axis] = still.length ? still[still.length - 1].push : 0;
    return true;
  }
  if (ev.type !== 'keydown' || ev.repeat) return true;
  if (b.action === 'release') {
    held.clear();
    ctx.sticks.release();
  } else if (b.action === 'arm' && ctx.airborne() && !ctx.confirm(DISARM_IN_AIR)) {
    return true;
  }
  if (b.action !== 'release') ctx.run(b.action);
  return true;
}

/** Listens on the window. Losing focus lets go of every held key (its keyup would never arrive). */
export function mountKeyboard(ctx: KeyContext): void {
  const held = new Set<string>();
  const on = (ev: KeyboardEvent): void => {
    if (handleKey({ key: ev.key, type: ev.type, repeat: ev.repeat, typing: isTyping(ev.target), mods: ev.ctrlKey || ev.metaKey || ev.altKey }, held, ctx)) ev.preventDefault();
  };
  window.addEventListener('keydown', on);
  window.addEventListener('keyup', on);
  window.addEventListener('blur', () => {
    held.clear();
    for (const k of ['throttle', 'yaw', 'forward', 'right'] as const) ctx.sticks.push[k] = 0;
  });
}
