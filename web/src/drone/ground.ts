// Ground contact against real terrain (P2A.6.2, plan p.11). SITL flies over flat ground at the home height unless real
// heights are fed to it (P2A.1.4, P2A.1.6), so the app checks each state against Cesium's terrain: real AGL = altMsl -
// ground MSL under the drone. At or below zero while the simulator still thinks it is flying is a crash (it would have
// flown through the hill). Flying well below the home height, or over ground well below it, gets a warning: the
// simulator's flat ground cannot represent that.
import type { DroneState } from '../net/contract';

export const FLYING_SIM_AGL = 0.5; // the simulator's own height above its ground that counts as flying
export const BELOW_HOME_M = 10; // "well below" the home height

export type Crash = { t: string; lat: number; lon: number; altMsl: number; groundMsl: number; groundSpeed: number; verticalSpeed: number };

export const FLAT_GROUND_WARNING = (homeMsl: number) =>
  `The simulator's ground is flat at the home height (${homeMsl.toFixed(0)} m MSL). It cannot show ground below that, so terrain lower than home is not simulated here.`;

export class GroundWatch {
  crash: Crash | null = null;
  warning = false;
  constructor(public homeMsl: number) {}

  /** groundMsl: real ground under the drone (undefined while terrain there is not loaded: no verdict) */
  update(s: DroneState, groundMsl: number | undefined): { crash: Crash | null; warning: boolean } {
    if (this.crash || groundMsl === undefined) return { crash: null, warning: this.warning };
    const flying = s.armed && s.altAgl > FLYING_SIM_AGL;
    if (flying && s.altMsl - groundMsl <= 0) {
      this.crash = { t: s.t, lat: s.lat, lon: s.lon, altMsl: s.altMsl, groundMsl, groundSpeed: s.groundSpeed, verticalSpeed: s.verticalSpeed };
      return { crash: this.crash, warning: this.warning };
    }
    this.warning = flying && (s.altMsl < this.homeMsl - BELOW_HOME_M || groundMsl < this.homeMsl - BELOW_HOME_M);
    return { crash: null, warning: this.warning };
  }

  reset(homeMsl: number): void {
    this.homeMsl = homeMsl;
    this.crash = null;
    this.warning = false;
  }
}
