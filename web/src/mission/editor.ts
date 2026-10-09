// Mission planner (P3.3): waypoint editor (add by clicking the ground while Plan is on, drag a point to move it, × to
// delete, height and speed per point, kept in localStorage), the route drawn draped over the terrain, the terrain
// clearance check with its height chart (clearance.ts, terrain only), upload and fly in Auto with "waypoint n of N",
// and the geofence (maximum height and distance from home, breach action), its circle drawn on the ground.
import { CallbackProperty, Cartesian2, Cartesian3, Color, HeightReference, ScreenSpaceEventHandler, ScreenSpaceEventType } from 'cesium';
import type { Entity } from 'cesium';
import { terrainHeight } from '../globe/obstacles';
import { pickGround } from '../globe/picking';
import type { Globe } from '../globe/viewer';
import type { Command, CommandAck, DroneState, MissionPoint } from '../net/contract';
import { MAX_WAYPOINTS } from '../net/contract';
import { REHEARSAL_NOTICE } from '../ui/layout';
import { checkClearance, routePoints } from './clearance';
import type { ClearanceResult } from './clearance';

const KEY = 'dw.mission';
const DEFAULT_ALT = 30; // m above home
const DEFAULT_SPEED = 5; // m/s
/** set while Plan is on: a ground click adds a waypoint instead of selecting the point (side-panel.ts) */
export const planning = { on: false };

type Ask = (cmd: Omit<Command, 'type' | 'id'>) => Promise<CommandAck>;
export interface MissionHost {
  ask: Ask;
  /** home of the placed drone (its ground height MSL), or null before a drone is placed */
  home(): { lat: number; lon: number; groundMsl: number } | null;
  state(): DroneState | null;
  /** the pre-flight checklist (P3.3.5): resolves true when take off may go ahead */
  preflight(): Promise<boolean>;
}

const load = (): MissionPoint[] => {
  try {
    const w = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(w) ? w.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)) : [];
  } catch {
    return [];
  }
};

export function mountMission(host: HTMLElement, globe: Globe, mh: MissionHost): {
  progress(s: DroneState | null): void;
  points(): MissionPoint[];
  check(): Promise<ClearanceResult | null>;
  preflightInput(): { routePoints: number; fenceOn: boolean; clearance: { ok: boolean; highestGroundAboveHome: number } | null };
  resetFence(): void;
  set(points: MissionPoint[]): void;
} {
  const { viewer } = globe;
  let wps: MissionPoint[] = load();
  let margin = 50;
  let lastCheck: ClearanceResult | null = null; // of the current points; cleared on any change
  let fenceOn = false;
  const panel = document.createElement('div');
  panel.id = 'mission';
  panel.className = 'panel';
  panel.innerHTML = `<details id="mission-details"><summary><b>Mission</b></summary>
    <div class="row"><button class="btn" id="mission-plan" aria-pressed="false">Plan: off</button><button class="btn" id="mission-clear">Clear</button></div>
    <div class="muted">With Plan on, click the ground to add a point (at most ${MAX_WAYPOINTS}); drag a point to move it.</div>
    <ol id="mission-list" class="list"></ol>
    <div class="row">Margin <input id="mission-margin" class="in" type="number" min="0" max="500" value="${margin}" style="width:4.5em"> m
      <button class="btn" id="mission-check">Check terrain</button></div>
    <svg id="mission-chart" width="300" height="90" class="hidden" role="img" aria-label="Height profile"></svg>
    <div id="mission-result" class="muted"></div>
    <div class="row"><button class="btn" id="mission-fly">Upload and fly</button><button class="btn" id="mission-export">Export mission</button></div>
    <div id="mission-progress" class="mono"></div>
    <hr><b>Geofence</b>
    <div class="row">Max height <input id="fence-alt" class="in" type="number" min="10" max="1000" value="120" style="width:4.5em"> m
      distance <input id="fence-radius" class="in" type="number" min="30" max="10000" value="300" style="width:5em"> m</div>
    <div class="row">On breach <select id="fence-breach" class="in"><option value="rtl">Return home</option><option value="land">Land</option></select>
      <button class="btn" id="fence-set">Set fence</button></div>
    <div id="fence-status" class="muted"></div></details>`;
  host.append(panel);
  const $ = <T extends HTMLElement>(id: string): T => panel.querySelector<T>(`#${id}`)!;
  const result = (t: string): void => void ($('mission-result').textContent = t);

  // ---- drawing: numbered points and the route draped over the terrain
  const marks: Entity[] = [];
  const route = viewer.entities.add({
    id: 'mission-route',
    polyline: {
      positions: new CallbackProperty(() => wps.map((w) => Cartesian3.fromDegrees(w.lon, w.lat)), false),
      clampToGround: true,
      width: 3,
      material: Color.CYAN,
    },
  });
  void route;
  const save = (): void => {
    try {
      localStorage.setItem(KEY, JSON.stringify(wps));
    } catch {
      /* storage blocked: the mission lasts for this page view */
    }
  };
  const draw = (): void => {
    marks.splice(0).forEach((e) => viewer.entities.remove(e));
    wps.forEach((w, i) => marks.push(viewer.entities.add({
      id: `wp-${i}`,
      position: Cartesian3.fromDegrees(w.lon, w.lat),
      point: { pixelSize: 14, color: Color.CYAN, outlineColor: Color.BLACK, outlineWidth: 2, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: String(i + 1), font: '13px system-ui, sans-serif', fillColor: Color.BLACK, pixelOffset: new Cartesian2(0, 0), heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    })));
    $('mission-list').replaceChildren(...wps.map((w, i) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.dataset.i = String(i);
      li.innerHTML = `<span class="mono">${i + 1}</span>
        <input class="in wp-alt" type="number" min="2" max="120" value="${w.alt}" style="width:4em" aria-label="Height of point ${i + 1}"> m
        <input class="in wp-speed" type="number" min="1" max="15" value="${w.speed}" style="width:3.5em" aria-label="Speed to point ${i + 1}"> m/s
        <button class="btn wp-del" aria-label="Delete point ${i + 1}">×</button>`;
      const num = (sel: string, lo: number, hi: number, key: 'alt' | 'speed'): void => {
        const input = li.querySelector<HTMLInputElement>(sel)!;
        input.addEventListener('change', () => {
          const v = Number(input.value);
          if (v >= lo && v <= hi) wps[i][key] = v, save();
          else input.value = String(wps[i][key]); // out of range: back to the last good value
        });
      };
      num('.wp-alt', 2, 120, 'alt');
      num('.wp-speed', 1, 15, 'speed');
      li.querySelector('.wp-del')!.addEventListener('click', () => (wps.splice(i, 1), changed()));
      return li;
    }));
    viewer.scene.requestRender();
  };
  const changed = (): void => {
    lastCheck = null;
    save();
    draw();
    $('mission-chart').classList.add('hidden');
    result('');
  };
  draw();

  // ---- editing on the globe: click adds (Plan on), drag moves; a drag never also adds a point
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  let drag: number | null = null;
  let moved = false;
  const wpAt = (p: Cartesian2): number | null => {
    const id = (viewer.scene.pick(p) as { id?: Entity } | undefined)?.id?.id;
    return typeof id === 'string' && id.startsWith('wp-') ? Number(id.slice(3)) : null;
  };
  handler.setInputAction((e: { position: Cartesian2 }) => {
    drag = wpAt(e.position);
    moved = false;
    if (drag !== null) viewer.scene.screenSpaceCameraController.enableInputs = false;
  }, ScreenSpaceEventType.LEFT_DOWN);
  handler.setInputAction((e: { endPosition: Cartesian2 }) => {
    if (drag === null) return;
    const g = pickGround(viewer, e.endPosition.x, e.endPosition.y);
    if (!g) return;
    wps[drag] = { ...wps[drag], lat: g.lat, lon: g.lon };
    moved = true;
    marks[drag].position = Cartesian3.fromDegrees(g.lon, g.lat) as unknown as Entity['position'];
    viewer.scene.requestRender();
  }, ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction(() => {
    if (drag !== null) {
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      if (moved) changed();
    }
    drag = null;
  }, ScreenSpaceEventType.LEFT_UP);
  handler.setInputAction((e: { position: Cartesian2 }) => {
    if (!planning.on || moved || wpAt(e.position) !== null) return void (moved = false);
    if (wps.length >= MAX_WAYPOINTS) return result(`At most ${MAX_WAYPOINTS} points.`);
    const g = pickGround(viewer, e.position.x, e.position.y);
    if (!g) return;
    const prev = wps.at(-1);
    wps.push({ lat: g.lat, lon: g.lon, alt: prev?.alt ?? DEFAULT_ALT, speed: prev?.speed ?? DEFAULT_SPEED });
    changed();
  }, ScreenSpaceEventType.LEFT_CLICK);

  $('mission-plan').addEventListener('click', () => {
    planning.on = !planning.on;
    $('mission-plan').textContent = `Plan: ${planning.on ? 'on' : 'off'}`;
    $('mission-plan').setAttribute('aria-pressed', String(planning.on));
  });
  $('mission-clear').addEventListener('click', () => ((wps = []), changed()));
  $<HTMLInputElement>('mission-margin').addEventListener('change', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (v >= 0 && v <= 500) margin = v;
  });

  // ---- terrain clearance and the height chart: one vertex per sample
  const chart = (r: ClearanceResult): void => {
    const svg = $('mission-chart') as unknown as SVGSVGElement;
    const W = 300, H = 90, P = 4;
    const lo = Math.min(...r.samples.map((s) => s.groundMsl)), hi = Math.max(...r.samples.map((s) => Math.max(s.pathMsl, s.groundMsl)));
    const total = r.samples.at(-1)!.alongM || 1;
    const x = (m: number): number => P + ((W - 2 * P) * m) / total;
    const y = (h: number): number => H - P - ((H - 2 * P) * (h - lo)) / (hi - lo || 1);
    const line = (k: 'pathMsl' | 'groundMsl'): string => r.samples.map((s) => `${x(s.alongM).toFixed(1)},${y(s[k]).toFixed(1)}`).join(' ');
    svg.innerHTML = `<polyline id="chart-ground" points="${line('groundMsl')}" fill="none" stroke="#a0774a" stroke-width="1.5"/>
      <polyline id="chart-path" points="${line('pathMsl')}" fill="none" stroke="cyan" stroke-width="1.5"/>
      ${r.samples.filter((s) => s.flagged).map((s) => `<circle class="chart-flag" cx="${x(s.alongM).toFixed(1)}" cy="${y(s.pathMsl).toFixed(1)}" r="2" fill="red"/>`).join('')}`;
    svg.dataset.samples = String(r.samples.length);
    svg.classList.remove('hidden');
  };
  async function check(): Promise<ClearanceResult | null> {
    const home = mh.home();
    if (!home) return result('Place the drone first: heights are above its home.'), null;
    if (!wps.length) return result('Add points first (Plan on, click the ground).'), null;
    result('Checking the terrain under the route…');
    const pts = routePoints(home, wps, 25);
    const ground = await globe.groundMslMany(pts);
    if (ground.some((g) => g === undefined)) return result('The terrain height is not known along the whole route (it needs terrain: a Cesium ion token).'), null;
    const r = checkClearance(pts, ground.map((g) => terrainHeight(g!)), margin);
    result(r.text);
    chart(r);
    panel.dataset.clearance = r.ok ? 'clear' : 'flagged';
    lastCheck = r;
    return r;
  }
  $('mission-check').addEventListener('click', () => void check());

  // ---- upload and fly (Auto); take off first when on the ground
  let flying = false; // while Upload and fly runs, its own words stay on the progress line
  $('mission-fly').addEventListener('click', async () => {
    if (!wps.length) return result('Add points first.');
    if (flying) return;
    flying = true;
    const say = (t: string): void => void ($('mission-progress').textContent = t);
    try {
      await fly(say);
    } finally {
      flying = false;
    }
  });
  async function fly(say: (t: string) => void): Promise<void> {
    say('Uploading the mission…');
    let a = await mh.ask({ command: 'mission', waypoints: wps });
    if (!a.ok) return say(`Upload: ${a.reason}`);
    const st = mh.state();
    if (!st?.armed || st.altAgl < 2) {
      if (!(await mh.preflight())) return say('Take off stopped by the pre-flight checklist.');
      say('Taking off…');
      a = await mh.ask({ command: 'arm' });
      if (a.ok) a = await mh.ask({ command: 'takeoff', alt: Math.min(100, Math.max(1, wps[0].alt)) });
      if (!a.ok) return say(`Take off: ${a.reason}`);
      const t0 = Date.now();
      while (Date.now() - t0 < 30_000 && (mh.state()?.altAgl ?? 0) < Math.min(wps[0].alt, 100) * 0.8) await new Promise((r) => setTimeout(r, 250));
    }
    a = await mh.ask({ command: 'mode', mode: 'auto' });
    say(a.ok ? 'Flying the mission…' : `Auto: ${a.reason}`);
  }

  // ---- export (P3.4.2): the points as JSON, with the rehearsal notice and what the heights mean
  $('mission-export').addEventListener('click', () => {
    if (!wps.length) return result('Add points first.');
    const file = { notice: REHEARSAL_NOTICE, about: 'Drone World Simulator mission: heights in metres above home, speeds in m/s; terrain clearance was checked against terrain only: not buildings, trees, poles or wires.', home: mh.home(), waypoints: wps };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1) + '\n'], { type: 'application/json' }));
    a.download = `drone-mission-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---- geofence: parameters to the autopilot, the circle on the ground around home
  let ring: Entity | null = null;
  $('fence-set').addEventListener('click', async () => {
    const altMax = Number($<HTMLInputElement>('fence-alt').value), radius = Number($<HTMLInputElement>('fence-radius').value);
    const breach = $<HTMLSelectElement>('fence-breach').value as 'rtl' | 'land';
    const status = (t: string): void => void ($('fence-status').textContent = t);
    if (!(altMax >= 10 && altMax <= 1000 && radius >= 30 && radius <= 10000)) return status('Height 10 to 1000 m, distance 30 to 10000 m.');
    const home = mh.home();
    if (!home) return status('Place the drone first: the fence is centred on its home.');
    status('Setting the fence…');
    const a = await mh.ask({ command: 'fence', altMax, radius, breach });
    status(a.ok ? `Fence on: ${altMax} m high, ${radius} m from home; a breach ${breach === 'rtl' ? 'returns home' : 'lands'}.` : `Fence: ${a.reason}`);
    if (!a.ok) return;
    fenceOn = true;
    if (ring) viewer.entities.remove(ring);
    ring = viewer.entities.add({ id: 'fence-ring', position: Cartesian3.fromDegrees(home.lon, home.lat), ellipse: { semiMajorAxis: radius, semiMinorAxis: radius, fill: false, outline: true, outlineColor: Color.ORANGE, outlineWidth: 2, height: 0, heightReference: HeightReference.CLAMP_TO_GROUND } });
    // ponytail: outline only; Cesium draws ellipse outlines on terrain at one height, a polyline ring if hills hide it
    viewer.scene.requestRender();
  });

  return {
    /** for the pre-flight checklist: points, the check of the current points (ground above home), fence */
    preflightInput: () => {
      const home = mh.home();
      return { routePoints: wps.length, fenceOn, clearance: lastCheck && home ? { ok: lastCheck.ok, highestGroundAboveHome: Math.max(...lastCheck.samples.map((s) => s.groundMsl)) - home.groundMsl } : null };
    },
    resetFence: () => void (fenceOn = false),
    progress(s) {
      if (s?.wpCount && !flying) $('mission-progress').textContent = s.mode === 'AUTO' ? `Waypoint ${s.wp} of ${s.wpCount}` : `Mission loaded (${s.wpCount} points), mode ${s.mode}`;
    },
    points: () => wps.map((w) => ({ ...w })),
    /** replaces the points (a loaded mission; the checks) */
    set(points: MissionPoint[]) {
      wps = points.slice(0, MAX_WAYPOINTS).map((w) => ({ ...w }));
      changed();
    },
    check,
  };
}
