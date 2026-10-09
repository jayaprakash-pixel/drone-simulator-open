import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium';
import type { Entity } from 'cesium';
import { FACING_SEARCH_M, chooseFacing, moveLatLon, walkStep } from './camera';
import type { FreeRay, WalkKeys } from './camera';
import { aboveGround, ellipsoidToMsl } from './coords';
import type { Altitude } from './coords';
import type { Globe } from './viewer';

export const EYE: Altitude = { m: 1.7, type: 'agl' };
/** Highest step up a walker takes (a kerb); anything taller, such as a building wall, stops the walk. */
export const MAX_STEP_UP = 0.5;
const BODY_RADIUS = 0.4; // m: how far ahead a wall is felt
const WALL_HEIGHT = 1.5; // m: something drawn this far above the terrain counts as a wall when choosing where to face
const LOOK_DEG_PER_PX = 0.2;
const MAX_LOOK_PITCH = CesiumMath.toRadians(85);
const KEYS: Record<string, keyof WalkKeys> = {
  w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', shift: 'fast',
};

/** 'stand': eye 1.7 m above what is underfoot, walls stop you. 'drone': a fixed height above the terrain only. */
export type EyeMode = 'stand' | 'drone';
export interface EnterInfo {
  mode: EyeMode;
  /** Stand here only: the nearest drawn wall within 30 m, if any */
  wall?: FreeRay;
}

export interface StandHere {
  enter(lat: number, lon: number): Promise<void>;
  /** Look around from `agl` metres above the terrain at a point (the drone-eye view). */
  enterDrone(lat: number, lon: number, agl: number): Promise<void>;
  /** Changes the height of the drone-eye view, metres above the terrain. */
  setAgl(agl: number): void;
  exit(): void;
  isActive(): boolean;
  mode(): EyeMode | undefined;
}

/**
 * Stand here: the camera 1.7 m above the ground, level, facing the most open direction. Drag to look around (the scene
 * follows the mouse, as in street-level viewers), W A S D or arrow keys to walk at 1.4 m/s, Shift to run at 5 m/s, Esc
 * to return to the previous view. The eye follows what is drawn underfoot: terrain, or the roof of a 3D building you
 * clicked on; walls stop the walk. The drone-eye view reuses all of this at a fixed height above the terrain, ignoring
 * buildings. The globe draws on demand, so every step and look asks for a frame; nothing is drawn standing still.
 */
export function createStandHere(globe: Globe, on: { enter(info: EnterInfo): void; exit(mode: EyeMode): void }): StandHere {
  const { scene, camera } = globe.viewer;
  const ssc = scene.screenSpaceCameraController;
  let active: EyeMode | undefined;
  let saved: { destination: Cartesian3; orientation: { heading: number; pitch: number; roll: number } } | undefined;
  let pos = { lat: 0, lon: 0 };
  let ground: Altitude = { m: 0, type: 'msl' };
  let eye: Altitude = EYE;
  const keys: WalkKeys = { forward: false, back: false, left: false, right: false, fast: false };
  const walking = (): boolean => keys.forward || keys.back || keys.left || keys.right;
  let raf = 0;
  let last = 0;
  let drag: { x: number; y: number } | undefined;

  const place = (heading: number, pitch: number): void => {
    const at = aboveGround(pos.lat, pos.lon, ground, eye);
    camera.setView({ destination: Cartesian3.fromDegrees(pos.lon, pos.lat, at.m), orientation: { heading, pitch, roll: 0 } });
    scene.requestRender();
  };

  // What a walker stands on at a spot, as drawn: a building roof where 3D buildings are on, else the terrain (MSL).
  // The drone-eye view follows the terrain only. The app's own markers are left out: a marker drawn on top of
  // everything would read as a height of nonsense.
  const markers = (): Entity[] => ['selected', 'home', 'pano'].map((id) => globe.viewer.entities.getById(id)).filter((e): e is Entity => e !== undefined);
  const surfaceAt = (lat: number, lon: number): Altitude | undefined => {
    const c = Cartographic.fromDegrees(lon, lat);
    const h = (active === 'stand' && scene.sampleHeightSupported ? scene.sampleHeight(c, markers()) : undefined) ?? scene.globe.getHeight(c);
    return h === undefined ? undefined : { m: ellipsoidToMsl(lat, lon, h), type: 'msl' };
  };

  const step = (t: number): void => {
    const dt = Math.min(0.1, (t - last) / 1000); // a stalled tab must not teleport the walker
    last = t;
    const d = walkStep(keys, CesiumMath.toDegrees(camera.heading), dt);
    const len = Math.hypot(d.east, d.north);
    const next = moveLatLon(pos.lat, pos.lon, d.east, d.north);
    // look a body radius ahead, so a wall stops you in front of it rather than with your eye inside it
    const ahead = len ? moveLatLon(next.lat, next.lon, (d.east / len) * BODY_RADIUS, (d.north / len) * BODY_RADIUS) : next;
    const front = surfaceAt(ahead.lat, ahead.lon);
    if (active === 'drone' || !front || front.m - ground.m <= MAX_STEP_UP) {
      // walls stop you; stepping down (off a roof, downhill) is fine
      pos = next;
      ground = surfaceAt(next.lat, next.lon) ?? ground;
      place(camera.heading, camera.pitch);
    }
    raf = walking() ? requestAnimationFrame(step) : 0;
  };

  const release = (): void => {
    for (const k of Object.keys(keys) as (keyof WalkKeys)[]) keys[k] = false;
    drag = undefined;
  };

  const onKey = (ev: KeyboardEvent): void => {
    // typing in a text box must not walk or leave; a focused checkbox, slider or button must not swallow Esc
    const typing = ev.target instanceof HTMLTextAreaElement || (ev.target instanceof HTMLInputElement && !['checkbox', 'range', 'button', 'radio'].includes(ev.target.type));
    if (!active || typing) return;
    if (ev.key === 'Escape') {
      if (ev.type === 'keydown') exit();
      return;
    }
    const k = KEYS[ev.key.toLowerCase()];
    if (!k) return;
    ev.preventDefault();
    keys[k] = ev.type === 'keydown';
    if (!raf && walking()) {
      last = performance.now();
      raf = requestAnimationFrame(step);
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', release); // keys held while the window lost focus would never see their keyup

  // Drag-to-look is caught on the way down (capture phase) and kept from Cesium's own handler: with its inputs off it
  // still records drags, and on Esc it would replay their momentum and spin the restored view away.
  const canvas = scene.canvas;
  const mine = (ev: PointerEvent): boolean => Boolean(active) && ev.target === canvas;
  window.addEventListener('pointerdown', (ev) => {
    if (!mine(ev)) return;
    ev.stopPropagation();
    if (ev.button === 0) drag = { x: ev.clientX, y: ev.clientY };
  }, true);
  window.addEventListener('pointermove', (ev) => {
    if (!mine(ev)) return;
    ev.stopPropagation();
    if (!drag) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    drag = { x: ev.clientX, y: ev.clientY };
    const heading = camera.heading - CesiumMath.toRadians(dx * LOOK_DEG_PER_PX);
    const pitch = CesiumMath.clamp(camera.pitch + CesiumMath.toRadians(dy * LOOK_DEG_PER_PX), -MAX_LOOK_PITCH, MAX_LOOK_PITCH);
    place(heading, pitch);
  }, true);
  window.addEventListener('pointerup', (ev) => {
    if (mine(ev)) ev.stopPropagation();
    drag = undefined;
  }, true);

  /** How far is free in 8 compass directions from the spot: the first drawn surface over 1.5 m above the terrain ends a ray. */
  async function freeRays(lat: number, lon: number): Promise<FreeRay[]> {
    const steps: number[] = [];
    for (let d = 0.1; d < 3; d += 0.1) steps.push(d);
    for (let d = 3; d <= FACING_SEARCH_M; d += 0.5) steps.push(d);
    const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((heading) => ({
      heading,
      pts: steps.map((d) => ({ d, ...moveLatLon(lat, lon, d * Math.sin(CesiumMath.toRadians(heading)), d * Math.cos(CesiumMath.toRadians(heading))) })),
    }));
    const carto = rays.flatMap((r) => r.pts.map((p) => Cartographic.fromDegrees(p.lon, p.lat)));
    const tops = scene.sampleHeightSupported ? await scene.sampleHeightMostDetailed(carto, markers()) : [];
    let i = 0;
    return rays.map((r) => {
      let free = FACING_SEARCH_M;
      for (const p of r.pts) {
        const top = tops[i++]?.height;
        const terrain = scene.globe.getHeight(Cartographic.fromDegrees(p.lon, p.lat));
        if (free === FACING_SEARCH_M && top !== undefined && terrain !== undefined && top - terrain > WALL_HEIGHT) free = Number(p.d.toFixed(1));
      }
      return { heading: r.heading, free };
    });
  }

  async function begin(mode: EyeMode, lat: number, lon: number, agl: number): Promise<EnterInfo> {
    if (!active) saved = { destination: camera.positionWC.clone(), orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll } };
    else if (active !== mode) on.exit(active); // switching views: the old one's panels and notices go
    const msl = await globe.groundMsl(lat, lon); // most detailed terrain; without terrain the ellipsoid is the ground
    pos = { lat, lon };
    ground = { m: msl ?? ellipsoidToMsl(lat, lon, 0), type: 'msl' };
    eye = { m: agl, type: 'agl' };
    const info: EnterInfo = { mode };
    let heading = camera.heading;
    if (mode === 'stand' && scene.sampleHeightSupported) {
      // a click on a building puts you on its roof: inside the box you would only see its walls
      const [top] = await scene.sampleHeightMostDetailed([Cartographic.fromDegrees(lon, lat)], markers());
      const onRoof = top?.height !== undefined && ellipsoidToMsl(lat, lon, top.height) - ground.m > MAX_STEP_UP;
      if (onRoof) ground = { m: ellipsoidToMsl(lat, lon, top.height!), type: 'msl' };
      else {
        // on the ground: face the most open direction, and say so when a wall is close
        const facing = chooseFacing(await freeRays(lat, lon), CesiumMath.toDegrees(camera.heading));
        heading = CesiumMath.toRadians(facing.heading);
        info.wall = facing.wall;
      }
    }
    active = mode;
    ssc.enableInputs = false; // drag-to-look and the walking keys replace the globe gestures
    ssc.enableCollisionDetection = false; // it would lift a 1.7 m eye to the 2 m minimum zoom distance
    camera.cancelFlight();
    place(heading, 0);
    return info;
  }

  function exit(): void {
    if (!active) return;
    const mode = active;
    active = undefined;
    cancelAnimationFrame(raf);
    raf = 0;
    release();
    ssc.enableInputs = true;
    ssc.enableCollisionDetection = true;
    if (saved) camera.setView(saved);
    scene.requestRender();
    on.exit(mode);
  }

  return {
    async enter(lat, lon) {
      on.enter(await begin('stand', lat, lon, EYE.m));
    },
    async enterDrone(lat, lon, agl) {
      on.enter(await begin('drone', lat, lon, agl));
    },
    setAgl(agl) {
      if (active !== 'drone') return;
      eye = { m: agl, type: 'agl' };
      place(camera.heading, camera.pitch);
    },
    exit,
    isActive: () => active !== undefined,
    mode: () => active,
  };
}
