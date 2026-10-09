import './globe/cesium-env'; // must stay first: sets CESIUM_BASE_URL before Cesium is used
import './ui/app.css';
import { Cartesian3, Color, JulianDate, Math as CesiumMath, Cartographic, Matrix3, Matrix4, RequestScheduler, SceneTransforms, Transforms } from 'cesium';
import type { TerrainProvider } from 'cesium';
import { pickGround } from './globe/picking';
import { START_VIEW, createGlobe, watchTiles } from './globe/viewer';
import type { Problem } from './globe/viewer';
import { createMapillaryProvider } from './panorama/mapillary';
import { createMockProvider } from './panorama/mock';
import { createPanoramaxProvider } from './panorama/panoramax';
import { createKartaViewProvider } from './panorama/kartaview';
import { combineProviders } from './panorama/provider';
import type { MockScenario } from './panorama/mock';
import { CESIUM_ROLL_SIGN, MODEL_HEADING_OFFSET_DEG, mountDrone } from './drone/model';
import { mountDroneViews } from './drone/views';
import { startEmitter, Sticks, throttleOut } from './input/controls';
import { mountKeyboard } from './input/keyboard';
import { mountPadSetup } from './input/gamepad';
import { padToControl } from './input/pad-profile';
import type { PadSetup } from './input/gamepad';
import type { Action } from './input/keyboard';
import type { Command, CommandAck, DroneState } from './net/contract';
import { mslToEllipsoid } from './globe/coords';
import { createBridgeClient } from './net/client';
import type { BridgeClient } from './net/client';
import { mountControls } from './ui/controls';
import { mirrorCredits } from './ui/credits';
import { mountDebugPanel } from './ui/debug-panel';
import { isAirborne, mountFlightButtons } from './ui/flight-buttons';
import { mountInstruments } from './ui/instruments';
import { mountReplay } from './ui/replay';
import { mountMission } from './mission/editor';
import { mountParams } from './mission/params';
import { preflight } from './mission/checklist';
import { mountPreflight } from './mission/preflight-ui';
import { mountConditions } from './ui/conditions';
import { mountCoverage } from './ui/coverage';
import { summarise, summaryText } from './drone/summary';
import type { FlightEvent } from './drone/summary';
import { FLAT_GROUND_WARNING, GroundWatch } from './drone/ground';
import type { Crash } from './drone/ground';
import { geoidHeight } from './globe/coords';
import { DISARM_IN_AIR } from './input/keyboard';
import { mountEyeViews } from './ui/eyeviews';
import { mountLayout } from './ui/layout';
import { mountMyPhotos } from './ui/myphotos';
import { mountWhatIsHere } from './ui/whatishere';
import { clearNotice, initNotices, showNotice } from './ui/notices';
import { mountPanorama } from './ui/panorama';
import { allPlaces } from './ui/places';
import { mountReadouts } from './ui/readouts';
import { TOWN_RANGE } from './globe/camera';
import { mountSearchBox } from './ui/search-box';
import { resolveMapillaryToken, resolveToken } from './ui/settings';
import { mountSidePanel } from './ui/side-panel';

const OFFLINE_MSG = 'No connection to the map servers. Terrain, satellite imagery and place search need the internet; the offline map still works.';

async function boot(): Promise<void> {
  const regions = mountLayout(document.getElementById('ui')!);
  initNotices(regions.notices);
  const token = resolveToken();
  if (!token) {
    showNotice(
      'token-missing',
      'Cesium ion token missing: showing the offline Natural Earth map. Add a free token from cesium.com/ion in Settings (or web/.env.local) for terrain and satellite imagery.',
    );
  }
  if (!navigator.onLine) showNotice('offline', OFFLINE_MSG);
  window.addEventListener('offline', () => showNotice('offline', OFFLINE_MSG));
  window.addEventListener('online', () => clearNotice('offline'));

  const onProblem = (p: Problem): void =>
    p === 'token'
      ? showNotice('token-bad', 'Cesium ion rejected the token. Check it in Settings (cesium.com/ion, Access Tokens). Showing the offline map.', 'error')
      : showNotice('offline', OFFLINE_MSG);
  const globe = await createGlobe(document.getElementById('globe')!, token, { creditContainer: regions.cesiumCredits, onProblem });
  const { viewer } = globe;

  // the places drawer's Fly drone: fly the camera there, then place the drone on the ground below (needs terrain)
  mountSearchBox(regions.tl, globe, async (lat, lon, out) => {
    out.textContent = 'Flying there…';
    await globe.flyToPlace(lat, lon, TOWN_RANGE);
    const msl = await globe.groundMsl(lat, lon);
    if (msl === undefined) return void (out.textContent = 'The ground height here is not known (it needs terrain: add a Cesium ion token in Settings).');
    placeDrone(lat, lon, msl, out);
  });
  mountControls(regions.tr, globe);
  mountReadouts(regions, globe);

  // Stand here (eye level), the drone-eye view and the 360 view, all started from the selected-point panel
  const eyes = mountEyeViews(regions, globe);
  const { stand } = eyes;
  const params = new URLSearchParams(location.search);
  // street-level images: Mapillary, Panoramax and KartaView together by default (a true 360 from any, nearest first, then
  // flat photos; P1.12.5); ?pano=mapillary, panoramax, kartaview or mock picks one (tests)
  const pick = params.get('pano');
  const provider =
    pick === 'mock' ? createMockProvider((params.get('mock') ?? 'near') as MockScenario)
    : pick === 'mapillary' ? createMapillaryProvider(resolveMapillaryToken())
    : pick === 'panoramax' ? createPanoramaxProvider()
    : pick === 'kartaview' ? createKartaViewProvider()
    : combineProviders([createMapillaryProvider(resolveMapillaryToken()), createPanoramaxProvider(), createKartaViewProvider()]);
  const pano = mountPanorama(globe, provider, { standHere: eyes.standHere, lookAround: eyes.lookAround });
  mountSidePanel(regions.side, globe, {
    standHere: eyes.standHere,
    enterPlace: (lat, lon, out) => void pano.enterPlace(lat, lon, out),
    myPhotos: mountMyPhotos(pano),
    whatIsHere: mountWhatIsHere(globe, provider),
    placeDrone: (lat, lon, msl, out) => placeDrone(lat, lon, msl, out),
  });
  mirrorCredits();
  const coverage = mountCoverage(regions.tr, globe, provider); // P1.12.4: 360 dots near the camera, off by default
  // the drone bridge: only with ?bridge (or ?bridge=ws://host:port) for now, so a page without a running bridge logs no
  // failed connections; Place drone here starts it in P2A.3.2
  // the drone bridge: started on first use (Place drone here), or at once with ?bridge (also shows the debug panel), so a
  // page that never places a drone logs no failed connections. Place requests run one at a time; their progress and
  // answer go to the panel that asked.
  const drone = mountDrone(viewer); // hidden until the first DroneState with a GPS fix
  const views = mountDroneViews(viewer, drone); // C cycles chase, first-person, top-down, free
  let bridge: BridgeClient | null = null;
  let placing: { id: number; out: HTMLElement } | null = null;
  let lastPlace: { lat: number; lon: number; altMsl: number; out: HTMLElement } | null = null;
  let lastState: DroneState | null = null;
  let nextId = 1;
  const answers = new Map<number, (a: CommandAck) => void>();
  const instruments = mountInstruments(regions.tl); // hidden until a DroneState arrives
  // ground contact against real terrain (P2A.6.2): the drawn terrain under the drone, as MSL
  const watch = new GroundWatch(0);
  const crashBox = document.createElement('div');
  crashBox.id = 'crash-result';
  crashBox.className = 'panel crash hidden';
  regions.tl.append(crashBox);
  const showCrash = (c: Crash | null): void => {
    crashBox.classList.toggle('hidden', !c);
    if (!c) return;
    crashBox.innerHTML = `<b>Crash: the drone hit the ground</b>
      <div>Time ${c.t.slice(11, 19)} UTC</div>
      <div>Place ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)} (ground ${c.groundMsl.toFixed(0)} m MSL, drone ${c.altMsl.toFixed(0)} m MSL)</div>
      <div>Speed ${c.groundSpeed.toFixed(1)} m/s across, ${Math.abs(c.verticalSpeed).toFixed(1)} m/s ${c.verticalSpeed < 0 ? 'down' : 'up'}</div>
      <div class="muted">The simulator's own ground is flat, so it kept flying; the app stopped the drone where it met the real terrain. Press R or Place drone here to start again.</div>`;
  };
  const groundMslAt = (lat: number, lon: number): number | undefined => {
    if (!globe.hasTerrain()) return undefined;
    const h = viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat));
    return h === undefined ? undefined : h - geoidHeight(lat, lon);
  };
  // the flight summary (P3.1.3): recorded from arming, shown when the drone disarms
  const summaryBox = document.createElement('div');
  summaryBox.id = 'flight-summary';
  summaryBox.className = 'panel hidden';
  regions.tl.append(summaryBox);
  let flight: { states: DroneState[]; events: FlightEvent[] } | null = null;
  const endFlight = (): void => {
    if (!flight) return;
    const sum = summarise(flight.states, flight.events, groundMslAt);
    summaryBox.innerHTML = `<div class="row between"><b>Flight summary</b><button class="btn" id="summary-close" aria-label="Close">×</button></div><ul>${summaryText(sum).map((l) => `<li>${l}</li>`).join('')}</ul>`;
    summaryBox.querySelector('#summary-close')!.addEventListener('click', () => summaryBox.classList.add('hidden'));
    summaryBox.classList.remove('hidden');
    summaryBox.dataset.summary = JSON.stringify(sum);
    flight = null;
  };
  /** every DroneState goes through here (bridge, or the e2e hook) */
  const handleState = (st: DroneState): void => {
    if (st.armed && !flight) flight = { states: lastState ? [lastState] : [], events: [{ kind: 'arm' }] };
    flight?.states.push(st);
    if (flight && !st.armed) endFlight();
    lastState = st;
    drone.set(st);
    instruments(st);
    mission.progress(st);
    const r = watch.update(st, groundMslAt(st.lat, st.lon));
    if (r.crash) {
      drone.freeze(true);
      showCrash(r.crash);
      bridge?.send({ type: 'event', kind: 'crash', ...r.crash }); // into the flight log
      flight?.events.push({ kind: 'crash' });
    }
    if (r.warning) showNotice('flat-ground', FLAT_GROUND_WARNING(watch.homeMsl), 'info');
    else clearNotice('flat-ground');
  };
  let pad: PadSetup | null = null; // the controller setup (created with the bridge)
  const actionLog: Action[] = []; // what the keys, buttons and controller asked for (the e2e hook reads it)
  const sticks = new Sticks(); // the keyboard pushes these; the emitter sends them 25 times a second (P2A.5.1)
  const ensureBridge = (): BridgeClient => {
    if (bridge) return bridge;
    // ?bridge=URL or ?ws=URL picks another bridge (the checks use 8001); a bare ?bridge only shows the debug panel
    const b = createBridgeClient(params.get('bridge') || params.get('ws') || undefined);
    // P2B: the controller panel; a controller that drops out mid-flight leaves the drone in Loiter with the keyboard's
    // (centred) sticks (P2B.2.3)
    pad = mountPadSetup(regions.br, (a) => runAction(a), () => {
      if (!lastState?.armed) return;
      command({ command: 'mode', mode: 'loiter' });
      showNotice('pad-lost', 'Controller disconnected: the drone holds position in Loiter, and the keyboard has the sticks.', 'warn');
    });
    const buttons = mountFlightButtons(regions.br, (id) => {
      if (id === 'disarm') return void ((!isAirborne(lastState) || window.confirm(DISARM_IN_AIR)) && command({ command: 'disarm' }));
      if (id === 'arm') return command({ command: 'arm' });
      runAction(id);
    });
    b.onState((st) => {
      handleState(st);
      buttons(b.status === 'connected', st);
    });
    let dropped = false;
    b.onStatus((st) => {
      buttons(st === 'connected', lastState);
      // link-loss safety (P2A.6.3): the bridge sends the drone home (RTL) and holds the sticks until a mode is chosen
      if (st === 'disconnected' && lastState?.armed) dropped = true;
      if (st === 'connected' && dropped) showNotice('sticks-locked', 'The connection dropped, so the drone is returning home (RTL). Choose a mode (1, 2 or 3) to take the sticks back.', 'info');
      if (st !== 'connected') instruments(null); // no stale numbers while the bridge is away
    });
    buttons(false, null);
    b.onProgress((p) => placing?.id === p.id && (placing.out.textContent = p.text));
    b.onAck((a) => {
      answers.get(a.id)?.(a);
      answers.delete(a.id);
      if (placing?.id !== a.id) return;
      placing.out.textContent = a.ok ? 'Ready' : `Could not place the drone: ${a.reason}`;
      placing = null;
    });
    // throttle down while disarmed: ArduCopter refuses to arm with the throttle up (measured, decisions.md)
    // the controller wins over the keyboard while it has a profile (P2B.2.2); throttle down while disarmed either way
    const indicator = (): HTMLElement | null => document.getElementById('input-indicator');
    startEmitter(sticks, (c) => void b.send(c), (c) => {
      const p = pad?.sticks();
      const out = p ? padToControl(p) : c;
      const label = `Input: ${p ? 'Controller' : 'Keyboard'}`;
      const ind = indicator();
      if (ind && ind.textContent !== label) ind.textContent = label;
      return { ...out, throttle: throttleOut(out.throttle, lastState) };
    });
    return (bridge = b);
  };
  /** Sends a command; a refusal is shown as a notice in the autopilot's words. */
  const command = (cmd: { command: 'arm' | 'disarm' | 'takeoff' | 'land' | 'mode'; mode?: 'loiter' | 'altHold' | 'stabilize' | 'rtl'; alt?: number }): void => {
    if (!bridge || !lastState) return void showNotice('drone-cmd', 'Place a drone first (click the ground, then Place drone here).', 'info');
    const id = nextId++;
    answers.set(id, (a) => {
      if (!a.ok) return showNotice('drone-cmd', `${cmd.command}${cmd.mode ? ' ' + cmd.mode : ''}: ${a.reason}`, 'info');
      clearNotice('drone-cmd');
      if (cmd.command === 'mode') clearNotice('sticks-locked'); // the bridge hands the sticks back on a mode command
    });
    bridge.send({ type: 'command', id, ...cmd });
  };
  /** A command answered as a promise (Conditions panel, P3.2): no drone or no bridge gives a plain refusal. */
  const ask = (cmd: Omit<Command, 'type' | 'id'>): Promise<CommandAck> => {
    const id = nextId++;
    if (!bridge || !lastState) return Promise.resolve({ type: 'ack', id, ok: false, reason: 'place a drone first (click the ground, then Place drone here)' });
    return new Promise((res) => {
      const t = setTimeout(() => (answers.delete(id), res({ type: 'ack', id, ok: false, reason: 'no answer from the bridge within 30 s' })), 30_000); // a battery change confirms 5 settings; a busy simulator answers slowly
      answers.set(id, (a) => (clearTimeout(t), res(a)));
      bridge!.send({ type: 'command', id, ...cmd } as Command);
    });
  };
  const conditions = mountConditions(regions.tr, ask);
  const pre = mountPreflight(regions.tl);
  // P3.3.5: every take off (keys, buttons, controller, mission) passes the pre-flight checklist first
  const preflightOk = (): Promise<boolean> =>
    pre.gate(preflight({ homeSet: lastPlace !== null, gpsFix: lastState?.gpsFix ?? null, batteryPct: lastState?.batteryPct ?? null, wind: conditions.wind(), rtlAltM: paramsPanel.current().RTL_ALT_M ?? null, ...mission.preflightInput() }));
  const mission = mountMission(regions.bl, globe, {
    ask,
    home: () => (lastPlace ? { lat: lastPlace.lat, lon: lastPlace.lon, groundMsl: lastPlace.altMsl } : null),
    state: () => lastState,
    preflight: () => preflightOk(),
  });
  const paramsPanel = mountParams(regions.bl, ask); // P3.4
  const runAction = (a: Action): void => {
    actionLog.push(a);
    if (a === 'camera') return void views.cycle();
    if (a === 'reset') return lastPlace ? placeDrone(lastPlace.lat, lastPlace.lon, lastPlace.altMsl, lastPlace.out) : showNotice('drone-cmd', 'Place a drone first (click the ground, then Place drone here).', 'info');
    if (a === 'arm') return command({ command: lastState?.armed ? 'disarm' : 'arm' });
    if (a === 'takeoff') return void preflightOk().then((ok) => ok && command({ command: 'takeoff', alt: 10 }));
    if (a === 'land') return command({ command: 'land' });
    if (a === 'rtl') return command({ command: 'mode', mode: 'rtl' });
    if (a !== 'release') command({ command: 'mode', mode: a });
  };
  mountKeyboard({
    sticks,
    busy: () => eyes.stand.isActive(), // Stand here walks with W A S D and leaves with Esc
    airborne: () => isAirborne(lastState),
    confirm: (q) => window.confirm(q),
    run: runAction,
  });
  if (params.has('bridge')) mountDebugPanel(regions.tl, ensureBridge());
  // replay a flight log (P3.1.2): drawn through the same drone and instruments, not the live bridge
  if (params.has('replay')) mountReplay(regions.tl, (st) => {
    drone.set(st);
    instruments(st);
  });
  const placeDrone = (lat: number, lon: number, altMsl: number, out: HTMLElement): void => {
    const b = ensureBridge();
    lastPlace = { lat, lon, altMsl, out };
    pre.reset(); // a new place: warnings are asked again
    mission.resetFence(); // a new simulator has no fence until it is set again
    conditions.reset();
    watch.reset(altMsl); // a new place: home height for the flat-ground warning, no crash
    drone.freeze(false);
    showCrash(null);
    const heading = Math.round((CesiumMath.toDegrees(viewer.camera.heading) + 360) % 360) % 360; // face where the camera looks
    placing = { id: nextId++, out };
    const cmd = { type: 'command' as const, id: placing.id, command: 'place' as const, lat, lon, altMsl, heading };
    out.textContent = 'Connecting to the drone bridge…';
    const t0 = Date.now();
    const trySend = (): void => {
      if (b.send(cmd)) return;
      if (Date.now() - t0 < 5000) return void setTimeout(trySend, 200);
      out.textContent = 'The drone bridge is not running. It runs under PM2 as droneworld-bridge: in an admin terminal, pm2 restart droneworld-bridge (pm2 logs droneworld-bridge shows why it stopped).';
      placing = null;
    };
    trySend();
  };
  watchTiles(viewer, (slow) =>
    slow ? showNotice('slow-tiles', 'Map tiles are loading slowly. The picture will sharpen when they arrive.', 'info') : clearNotice('slow-tiles'),
  );

  if (new URLSearchParams(location.search).has('e2e')) {
    // test hook for the headless acceptance checks (e2e/): ?e2e=1 exposes the viewer and a few probes
    const degrees = (c: Cartesian3 | undefined): [number, number] | null => {
      if (!c) return null;
      const g = Cartographic.fromCartesian(c);
      return [CesiumMath.toDegrees(g.latitude), CesiumMath.toDegrees(g.longitude)];
    };
    const hook = {
      globe,
      viewer,
      stand,
      eyes,
      pano,
      provider,
      bridge: () => bridge,
      drone,
      views,
      sticks,
      instruments,
      pad: () => pad,
      coverage,
      mission,
      /** canvas pixel of a ground point (mission drag checks), or null when off screen */
      screenOf: (lat: number, lon: number) => {
        const h = viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat)) ?? 0;
        const p = SceneTransforms.worldToWindowCoordinates(viewer.scene, Cartesian3.fromDegrees(lon, lat, h));
        return p ? [p.x, p.y] : null;
      },
      actionLog,
      /** feeds a DroneState through the same path as the bridge's */
      feedState: (st: DroneState) => handleState(st),
      setHome: (msl: number) => watch.reset(msl),
      /** a home for the mission checks without a simulator (heights are above it) */
      setPlace: (lat: number, lon: number, altMsl: number) => void (lastPlace = { lat, lon, altMsl, out: document.createElement('div') }),
      crash: () => watch.crash,
      /** the drone as Cesium holds it now: position (degrees, ellipsoid metres) and orientation (heading, pitch, roll) */
      droneNow: () => {
        const t = viewer.clock.currentTime;
        const pos = drone.entity.position?.getValue(t);
        const q = drone.entity.orientation?.getValue(t);
        if (!pos || !q) return null;
        const hpr = Transforms.fixedFrameToHeadingPitchRoll(Matrix4.fromRotationTranslation(Matrix3.fromQuaternion(q), pos));
        const c = Cartographic.fromCartesian(pos);
        const deg = CesiumMath.toDegrees;
        // back in ArduPilot's terms (model.ts: heading offset, roll sign)
        return { lat: deg(c.latitude), lon: deg(c.longitude), h: c.height, heading: (deg(hpr.heading) - MODEL_HEADING_OFFSET_DEG + 720) % 360, pitch: deg(hpr.pitch), roll: CESIUM_ROLL_SIGN * deg(hpr.roll) };
      },
      mslToEllipsoid,
      /** Cesium's network requests in flight (it keeps drawing frames while it waits for them) */
      activeRequests: () => (RequestScheduler as unknown as { statistics: { numberOfActiveRequests: number } }).statistics.numberOfActiveRequests,
      fromDegrees: (lon: number, lat: number, h: number) => Cartesian3.fromDegrees(lon, lat, h),
      /** sets the scene clock (models are lit by the sun at this time) */
      setTime: (iso: string) => void (viewer.clock.currentTime = JulianDate.fromIso8601(iso)),
      ready: false,
      flat: () => !globe.hasTerrain(),
      settled: () =>
        hook.ready &&
        viewer.imageryLayers.length > 0 &&
        Array.from({ length: viewer.imageryLayers.length }, (_, i) => viewer.imageryLayers.get(i).ready).every(Boolean) &&
        (!token || globe.hasTerrain()) &&
        viewer.scene.globe.tilesLoaded &&
        // with the 3D buildings toggle on, the tileset must exist (it loads after the globe) and have its tiles
        (!document.querySelector<HTMLInputElement>('#buildings-toggle')?.checked || globe.buildings()?.tilesLoaded === true),
      /** camera height above the terrain as drawn under it, metres (undefined where no terrain is loaded) */
      aboveTerrain: (): number | undefined => {
        const c = viewer.camera.positionCartographic;
        const g = viewer.scene.globe.getHeight(c);
        return g === undefined ? undefined : c.height - g;
      },
      /** ellipsoid height of the top of whatever is drawn at lat/lon (terrain or a building roof), most detailed */
      topAt: async (lat: number, lon: number): Promise<number | undefined> => {
        const markers = ['selected', 'home', 'pano'].map((id) => viewer.entities.getById(id)).filter((e) => e !== undefined);
        return (await viewer.scene.sampleHeightMostDetailed([Cartographic.fromDegrees(lon, lat)], markers))[0]?.height;
      },
      /** puts a 30 m wide, 2 m deep, 10 m tall test wall centred on lat/lon (or removes it with no arguments) */
      wall: (lat?: number, lon?: number): void => {
        viewer.entities.removeById('test-wall');
        if (lat === undefined || lon === undefined) return void viewer.scene.requestRender();
        const ground = viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat)) ?? 0;
        viewer.entities.add({ id: 'test-wall', position: Cartesian3.fromDegrees(lon, lat, ground + 5), box: { dimensions: new Cartesian3(30, 2, 10), material: Color.RED } });
        viewer.scene.requestRender();
      },
      /** the 360 marker as drawn: its point and the bearing of its view-direction line, or null */
      panoMarker: (): { lat: number; lon: number; bearing: number } | null => {
        const e = viewer.entities.getById('pano');
        const line = e?.polyline?.positions?.getValue(JulianDate.now()) as Cartesian3[] | undefined;
        const at = degrees(e?.position?.getValue(JulianDate.now()));
        if (!at || !line || line.length < 2) return null;
        const [a, b] = line.map((p) => degrees(p)!);
        const east = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
        const bearing = ((Math.atan2(east, b[0] - a[0]) * 180) / Math.PI + 360) % 360;
        return { lat: at[0], lon: at[1], bearing };
      },
      toSpace: (): void => viewer.camera.setView({ destination: Cartesian3.fromDegrees(START_VIEW.lon, START_VIEW.lat, START_VIEW.height) }),
      /** canvas CSS pixel of a lat/lon at the given ellipsoid height */
      project: (lat: number, lon: number, h = 0): [number, number] | null => {
        const p = viewer.scene.cartesianToCanvasCoordinates(Cartesian3.fromDegrees(lon, lat, h));
        return p ? [p.x, p.y] : null;
      },
      places: () => allPlaces(),
      /** finest terrain level Cesium has at a lat/lon (level 13 is about 40 m between height points), or undefined */
      terrainLevel: (lat: number, lon: number): number | undefined => (viewer.terrainProvider as TerrainProvider | undefined)?.availability?.computeMaximumLevelAtPosition(Cartographic.fromDegrees(lon, lat)),
      /** [lat, lon] of the ground under a canvas pixel, as the click handler would pick it */
      pick: (x: number, y: number): [number, number] | null => {
        const g = pickGround(viewer, x, y);
        return g ? [g.lat, g.lon] : null;
      },
      /** height of the rendered terrain surface at a lat/lon, metres above the ellipsoid */
      surface: (lat: number, lon: number): number | undefined => viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat)),
      /** [lat, lon] of a marker entity ('selected' or 'home'), or null */
      marker: (id: string): [number, number] | null => degrees(viewer.entities.getById(id)?.position?.getValue(JulianDate.now())),
    };
    (window as unknown as { __dw: typeof hook }).__dw = hook;
    const off = viewer.scene.postRender.addEventListener(() => {
      hook.ready = true;
      off();
    });
  }
}

void boot();
