import { describe, expect, it } from 'vitest';
import { AXES, Sticks } from './controls';
import { DISARM_IN_AIR, handleKey } from './keyboard';
import type { Action, KeyContext } from './keyboard';

function rig(airborne = false, answer = true) {
  const ran: Action[] = [];
  const asked: string[] = [];
  const ctx: KeyContext = {
    sticks: new Sticks(),
    busy: () => false,
    airborne: () => airborne,
    confirm: (q) => (asked.push(q), answer),
    run: (a) => void ran.push(a),
  };
  const held = new Set<string>();
  const key = (k: string, type = 'keydown', extra: Partial<{ typing: boolean; mods: boolean; repeat: boolean }> = {}) =>
    handleKey({ key: k, type, typing: false, mods: false, ...extra }, held, ctx);
  return { ctx, ran, asked, key, held };
}

describe('key bindings (P2A.5.2, plan p.10)', () => {
  it.each([
    ['w', 'throttle', 1], ['s', 'throttle', -1], ['a', 'yaw', -1], ['d', 'yaw', 1],
    ['ArrowUp', 'forward', 1], ['ArrowDown', 'forward', -1], ['ArrowLeft', 'right', -1], ['ArrowRight', 'right', 1],
  ] as const)('%s pushes %s to %i while held, and back to 0 on release', (k, axis, push) => {
    const { ctx, key } = rig();
    expect(key(k)).toBe(true);
    expect(ctx.sticks.push[axis]).toBe(push);
    key(k, 'keyup');
    expect(ctx.sticks.push[axis]).toBe(0);
  });

  it.each([
    ['Enter', 'arm'], ['t', 'takeoff'], ['l', 'land'], ['h', 'rtl'], ['1', 'loiter'], ['2', 'altHold'], ['3', 'stabilize'], ['c', 'camera'], ['r', 'reset'],
  ] as const)('%s fires %s once per press', (k, action) => {
    const { ran, key } = rig();
    key(k);
    key(k, 'keydown', { repeat: true }); // auto-repeat while held does not fire again
    key(k, 'keyup');
    expect(ran).toEqual([action]);
  });

  it('Esc zeroes all sticks at once', () => {
    const { ctx, key } = rig();
    for (const k of ['w', 'd', 'ArrowUp', 'ArrowRight']) key(k);
    for (const a of AXES) ctx.sticks.pos[a] = 0.4;
    key('Escape');
    expect(Object.values(ctx.sticks.pos).every((v) => v === 0) && Object.values(ctx.sticks.push).every((v) => v === 0)).toBe(true);
  });

  it('Enter while airborne asks for confirmation; no means no', () => {
    const no = rig(true, false);
    no.key('Enter');
    expect(no.asked).toEqual([DISARM_IN_AIR]);
    expect(no.ran).toEqual([]);
    const yes = rig(true, true);
    yes.key('Enter');
    expect(yes.ran).toEqual(['arm']);
    const ground = rig(false);
    ground.key('Enter');
    expect(ground.asked).toEqual([]); // on the ground it just arms or disarms
    expect(ground.ran).toEqual(['arm']);
  });

  it('keys are ignored while typing in an input box, with Ctrl/Alt/Cmd, and while another view owns them', () => {
    const { ctx, ran, key } = rig();
    expect(key('w', 'keydown', { typing: true })).toBe(false);
    expect(key('t', 'keydown', { typing: true })).toBe(false);
    expect(key('r', 'keydown', { mods: true })).toBe(false); // Ctrl+R stays the browser's reload
    ctx.busy = () => true;
    expect(key('d')).toBe(false);
    expect(ctx.sticks.push.throttle).toBe(0);
    expect(ran).toEqual([]);
  });

  it('two keys on one axis: the newest held wins, letting go returns to the other', () => {
    const { ctx, key } = rig();
    key('w');
    key('s');
    expect(ctx.sticks.push.throttle).toBe(-1);
    key('s', 'keyup');
    expect(ctx.sticks.push.throttle).toBe(1);
  });
});
