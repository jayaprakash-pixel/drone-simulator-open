// The drone on the globe (P2A.4.1): our glTF quadcopter (public/models/drone.gltf, docs/credits.md) drawn at the latest
// DroneState, smoothed between states (smoother.ts). States before a 3D GPS fix are not drawn: SITL reports lat 0, lon 0
// until its GPS has a fix.
import { Cartesian3, HeadingPitchRoll, Math as CesiumMath, Transforms } from 'cesium';
import type { Entity, Viewer } from 'cesium';
import { mslToEllipsoid } from '../globe/coords';
import type { DroneState } from '../net/contract';
import { Smoother } from './smoother';
import type { Pose } from './smoother';

export const MODEL_URL = 'models/drone.gltf';
// the model's nose is glTF +Z, Cesium's forward axis for glTF 2.0 (scripts/make-drone-model.mjs). Measured on screen
// 2026-10-09 (e2e/drone.mjs): that axis points east at Cesium heading 0, so a compass heading needs -90
export const MODEL_HEADING_OFFSET_DEG = -90;
export const CESIUM_ROLL_SIGN = 1;

export interface Drone {
  entity: Entity;
  set(s: DroneState): void;
  /** while frozen (after a crash) new states are not drawn */
  freeze(on: boolean): void;
  /** the pose drawn now (degrees, metres above the ellipsoid), or null before the first state */
  drawn(): Pose | null;
}

export function mountDrone(viewer: Viewer): Drone {
  const smoother = new Smoother();
  let drawn: Pose | null = null;
  let frozen = false;
  const entity = viewer.entities.add({
    id: 'drone',
    show: false,
    model: { uri: MODEL_URL, minimumPixelSize: 48, maximumScale: 20_000 },
  });
  const place = (p: Pose): void => {
    const pos = Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
    const hpr = new HeadingPitchRoll(CesiumMath.toRadians(p.heading + MODEL_HEADING_OFFSET_DEG), CesiumMath.toRadians(p.pitch), CesiumMath.toRadians(CESIUM_ROLL_SIGN * p.roll));
    entity.position = pos as never; // a plain Cartesian3 becomes a ConstantPositionProperty
    entity.orientation = Transforms.headingPitchRollQuaternion(pos, hpr) as never;
    entity.show = true;
  };
  let last = performance.now();
  viewer.scene.preRender.addEventListener(() => {
    const now = performance.now();
    const p = frozen ? drawn : smoother.step(now - last); // frozen: the drone stays exactly where it crashed
    last = now;
    if (!p) return;
    drawn = p;
    place(p);
    if (smoother.moving()) viewer.scene.requestRender(); // render on demand: keep drawing until the drone settles
  });
  return {
    entity,
    set(s) {
      if (s.gpsFix < 3 || frozen) return;
      smoother.set({ lat: s.lat, lon: s.lon, alt: mslToEllipsoid(s.lat, s.lon, s.altMsl), heading: s.headingDeg, pitch: s.pitchDeg, roll: s.rollDeg });
      viewer.scene.requestRender();
    },
    drawn: () => drawn,
    freeze: (on) => void (frozen = on),
  };
}
