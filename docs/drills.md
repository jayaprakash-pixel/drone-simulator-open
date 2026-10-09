# Failure drills

The plan (p.21) asks for failure drills at the end of Phases 1, 2a and 2b. Each drill is automated (`npm run e2e` in `web/`, headless Edge on the real GPU) and checks three things: the app shows its own plain message, the screen is never blank, and nothing throws an uncaught exception. Later phases append their own sections below.

## Phase 1: world globe (run 2026-10-08, 86 checks, 0 failed)

| Drill | How the script triggers it | What the app shows | Globe | Result |
|---|---|---|---|---|
| Wrong token | a made-up token is stored in the page's settings before it loads | `#token-bad`: "Cesium ion rejected the token. Check it in Settings (cesium.com/ion, Access Tokens). Showing the offline map." | offline Natural Earth map put underneath, ready and visible | pass |
| Map servers unreachable | every request to cesium.com and virtualearth.net is refused at start | `#offline`: "No connection to the map servers. Terrain, satellite imagery and place search need the internet; the offline map still works." | offline map visible | pass |
| Connection lost while the app is open | the browser goes offline after loading, then a flight to Tokyo is started | the same `#offline` message appears; the camera still comes to rest (3.4 s); the message disappears by itself when the connection returns | still drawn | pass |
| Throttled tiles | every map-data request waits 12 s | `#slow-tiles` after about 8 s: "Map tiles are loading slowly. The picture will sharpen when they arrive."; it disappears once tiles arrive | drawn | pass |
| Empty search | the search service answers with no results | `#no-results`: `No places found for "<query>". Try a different spelling or a bigger place nearby.` | n/a | pass |
| Search service error | the search service answers HTTP 500 | `#search-failed`: "Place search failed (no internet, or the free service is busy). Try again in a moment." | n/a | pass |
| Offline search | the browser goes offline, then a search is made | `#offline` and `#search-failed` together | still drawn | pass |

Persistence in the same run (a reload restores everything): the home point comes back at the identical six-decimal coordinates; resolution, units, coordinate format and a user-saved place survive; the terrain exaggeration is back to 1x on every fresh load by design.

Not applicable yet: closing the tab mid-flight, unplugging a controller and killing the bridge need a drone and a bridge (Phases 2a and 2b).

## Phase 1, P1.8: the 360 view (run 2026-10-08, e2e/pano.mjs, 0 failed)

The real Mapillary provider runs against canned Graph API replies. One page load goes through every failure in turn, and each one replaces the previous message. "No image nearby" uses the mock provider.

| Drill | How the script triggers it | What the app shows | Screen | Result |
|---|---|---|---|---|
| No Mapillary token | no token anywhere (`?nomly=1`) | `#pano-no-token`: "The 360 view needs a free Mapillary client token: add it in Settings (or in web/.env.local as VITE_MAPILLARY_TOKEN). Until then, Stand here shows the place in 3D." | globe stays | pass |
| Bad token | the API answers HTTP 400 with error code 190 | `#pano-bad-token`: "Mapillary rejected the token. Check the Mapillary token in Settings." | globe stays, no empty viewer | pass |
| Rate limit | HTTP 400 with error code 4 ("Application request limit reached") | `#pano-rate-limit`: "Mapillary is limiting requests right now. Wait a minute and try again." | globe stays | pass |
| Offline | every Mapillary request is refused | `#pano-offline`: "No connection to Mapillary: the 360 view needs the internet." | globe stays | pass |
| Provider error | HTTP 503 with an HTML page | `#pano-provider-error`: "Mapillary did not answer properly. Try again later." | globe stays | pass |
| Viewer cannot show the image | the search finds an image, but the canned server cannot feed MapillaryJS | `#pano-viewer`: "The 360 viewer could not show this image. Try another point, or Stand here." | the viewer closes itself, globe back | pass |
| No image within 100 m | mock: nearest panorama 639 m away | "No street-level image within 100 m of this point. The nearest is 639 m away (360° panorama, ...)." with Go to nearest and Stand here in 3D instead | globe stays | pass |
| No image within 1 km | mock: none | "No street-level images within 1.0 km of this point (...)." with Stand here in 3D instead | globe stays | pass |

Every run: 0 uncaught exceptions.



## Phase 2a drills (P2A.7.7, `npm run e2e:drills2a`, 2026-10-09)
One live flight at Pushkar (real bridge and SITL), each drill once.

| Drill | What happened | Result |
|---|---|---|
| Wrong Cesium ion token (second page during the flight) | message: "Cesium ion rejected the token. Check it in Settings (cesium.com/ion, Access Toke…"; instruments still showing ARMED: true | pass |
| Lose the internet (browser offline) | message: "No connection to the map servers. Terrain, satellite imagery and place search ne…"; SITL: ALT_HOLD armed | pass |
| Close the tab mid-flight (drone in AltHold) | SITL 3 s later: RTL armed | pass |
| Kill the bridge mid-flight (drone in AltHold) | SITL before: ALT_HOLD armed; 4 s later: RTL armed (GCS failsafe, 2 s without the bridge's heartbeat) | pass |

## Phase 2b drills, controller active (P2B.3.4, `npm run e2e:drills2b`, 2026-10-09)
One live flight at Pushkar (real bridge and SITL) with a stubbed controller (Gamepad API stub, calibrated profile) in control, each drill once.

| Drill | What happened | Result |
|---|---|---|
| Unplug the controller mid-flight (drone in AltHold, controller active) | SITL 1.5-2.5 s later: LOITER armed | pass |
| Wrong Cesium ion token (second page during the flight) | message: "Cesium ion rejected the token. Check it in Settings (cesium.com/ion, Access Toke…"; instruments still showing ARMED: true | pass |
| Lose the internet (browser offline) | message: "No connection to the map servers. Terrain, satellite imagery and place search ne…"; SITL: ALT_HOLD armed | pass |
| Close the tab mid-flight (drone in AltHold) | SITL 3 s later: RTL armed | pass |
| Kill the bridge mid-flight (drone in AltHold) | SITL before: ALT_HOLD armed; 4 s later: RTL armed (GCS failsafe, 2 s without the bridge's heartbeat) | pass |
