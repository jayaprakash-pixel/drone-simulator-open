# Data quality and performance notes

Measured on this laptop: AMD Ryzen 5 5600H, integrated AMD Radeon graphics (Edge, ANGLE Direct3D11), 7.3 GB RAM. Sections between the HTML comments are rewritten by the e2e script named in each heading; the hands-on sections are edited by hand.

<!-- accuracy:start -->
## Elevation accuracy (P1.6.2, e2e/accuracy.mjs)

Ground elevation read through the app's own pipeline (Cesium World Terrain, most detailed level, converted to metres above mean sea level with EGM96) against published elevations. Limit: 30 m. Last run 2026-10-08.

| Place | Lat, Lon | Published (m) | App (m MSL) | Error (m) | Without the geoid correction: error (m) |
|---|---|---|---|---|---|
| Guru Shikhar summit, Mount Abu | 24.6499484, 72.7763375 | 1722 | 1697.3 | -24.7 | -73.6 |
| Jaipur | 26.915, 75.82 | 431 | 441.0 | +10.0 | -39.8 |
| Jaisalmer | 26.916667, 70.916667 | 225 | 240.6 | +15.6 | -29.5 |
| Jaipur airport | 26.824167, 75.812222 | 385 | 382.5 | -2.5 | -52.6 |
| Jaisalmer airport | 26.880278, 70.855 | 251 | 234.5 | -16.5 | -61.6 |

Sources: Guru Shikhar summit, Mount Abu: Wikidata Q3533921 (height), OpenStreetMap node 3577976686 (position); Jaipur: Wikidata Q66485; Jaisalmer: Wikidata Q242898; Jaipur airport: Wikidata Q572387; Jaisalmer airport: Wikidata Q2900727. The last column is the height Cesium reports above the ellipsoid compared with the same published value: it shows why altitude types are never mixed (plan p.5): skipping the EGM96 correction would put most Rajasthan elevations 30 to 75 m off, beyond the 30 m target.

What the numbers mean (cross-check done once on 2026-10-08 with OpenTopoData, an open elevation service):
- Cesium World Terrain in Rajasthan is effectively the 30 m SRTM dataset: at the Jaipur point SRTM reads 441 m (app 441.0), at Jaipur airport 382 m (app 382.5), and next to the summit SRTM 1,681 m and ASTER 1,682 m (app 1,679 m there). ASTER, an independent 30 m dataset, agrees within about 5 m.
- At the summit node itself SRTM reads 1,697 m and ASTER 1,703 m, so the roughly 25 m shortfall against the surveyed 1,722 m is inherent to a 30 m grid, which averages a sharp top. OpenStreetMap lists the same peak at 1,690 m, so the published values themselves differ by 32 m.
- SRTM's own absolute vertical accuracy is quoted as about 16 m, which fits the 15 to 17 m errors at the Jaisalmer points.
- Wikidata's coordinate for Guru Shikhar is about 1.8 km from the summit and reads 1,376 m; always take hill positions from OpenStreetMap or a map, not from a city-centre style coordinate.
<!-- accuracy:end -->

<!-- performance:start -->
## Performance (P1.6.4 and P1.6.5, e2e/perf.mjs)

Last run 2026-10-08, default settings (resolution 100%, tile detail 3, 3D buildings on; every place viewed tilted from 1 km, as a fly-to now ends), 1280x720 window, real GPU: ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11).

| Measure | Target (plan p.21) | Result |
|---|---|---|
| Frame rate during a scripted tour of the 7 test places (2784 frames, 28 s) | 30 fps or better | median 143 fps; slowest 5% of frames 74 fps; 98% of frames at 30 fps or better |
| Time to a visible, loaded globe (5 cold loads) | within about 5 s | 3086, 1994, 2186, 2163, 1770 ms; median 2163 ms |
| Browser JS heap after the tour | watch it: about 1 GB of RAM is free | 190 MB |

The globe draws only when something changes, so idle time is excluded from the frame rate (an idle globe draws 0 frames a second). The headless window is not vsync-capped, so the number can exceed the display's refresh rate; what matters here is the margin over 30 fps while the camera flies and tiles stream in.
<!-- performance:end -->

<!-- roundtrip:start -->
## Click accuracy, automated half (P1.7.2, e2e/roundtrip.mjs)

The camera flies top-down to 500 m above each reference point. Around it, 9 ground points (a 3 by 3 grid, 250 m east/west and 120 m north/south, so from the screen centre out to near the screen edges) are projected to a screen pixel, rounded to a whole pixel (as a real click is) and picked back with the click handler's own code. One pixel is about 0.45 m on the ground at this height. Last run 2026-10-08.

| Reference point | Worst of 9 (m) | Mean (m) | Farthest pixel from centre |
|---|---|---|---|
| Guru Shikhar summit, Mount Abu | 0.26 | 0.13 | 573 px |
| Jaipur | 0.22 | 0.13 | 617 px |
| Jaisalmer | 0.22 | 0.13 | 641 px |
| Jaipur airport | 0.20 | 0.09 | 614 px |
| Jaisalmer airport | 0.26 | 0.13 | 619 px |

This proves the screen-to-ground maths; it cannot show that the satellite picture is aligned with the real world. That is the hands-on half (compare against a trusted map), described in the next section.
<!-- roundtrip:end -->

<!-- street:start -->
## Reaching street level, automated half (P1.7.1, e2e/street.mjs)

Cold page load, search "Jaisalmer", Enter, choose the result labelled city, zoom with the mouse wheel (3 notches) to below 200 m above the ground: the camera was below 200 m after **12.0 s** and the street-level tiles had finished loading after **17.7 s** (target: under 60 s). Last run 2026-10-08.
<!-- street:end -->

<!-- walkdata:start -->
### Facts measured for each place (e2e/walk.mjs, 2026-10-08)

Camera 700 m above the ground, looking straight down; pictures are saved in `docs/shots/` (not in git, regenerate with `npm run e2e:walk`).

| Place | Ground (m MSL) | Finest terrain level | About this far between terrain height points | Picture |
|---|---|---|---|---|
| Jaipur (large city) | 433 | 13 | 38 m | docs/shots/jaipur.png |
| Jaisalmer (desert town) | 238 | 13 | 38 m | docs/shots/jaisalmer.png |
| Mount Abu (hills) | 1189 | 13 | 38 m | docs/shots/mount-abu.png |
| Pushkar (small town, lake) | 503 | 13 | 38 m | docs/shots/pushkar.png |
| Thar Desert (empty stretch) | 149 | 13 | 38 m | docs/shots/thar-desert.png |
| Spiti Valley (Himalaya) | 3650 | 13 | 38 m | docs/shots/spiti-valley.png |
| Tokyo (dense city) | 40 | 13 | 38 m | docs/shots/tokyo.png |
<!-- walkdata:end -->

## Place walk-through (P1.6.3, hands-on, DRAFT written by Claude from the pictures; needs your confirmation)

The plan asks, for each test place: does it show 3D buildings, only flat imagery, or only low-detail terrain? Short answer for all seven: **flat satellite imagery with no 3D buildings** (the app has no building layer), and **terrain much coarser than the imagery** (one height point about every 38 m, finest level 13, the same at every place). Pictures are at 700 m up, looking straight down; at that height one screen pixel is about 0.6 m, and the roofs are sharp, so the imagery itself is roughly 0.5 m per pixel in the cities.

| Place | What the picture shows | Imagery | Terrain | 3D buildings | Your verdict |
|---|---|---|---|---|---|
| Jaipur (large city) | Dense blocks, a flyover and metro line, a formal garden; cars and single roofs are visible | very sharp | gentle, 433 m MSL | none | |
| Jaisalmer (desert town) | Narrow streets, blue rooftop water tanks, a roundabout, a sports ground; every roof visible | very sharp | 238 m MSL | none | |
| Mount Abu (hills) | Forest canopy with scattered buildings; trees hide roads and ground | sharp, but tree cover hides the ground | 1,189 m MSL; hills show relief only when viewed at an angle, and a 38 m grid smooths small hills | none | |
| Pushkar (small town, lake) | Dense old town, the ghats and the lake edge | very sharp | 503 m MSL (published about 510) | none | |
| Thar Desert (empty stretch) | Dunes, scattered shrubs, one sandy track, no buildings | sharp enough to see single shrubs | 149 m MSL; dunes are smaller than the 38 m grid, so the ground model is smoother than reality | none | |
| Spiti Valley (Himalaya, Kaza) | A village in a dry riverbed with switchback roads; steep bare slopes | sharp, slightly softer than the cities | 3,650 m MSL; big slopes are captured, cliffs and narrow gorges are not | none | |
| Tokyo (dense city) | Very dense low-rise blocks, sports fields, a rail line; every roof visible | very sharp, the best of the seven | 40 m MSL | none | |

What this means for later phases:
- Flying low over a town, the drone would pass through buildings and trees without any collision, because neither is in the terrain. This is the plan's own "obstacles smaller than the terrain data's detail" limit; the ground-contact check only knows the bare ground.
- In hills and valleys the 38 m grid is enough for slopes but not for cliff walls or narrow gorges: keep a safety margin there in the Phase 3 terrain clearance check.

Note added 2026-10-08: this draft was written before P1.8. You have since decided that scenery beyond terrain is wanted now (decisions.md). The app now has tilted views, Stand here, 3D buildings and a 360 view (see the sections below), so "the app has no building layer" no longer holds. The verdict column above is still yours to fill in.

Draft recommendation for the end-of-Phase-1 decision "scenery beyond terrain and satellite" (yours to make; record the choice in decisions.md and tick P1.6.3):
- **Keep flat satellite imagery for Phase 2.** The picture is already sharp, and 3D buildings would add load to a 7 GB laptop for no benefit to the first keyboard flights.
- Revisit after the first rehearsal over a town. The cheapest next step would be Cesium OSM Buildings (available through the same ion token; counts against ion usage). Google Photorealistic 3D Tiles are paid beyond a free allowance (plan p.18) and also heavy, so they stay in the parking lot.

## Hands-on checks to do yourself (P1.7.1 and P1.7.2)

Open the app at http://127.0.0.1:3003. The automated halves are in the sections above; these halves need a stopwatch and your eyes.

**P1.7.1, street level in under 60 s.** Reload the page, start a stopwatch, type `Jaisalmer`, press Enter, click the result labelled **city** (the first one is the whole district), then zoom with the mouse wheel until the bottom-right readout shows under 200 m. Stop. Automated run for comparison: see "Reaching street level" above.

| Date | Seconds | Notes |
|---|---|---|
| | | |

**P1.7.2, clicked coordinates against a trusted map (within 5 m).** For each landmark: zoom in, click one precise feature, read the coordinates in the panel on the right, then find the same feature in Google Maps, right-click it and read its coordinates. Compare. (Landmarks suggested: Hawa Mahal in Jaipur, the Jaisalmer Fort main gate, the Guru Shikhar temple on Mount Abu.)

| Landmark | App says | Google Maps says | Difference (m) |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

## Diagnosis: old-looking imagery and a camera stuck looking down (P1.8.1, 2026-10-08)

Your screenshot: 19.906844, 83.169790 (Bhawanipatna, Odisha), camera readout "320 m AGL, heading 360°". Read-only checks first, no code changed.

**Which imagery, who credits it, how old.**
- The layer shown is "Satellite". It is Cesium ion asset 2, and the live ion endpoint answers `type IMAGERY, externalType BING, mapStyle Aerial`, so it is **Bing Maps Aerial through Cesium ion**.
- At 320 m above the screenshot spot and above each of the seven test places, Cesium credits the same providers: "© 2026 Microsoft Corporation · © Maxar · ©CNES (2026) Distribution Airbus DS · © Mapbox · Bing Imagery", plus the terrain sources. So the pictures are Maxar and Airbus (Pléiades) satellite images, delivered by Bing. The "(2026)" is a copyright year, not a capture date.
- **Capture date: cannot be established for Bing, and is not guessed here.** Cesium ion publishes no capture dates. Bing's own lookup (vintageStart and vintageEnd in its imagery metadata API) needs a Bing Maps key. Free Bing keys stopped working on 30 June 2025, and new enterprise customers have not been accepted since 30 June 2024.
- What can be dated is in "Imagery sources and capture dates" below. EOX's Sentinel-2 mosaic is from 2025 but only 10 m per pixel. Esri's metadata, a source not used in the app, dates its own sharp imagery at your spot to 31 Jan 2025.

**Why the camera stayed straight down** (measured in the running app before any change):
- Every fly-to ended at **pitch -90° (straight down), heading 0°**. This held for the screenshot spot and all seven test places. The code gave `camera.flyTo` only a destination, so Cesium's default orientation pointed at the Earth's centre. Search results, saved places and the Fly to Rajasthan button all used that one function.
- The camera controller was Cesium's default, which the app never changed: enableRotate, enableTilt, enableLook, enableZoom and enableCollisionDetection were all true; minimumZoomDistance was 1 m; minimumCollisionTerrainHeight 15,000 m; maximumTiltAngle none.
- The gestures were: tilt with middle-drag, pinch, Ctrl+left-drag or Ctrl+right-drag; look with Shift+left-drag; pan with left-drag; zoom with right-drag, wheel or pinch.
- **So tilting was possible but undiscoverable.** No on-screen control or hint existed: the Cesium help button was hidden in Phase 1. The wheel zooms towards the cursor, and from a straight-down view that is straight down, like a 2D map.
- "Heading 360°" was a rounding quirk in the readout (a heading between 359.5° and 360° printed as 360). It now reads 0 (P1.8.2).

**Scenery.** As the P1.6.3 draft says: flat imagery on a terrain grid of about 38 m, no 3D buildings anywhere.

What was changed is in P1.8.2 to P1.8.8 (tilted fly-tos and camera controls, Stand here, OSM buildings, the 360 view, imagery sources). The sections below hold the measurements.

## Hands-on checks for P1.8 (yours)

**P1.8.6, Mapillary token and the live 360 run.**
1. Sign in or sign up at https://www.mapillary.com/dashboard/developers.
2. Click "Register Application" and fill in a name and description; the app is the Drone World Simulator, a personal tool.
3. Copy the **client token** (it starts with `MLY|`).
4. Put it in `web/.env.local` as a line `VITE_MAPILLARY_TOKEN=MLY|...`, or paste it into Settings in the app (Mapillary client token, then Save and reload).
5. Tell me it is there. I then run `npm run build` and `npm run e2e:pano-live`, which fills the coverage table below, opens a real panorama and checks that the token is nowhere in git. Never paste the token into a document or a chat message.

Done on 2026-10-08: the Mapillary client token (never the client secret) was put in `web/.env.local`, and the live run passed (table below).

**P1.8.9, look at the new views.** The pictures are in `docs/shots/` (not in git):
- **Tilted view after a fly-to:** `oblique-bhawanipatna.png`, `oblique-jaipur.png`, `oblique-jaisalmer.png`, `oblique-pushkar.png`, `oblique-mount-abu.png`.
- **Stand here:** `stand-bhawanipatna-north.png`, `stand-bhawanipatna-south.png`, `stand-pushkar-north.png`, `stand-pushkar-south.png`. At your spot, looking north, a building 10 m away fills the view.
- **360 view:** `pano-open-live-pushkar.png` (a real flat photo), `pano-open-live-tokyo.png` and `pano-open-live-360.png` (a real 360 panorama in Tokyo). `pano-open-mock.png` shows the test-data layout.
- **Imagery comparison:** `imagery-bing-ion.png` and `imagery-sentinel2-eox.png`, the same view in each source.

Or try them live at http://127.0.0.1:3003. Then write your verdict here:

| View | OK? | Problems you see |
|---|---|---|
| Tilted fly-to views | | |
| Stand here | | |
| 360 view | | |
| Imagery comparison | | |

## Imagery sharpness at drone heights (P1.9.1, measured 2026-10-08)

Measured with a throwaway script (drone-eye.mjs, kept outside git). The camera stood 120, 40 and 10 m above the most detailed terrain at each place, looking 45 degrees down, in a 1280x720 window. The Bing tile level comes from the quadkey length in each tile URL. A level counts only when HTTP 200 responses over 1.5 kB arrived; deeper levels were asked for and refused. The ground size of one imagery pixel is 156543 x cos(lat) / 2^level metres. One screen pixel at the screen centre covers about 21 cm at 120 m, 7 cm at 40 m and 2 cm at 10 m.

| Place | Finest level served | cm per imagery pixel | Levels refused | At 120 m | At 40 m | At 10 m |
|---|---|---|---|---|---|---|
| Your spot (Bhawanipatna) | 19 | 28 | 20-21 | about 1.3 screen pixels per imagery pixel: close to sharp | about 4x enlarged: soft | about 14x enlarged: blurred |
| Jaipur | 19 | 27 | 20-21 | close to sharp | soft | blurred |
| Jaisalmer | 19 | 27 | 20-21 | close to sharp | soft (cars recognisable as blobs) | blurred |
| Mount Abu | 19 | 27 | 20-21 | close to sharp | soft, tree cover smeared | blurred |
| Pushkar | 19 | 27 | 20-21 | close to sharp | soft, mostly hidden by 3 m building boxes | blurred |
| Thar Desert | 19 | 27 | 20-21 | close to sharp | soft (sand texture only) | blurred |
| Spiti Valley | 19 | 25 | 20-21 | close to sharp | soft; looking level, slopes and roads read well | blurred |
| Tokyo | 20 | 12 | 21 | sharp | about 2x enlarged: fairly sharp | about 6x enlarged: soft |

The finest level per place is the most reliable figure. The per-height counts were noisy, because tiles already in the browser cache are not fetched again. Pictures at 40 m, level and 45 degrees down: `docs/shots/drone-eye-<place>-level.png` and `-down.png`.

Verdict:
- Every Indian test place is usable for rehearsing a route's layout from about 100 to 120 m.
- No Indian place is usable for close-in detail below about 60 m, where the imagery is enlarged and soft. The drone-eye view says so below 60 m.
- Tokyo stays reasonable down to about 30 to 40 m.

## Building height tags (P1.9.2, Overpass, OSM data of 2026-10-08)

Buildings with a building tag inside a ±500 m box around each point, and how many carry a height or levels tag. Without either, Cesium OSM Buildings assumes "3 meters per level and that all buildings have at least 1 level", so a 3 m box.

| Place | Buildings | With height | With building:levels | With either |
|---|---|---|---|---|
| Your spot (Bhawanipatna) | 9 | 0 | 0 | 0 |
| Jaipur | 75 | 0 | 0 | 0 |
| Jaisalmer | 60 | 0 | 0 | 0 |
| Mount Abu | 86 | 2 | 2 | 2 |
| Pushkar | 1,540 | 0 | 0 | 0 |
| Thar Desert | 0 | 0 | 0 | 0 |
| Spiti Valley | 576 | 0 | 0 | 0 |
| Tokyo (comparison) | 4,261 | 33 | 90 | 100 |

The same boxes hold 0 OSM power lines and 0 towers or poles at every Indian place, and 3 mapped trees each at Jaisalmer and Pushkar. That is why buildings are a visual aid only and Phase 3 clearance counts terrain only (decisions.md).

<!-- coverage:start -->
## Street-level 360 coverage (P1.8.6, e2e/pano-live.mjs)

Last run 2026-10-08, Mapillary Graph API, true 360 panoramas only (is_pano), counted within 100 m and 500 m of each point (the app asks for at most 500 per search, shown as 500+).

| Place | 360 within 100 m | 360 within 500 m | 360 within 1 km | Nearest 360 | Newest 360 within 1 km | Images of any kind within 500 m |
|---|---|---|---|---|---|---|
| Screenshot spot (Bhawanipatna) | 0 | 0 | 0 | none within 1 km | -- | 0 |
| Jaipur | 0 | 0 | 0 | none within 1 km | -- | 31 |
| Jaisalmer | 0 | 0 | 0 | none within 1 km | -- | 209 |
| Mount Abu | 0 | 0 | 0 | none within 1 km | -- | 120 |
| Pushkar | 0 | 0 | 0 | none within 1 km | -- | 275 |
| Thar Desert | 0 | 0 | 0 | none within 1 km | -- | 0 |
| Spiti Valley | 0 | 0 | 0 | none within 1 km | -- | 83 |
| Tokyo | 0 | 425 | 425 (500 m) | 117 m | 2022-12-31 | 411 |

Opened live in the app (click the place centre, Enter place (360), Go to nearest if offered):
- Pushkar: Mapillary · flat photo, not 360° · captured 26 Dec 2015 · 138 m from the clicked point
- Tokyo: Mapillary · flat photo, not 360° · captured 4 Apr 2021 · 13 m from the clicked point
- Tokyo, at a 360 panorama: Mapillary · 360° panorama · captured 2 Jan 2022 · 0 m from the clicked point
<!-- coverage:end -->

Checked 2026-10-08 (P1.9.3): Spiti's "83 images of any kind within 500 m" also appears for KartaView in the parked-provider table (docs/parking-lot.md). This is not a copy error:
- Both services, queried again separately, return 91 images in the box and 83 within 500 m, with different ids. Mapillary's are from June 2016; KartaView's shot dates are January and April 2017.
- Their positions match closely: the median distance to the nearest photo on the other service is 1.9 m, and 43 of 83 are within 2 m.
- So it is most likely the same photo set uploaded to both services. That is an inference.

<!-- google3d:start -->
## Google Photorealistic 3D Tiles: evaluation only (P1.8.8, e2e/google3d.mjs)

Last run 2026-10-08. Available to this Cesium ion token (asset 2275207). Measured on a throwaway Google-only page outside the app (no globe, no other imagery, no place search, Google credits on screen), because Google's terms forbid showing the tiles with or near a non-Google map; no pictures were kept.

Real 3D buildings show up as steps in the surface, so the most detailed Google surface is sampled on a 15 x 15 grid, 8 m apart (a 112 m square at each place), and the share of points where the slope changes by more than 3 m (second difference) is counted: walls and roofs make such steps, flat ground and steady hillsides do not. Tokyo (a residential district, inside Google's photogrammetry) is the reference. A first try that compared the finest tile size gave 2.0 m everywhere, Tokyo included, so tile size cannot tell the two apart.

| Place | Surface steps over 3 m (share of 390 samples) | Height range in the square | Credits shown |
|---|---|---|---|
| Screenshot spot (Bhawanipatna) | 0.0% | 4.8 m | Cesium ion, Upgrade for commercial use., •, Google, Data SIO, NOAA, U.S. Navy, NGA, GEBCO, IBCAO |
| Jaipur | 0.0% | 5.3 m | Cesium ion, Upgrade for commercial use., •, Google, Airbus, Data SIO, NOAA, U.S. Navy, NGA, GEBCO, IBCAO, Landsat / Copernicus |
| Jaisalmer | 0.0% | 2.0 m | Cesium ion, Upgrade for commercial use., •, Google, Airbus, Data SIO, NOAA, U.S. Navy, NGA, GEBCO, IBCAO |
| Mount Abu | 0.0% | 14.2 m | Cesium ion, Upgrade for commercial use., •, Google, Airbus, Data SIO, NOAA, U.S. Navy, NGA, GEBCO, IBCAO, Landsat / Copernicus |
| Pushkar | 0.0% | 8.8 m | Cesium ion, Upgrade for commercial use., •, Google, Airbus, Data SIO, NOAA, U.S. Navy, NGA, GEBCO, IBCAO, Landsat / Copernicus |
| Thar Desert | 0.0% | 8.8 m | Cesium ion, Upgrade for commercial use., •, Google, Data SIO, NOAA, U.S. Navy, NGA, GEBCO, IBCAO, Airbus |
| Spiti Valley | 0.0% | 20.6 m | Cesium ion, Upgrade for commercial use., •, Google, Data SIO, NOAA, U.S. Navy, NGA, GEBCO, IBCAO |
| Tokyo | 51.3% | 18.1 m | Cesium ion, Upgrade for commercial use., •, Google, Data SIO, NOAA, U.S. Navy, NGA, GEBCO, IBCAO, Landsat / Copernicus |

JS heap after the tour: 452 MB (tile cache capped at 256 MB). Reference: Tokyo 51.3% of samples on a step.
<!-- google3d:end -->

<!-- imagery-dates:start -->
## Imagery sources and capture dates (P1.8.7, e2e/imagery.mjs)

Last run 2026-10-09. The layer switch shows one source at a time, with its capture date next to it, or the words "capture date not published by this source".

- **Satellite (default): Bing Maps Aerial through Cesium ion.** Cesium ion does not pass on capture dates, and Bing's own date lookup (vintageStart and vintageEnd in its imagery metadata API) needs a Bing Maps key: free Bing keys stopped working on 30 June 2025 and no new enterprise customers are accepted, so this app cannot establish Bing's dates. What can be seen: at the screenshot spot the credits name © 2026 Microsoft Corporation, © Maxar, ©CNES (2026) Distribution Airbus DS, © Mapbox, the same at all seven test places (the "(2026)" after CNES is a copyright year, not a capture date). Cesium says Bing through ion is guaranteed only "at least through September 2026" and that alternative imagery is coming.
- **Sentinel-2 cloudless 2025 (EOX).** A mosaic of summer-like 2025 Sentinel-2 images (EOX does not publish the months per region), 10 m per pixel: recent, but far too coarse to show buildings or streets.
- **Streets (OpenStreetMap).** A drawn map, not imagery.

For comparison only, Esri World Imagery's public metadata at the same points (Esri is not in the app: its terms allow it only with an ArcGIS account key; a free tier exists):

| Place | Esri capture date | Resolution | Satellite | Product |
|---|---|---|---|---|
| Screenshot spot (Bhawanipatna) | 2025-01-31 | 0.31 m | WV03 | Vivid (Vantor) |
| Jaipur | 2026-05-04 | 0.34 m | LG03 | Vivid Mosaic Metro (Vantor) |
| Jaisalmer | 2025-11-22 | 0.31 m | WV03 | Vivid (Vantor) |
| Mount Abu | 2025-05-20 | 0.31 m | WV03 | Vivid (Vantor) |
| Pushkar | 2025-04-20 | 0.34 m | LG04 | Vivid (Vantor) |
| Thar Desert | 2023-09-08 | 0.50 m | WV02 | Vivid (Vantor) |
| Spiti Valley | 2021-09-20 | 0.31 m | WV03 | Vivid (Vantor) |
| Tokyo | 2026-01-08 | 0.50 m | WV02 | Vivid Advanced (Vantor) |

So the free sources are not all equally old: Esri publishes recent, dated, sharp imagery for most of these points, while Bing's date through ion cannot be established and EOX is recent but coarse.
<!-- imagery-dates:end -->

<!-- buildings:start -->
## 3D buildings at the test places (P1.8.4, e2e/buildings.mjs)

Last run 2026-10-08, Cesium OSM Buildings (ion asset 96188, OpenStreetMap data of 2026-06-08), 1280x720 window. Two counts of the buildings within 500 m of each place centre, each building counted once by its OpenStreetMap id: as drawn where a fly-to ends (1 km away, tilted 40 degrees, default detail: Cesium draws the larger buildings first and adds small ones as you zoom in), and everything in the data (straight down from 1.6 km with every building tile loaded). Buildings without a height or levels tag get a height Cesium estimates.

| Place | Drawn after a fly-to | In the OpenStreetMap data | With a height or levels tag | Tallest |
|---|---|---|---|---|
| Screenshot spot (Bhawanipatna) | 9 | 9 | 0 | 3 m |
| Jaipur | 42 | 42 | 0 | 3 m |
| Jaisalmer | 28 | 28 | 0 | 3 m |
| Mount Abu | 71 | 71 | 0 | 3 m |
| Pushkar | 1427 | 1441 | 0 | 3 m |
| Thar Desert | 0 | 0 | 0 | 0 m |
| Spiti Valley | 493 | 493 | 0 | 3 m |
| Tokyo | 106 | 3156 | 56 | 18 m |

JS heap after the eight places: 378 MB (buildings tile cache capped at 128 MB plus 64 MB overflow).
<!-- buildings:end -->

<!-- drone-fps:start -->
## Frame rate while the drone flies (P2A.7.5, `npm run e2e:flyfps`, 2026-10-09)
60 s of the recorded SITL flight at Pushkar while it moves (level, about 9 m/s, chase camera) at default quality: terrain, Bing imagery and 3D buildings on, 1280 x 800, ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11) (GPU).
- Frames per second: median **144**, lowest 143, highest 145. JS heap afterwards 87 MB.
- Per second: 144 144 143 145 144 144 144 144 144 144 144 143 144 144 144 143 145 144 144 144 144 143 144 144 144 144 144 143 145 144 143 144 145 143 145 144 144 144 144 143 145 143 145 143 145 144 144 144 144 144 144 143 144 145 144 144 144 143 145 144
<!-- drone-fps:end -->
