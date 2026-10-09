// The control layer (P2A.5.1, plan p.10): keys are on or off, sticks are smooth. Each axis ramps toward full deflection
// while its key is held and back to centre on release; beginner mode limits deflection; a deadzone and a small expo shape
// the output; an emitter sends a ControlInput 25 times a second. Keyboard (P2A.5.2) and gamepad (P2B) feed the same layer.
import type { ControlInput, DroneState } from '../net/contract';

export const RAMP_UP = 2.5; // stick units per second while a key is held (plan: starting value, tune by feel)
export const RETURN = 4; // back toward centre per second after release
export const BEGINNER_LIMIT = 0.6; // full deflection in beginner mode
export const DEADZONE = 0.05; // small stick values are zero
export const EXPO = 0.3; // 0 = linear; small inputs stay gentle
export const RATE_HZ = 25;

/** Pilot's axes, each -1..1: throttle up, yaw right, forward, right. */
export const AXES = ['throttle', 'yaw', 'forward', 'right'] as const;
export type Axis = (typeof AXES)[number];
export type Push = -1 | 0 | 1;

/** Deadzone then expo: monotonic, |out| <= |in|, 0 inside the deadzone, -1..1 kept. */
export function shape(x: number, deadzone = DEADZONE, expo = EXPO): number {
  const a = Math.min(1, Math.abs(x));
  if (a < deadzone) return 0;
  const d = (a - deadzone) / (1 - deadzone);
  return Math.sign(x) * ((1 - expo) * d + expo * d ** 3);
}

export class Sticks {
  readonly pos: Record<Axis, number> = { throttle: 0, yaw: 0, forward: 0, right: 0 };
  readonly push: Record<Axis, Push> = { throttle: 0, yaw: 0, forward: 0, right: 0 };
  beginner = true;

  /** Moves every axis dt seconds toward its target: the pushed limit while a key is held, centre otherwise. */
  update(dt: number): void {
    const limit = this.beginner ? BEGINNER_LIMIT : 1;
    for (const k of AXES) {
      const target = this.push[k] * limit;
      const rate = this.push[k] === 0 ? RETURN : RAMP_UP;
      const d = target - this.pos[k];
      this.pos[k] += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }
  }

  /** Esc: every stick to centre at once. */
  release(): void {
    for (const k of AXES) this.push[k] = this.pos[k] = 0;
  }

  /** The ControlInput for these stick positions. Forward is NEGATIVE pitch and right is positive roll (measured on
   *  SITL, decisions.md 2026-10-09); throttle centre 0.5 holds height in Loiter and AltHold. */
  output(): ControlInput {
    return {
      throttle: 0.5 + 0.5 * shape(this.pos.throttle),
      yaw: shape(this.pos.yaw),
      pitch: -shape(this.pos.forward),
      roll: shape(this.pos.right),
    };
  }
}

/** Updates the sticks and sends a ControlInput RATE_HZ times a second until stopped. `override` replaces the output
 *  (for example throttle 0 while disarmed: ArduCopter will not arm with the throttle up). */
/**
 * The throttle to send. Disarmed: 0 (ArduCopter will not arm with the throttle up). Armed on the ground: 0 unless the
 * pilot pushes above centre to climb; a centred stick there spins the motors up, ArduCopter then counts itself as no
 * longer landed and refuses a take off command (found 2026-10-09, mission-live.mjs). Airborne: the stick as it is.
 */
export function throttleOut(t: number, s: DroneState | null): number {
  if (!s?.armed) return 0;
  return s.altAgl > 0.5 || t > 0.5 ? t : 0;
}

export function startEmitter(sticks: Sticks, send: (c: ControlInput) => void, override?: (c: ControlInput) => ControlInput): () => void {
  const id = setInterval(() => {
    sticks.update(1 / RATE_HZ);
    const c = sticks.output();
    send(override ? override(c) : c);
  }, 1000 / RATE_HZ);
  return () => clearInterval(id);
}
