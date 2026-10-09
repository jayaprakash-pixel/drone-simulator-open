// Camera views around the drone (P2A.4.2): C (keyboard.ts) cycles chase, first-person, top-down, free. The follow views move the
// camera every frame from the drawn (smoothed) pose; free hands the camera back to the normal globe controls.
// Distances (docs/tuning.md):
export const CHASE_BACK_M = 12; // behind the drone, along the ground
export const CHASE_UP_M = 5; // above the drone
export const NOSE_M = 0.3; // first-person eye: this far ahead of the drone's centre
export const TOP_M = 150; // top-down: this high above the drone
import { Cartesian3, Math as CesiumMath } from 'cesium';
import type { Viewer } from 'cesium';
import type { Drone } from './model';

export const VIEWS = ['chase', 'first-person', 'top-down', 'free'] as const;
export type View = (typeof VIEWS)[number];

const R = Math.PI / 180;
/** lat/lon `north` and `east` metres from a point (flat-earth; fine for metres) */
const offset = (lat: number, lon: number, north: number, east: number): [number, number] => [lat + north / 111_195, lon + east / (111_195 * Math.cos(lat * R))];

export interface DroneViews {
  readonly view: View;
  cycle(): View;
  set(v: View): void;
}

export function mountDroneViews(viewer: Viewer, drone: Drone, onChange: (v: View) => void = () => {}): DroneViews {
  const { camera, scene } = viewer;
  let view: View = 'free'; // the globe as usual until the drone exists and C is pressed
  const inputs = (on: boolean): void => void (scene.screenSpaceCameraController.enableInputs = on);

  scene.preRender.addEventListener(() => {
    const p = drone.drawn();
    if (!p || view === 'free') return;
    const h = p.heading * R;
    if (view === 'chase') {
      const [la, lo] = offset(p.lat, p.lon, -CHASE_BACK_M * Math.cos(h), -CHASE_BACK_M * Math.sin(h));
      camera.setView({
        destination: Cartesian3.fromDegrees(lo, la, p.alt + CHASE_UP_M),
        orientation: { heading: h, pitch: -Math.atan2(CHASE_UP_M, CHASE_BACK_M), roll: 0 }, // looks at the drone
      });
    } else if (view === 'first-person') {
      const [la, lo] = offset(p.lat, p.lon, NOSE_M * Math.cos(h), NOSE_M * Math.sin(h));
      camera.setView({ destination: Cartesian3.fromDegrees(lo, la, p.alt), orientation: { heading: h, pitch: CesiumMath.toRadians(p.pitch), roll: 0 } });
    } else {
      camera.setView({ destination: Cartesian3.fromDegrees(p.lon, p.lat, p.alt + TOP_M), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } }); // north up
    }
  });

  const set = (v: View): void => {
    view = v;
    inputs(v === 'free'); // follow views own the camera; free gives back drag, zoom and tilt
    scene.requestRender();
    onChange(v);
  };
  return {
    get view() {
      return view;
    },
    /** C (input/keyboard.ts): the next view; nothing happens before a drone is on the globe */
    cycle() {
      if (drone.drawn()) set(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
      return view;
    },
    set,
  };
}
