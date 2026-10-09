# Roadmap

Where the project is: the globe, street-level views, the simulated drone with keyboard and controller, conditions,
missions with terrain clearance and geofence, parameter profiles and flight logs all work on Windows (README.md).
Next: run on more systems, close the attribution and latency gaps, and grow the mission tools.

## Good first issues

Each issue has acceptance criteria: the change is done when its check passes and the existing checks still pass
(`npm test`, `npm run build`, bridge `pytest`).

### 1. Simulator start script for Linux and macOS
The only start script is `sim/start-sitl.ps1` (Windows, prebuilt Cygwin SITL). Add `sim/start-sitl.sh` that gets an
ArduCopter SITL from an official ArduPilot source (a prebuilt Linux binary from firmware.ardupilot.org if one is
published, otherwise building from the ArduPilot repository with its own `Tools/environment_install` scripts) and starts
it with the same arguments as the PowerShell script (loopback only, `--defaults sim/copter-min.parm`, serial ports
14550/14561/14562). Teach `bridge/sitl.py` to start that binary on Linux and macOS.
**Acceptance:** on Ubuntu 24.04 and on macOS, `python sim/spike.py --start --heartbeat` prints a HEARTBEAT within 60 s;
`netstat`/`lsof` shows nothing listening on a non-loopback address; the README quick start has the steps.

### 2. Mapillary logo in the attribution
Mapillary's terms (section 11) ask for its logo and a link wherever API data is shown; the app shows a text credit only.
**Acceptance:** with the 360 coverage layer on and with a Mapillary picture open, the Mapillary logo (from Mapillary's
own brand resources, with its licence noted in THIRD_PARTY.md) links to mapillary.com; a browser check asserts it is
visible in both cases and absent when no Mapillary data is shown.

### 3. A steady 5 m/s wind preset
The presets are calm, 3 m/s, 8 m/s and gusty 5+4 m/s; a moderate steady wind is missing.
**Acceptance:** a "Moderate 5 m/s" choice in Conditions sets SIM_WIND_SPD 5, SIM_WIND_DIR 270, SIM_WIND_TURB 0 (read back
equal); the contract fixtures and both contract tests include it; the pre-flight checklist rates it a pass.

### 4. Golden flight thresholds
`bridge/tests/golden.py` flies a scripted calm-air mission and reports position and time drift against a saved path.
**Acceptance:** after five runs on one machine, `data/golden/thresholds.json` holds the limits (largest observed drift
times 1.5, at least 3 m and 2 s) with the run numbers in docs/decisions.md; a sixth run prints `"pass": true`.

### 5. Polygon geofence
The geofence is a circle around home plus a maximum height. Add a polygon fence drawn on the globe.
**Acceptance:** drawing 4+ points and pressing Set fence uploads an inclusion polygon (MAVLink fence mission type) that
the autopilot accepts; flying out of it in the simulator gives a breach event in the flight log and the chosen breach
action with no key press; the polygon is drawn on the terrain.

### 6. Terrain-following fence ring
The fence circle is drawn as an outline at one height, which hills can hide (`web/src/mission/editor.ts`).
**Acceptance:** the ring is a polyline clamped to the ground (one point every 10 m); a headless check over hilly terrain
(Mount Abu) finds every ring point within 2 m of the terrain height under it.

### 7. Great-circle route sampling
Route points between waypoints are interpolated in straight degrees (`web/src/mission/clearance.ts`), fine for short legs.
**Acceptance:** sampling follows the great circle; a unit test with a 50 km east-west leg at latitude 60 degrees puts
every sample within 1 m of the great-circle path, and the existing clearance tests still pass.

### 8. Mission export and import in QGroundControl's .plan format
Missions export as this project's own JSON.
**Acceptance:** Export writes a `.plan` file that QGroundControl's documented format accepts (fileType Plan, version 1,
mission items with frames and commands), still carrying the rehearsal-only notice; Import reads it back to the same
points, heights and speeds (round-trip unit test).

### 9. Faster key-to-motion feedback
Key press to visible motion is about 350 ms median; most of it is the autopilot's response (docs/decisions.md has the
split). Investigate drawing the commanded attitude immediately (a predicted pose) while the true state arrives.
**Acceptance:** `npm run e2e:latency` reports a median under 200 ms from key press to the first frame showing motion,
the drawn drone never differs from the reported state by more than 1 m or 3 degrees once a state arrives, and the
measured split is updated in docs/decisions.md.

### 10. Key-binding table test in jsdom
Key bindings are tested by a pure table and in a real browser; a jsdom-level DOM test is missing.
**Acceptance:** with jsdom as a dev dependency, a vitest file dispatches real `KeyboardEvent`s for every binding in
`web/src/input/keyboard.ts`: each fires its action once, Esc centres all sticks, Enter while airborne asks first, and
keys typed in an input box are ignored.

## Later
- Flying real drones is out of scope: this is a rehearsal tool.
- Photorealistic 3D cities (Google 3D Tiles through Cesium ion) behind a setting, with its own attribution.
- Multiplayer or shared rehearsals.
