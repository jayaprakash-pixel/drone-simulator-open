# Parking lot

Ideas that are not in v1. Rule (plan p.17): add them here instead of building them. An idea becomes work only after the Phase 1-3 gates pass, as a new item with a real acceptance test (see docs/ROADMAP.md).

## From the plan (Phase 4)

### Real terrain physics
- Adds: the drone collides with real hills and can fly into valleys below home.
- Needs: an external physics source that feeds terrain height to the autopilot simulator.

### Real drone link
- Adds: connect a real flight controller over USB or telemetry radio to read its parameters and compare with the simulator.
- Needs: the same MAVLink bridge, plus safety rules - never send sticks to a real drone from the browser.

### Airspace and no-fly layers
- Adds: restricted zones drawn on the globe.
- Needs: a licensed or official airspace data source; Indian zones are published through the Digital Sky platform (check current availability).

### Weather data
- Adds: wind and temperature from a real forecast for a chosen date.
- Needs: a weather API such as Open-Meteo.

### VR headset mode
- Adds: first-person flying with a headset.
- Needs: WebXR support in the browser and a camera view built for stereo.

### Multiple drones
- Adds: two drones in the same area.
- Needs: several simulator instances and a larger state message.

## Left over from P1.8 (street level and 3D scenery)

### 360 coverage near the camera
- Adds: dots on the globe where Mapillary has 360 panoramas near the camera, so you know where "Enter place (360)" will work.
- Needs: one 500 m bbox search each time the camera stops below about 2 km (the token now exists).
- Measured 2026-10-08: no 360 panoramas within 1 km at any Indian test place, so for now the dots would show emptiness there. Revisit if you fly where Mapillary has 360 coverage, or show ordinary photos as dots too.

### Esri World Imagery with its capture dates
- Adds: a third satellite layer, with Esri's per-place capture date on screen (31 Jan 2025 at the screenshot spot, 2026 in Jaipur and Tokyo; see docs/data-quality.md).
- Needs: your free ArcGIS Location Platform account and API key; Esri's terms do not allow keyless use outside Esri software (docs/data-sources.md).

### KartaView and Panoramax as 360 providers (parked 2026-10-08, your decision)
- Adds: two more open street-level photo sources behind the same PanoramaProvider interface.
- Licences:
  - KartaView: CC BY-SA 4.0, credit "© Grab and KartaView Contributors". Its API is https://api.openstreetcam.org/2.0/photo/, no token, 100 requests an hour.
  - Panoramax: CC BY-SA 4.0 or Etalab 2.0 per instance. It has a STAC API at https://api.panoramax.xyz/api/search, no token, no published rate limit.
- Why parked: neither has a true 360 image within 1 km of your spot or any Indian test place. Measured 2026-10-08 (two ≤500 m boxes per point merged, distance by haversine). Columns are 360 within 500 m / 360 within 1 km / any image within 500 m / newest image within 1 km:

| Place | KartaView | Panoramax |
|---|---|---|
| Bhawanipatna (your spot) | 0 / 0 / 0 / none | 0 / 0 / 0 / none |
| Jaipur | 0 / 0 / 0 / 2019-06-06 | 0 / 0 / 0 / 2024-03-12 |
| Jaisalmer | 0 / 0 / 0 / none | 0 / 0 / 0 / none |
| Mount Abu | 0 / 0 / 0 / 2017-01-26 | 0 / 0 / 0 / none |
| Pushkar | 0 / 0 / 0 / none | 0 / 0 / 0 / none |
| Thar | 0 / 0 / 0 / none | 0 / 0 / 0 / none |
| Spiti | 0 / 0 / 83 / 2017-04-06 | 0 / 0 / 0 / none |
| Tokyo | 0 / 0 / 2 / 2026-03-28 | 0 / 15 / 0 / 2026-06-08 |

- Spiti shows 83 images within 500 m on both KartaView and Mapillary. It was checked again (P1.9.3): both services, queried separately, return 91 in the box and 83 within 500 m, with different ids. The photo positions match closely (median 1.9 m to the nearest photo on the other service), so it is most likely the same 2016 photo set uploaded to both. That is an inference, not a copy error.

### Copernicus DEM GLO-30 instead of Cesium World Terrain (parked 2026-10-08, your decision)
- Adds: a newer (TanDEM-X, 2011 to 2015) 30 m surface model, free licence, credit "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA".
- Why parked: it is the same 30 m class as today's terrain and also a surface model (it includes buildings and trees), so it would not change clearance honesty. If needed later: upload a GeoTIFF to ion as Terrain (10 GB free storage), or build quantized-mesh tiles with GDAL and cesium-terrain-builder (tum-gis Docker fork, Apache-2.0).

### Google-only photorealistic page
- Adds: Google Photorealistic 3D Tiles where Google has real 3D (Tokyo yes; none of the Indian test places today).
- Needs: a separate page with no Bing, OpenStreetMap or Cesium terrain and no Nominatim search, because Google and Cesium forbid mixing them (decisions.md, 2026-10-08). Uses 1 of ion's 1,000 free root tiles a month per page load.

## Promoted to work

### Better scenery (promoted to P1.8 on 2026-10-08)
- Was: 3D buildings and photorealistic tiles where licensed, decision point P1.6.3.
- Now: you pulled it forward. P1.8 built tilted views, Stand here, Cesium OSM Buildings and the 360 view; Google's tiles were evaluated and left out (decisions.md).

## From related open-source repositories

### 3D mapping from drone photos - OpenDroneMap, openMVG
- Adds: real terrain and 3D scenery generated from your own drone images; could feed "real terrain physics" and "better scenery".
- Why parked: the plan lists automated 3D mapping or survey tools as out of scope for now. ODM is AGPL-3.0, openMVG is MPL-2.0.

### Live global data layers - World Monitor, God's Eye View
- Adds: live aircraft, ships, weather and other feeds on the globe; a reference for scenery and a photorealistic cockpit view.
- Why parked: the plan lists live traffic and live weather imagery as out of scope for now. World Monitor is AGPL-3.0; God's Eye View declares no licence on GitHub, so do not copy its code.

## Before any public release (plan p.17-20)

- Re-check every provider's current terms: Cesium ion plan limits, Nominatim, imagery, the OpenStreetMap licence, any 3D tiles.
- Decide the ArduPilot GPL v3 question before distributing anything that bundles its code or binaries; take advice if the product is commercial.
- Keep attribution always visible on screen; no bulk tile downloads unless the terms allow it.
- Keep the plain rehearsal-only notice on the first screen and on every exported file (built in P1.5.5 and P3.4.2).
- Re-check India's Drone Rules and the Digital Sky zones before showing any airspace information.

## Reviewed 2026-10-08 (simulator and physics engines)

### Terrain-aware physics (only if the P2A.1 spike shows SIM_TERRAIN does not make SITL follow real terrain)
- Candidate: MuJoCo (Apache-2.0) with a height-field built from the app's terrain, feeding ArduPilot over the SITL JSON physics interface (it needs position, velocity, attitude, gyro and accelerometer).
- Before any work: check the MuJoCo Python install on this Windows 11 machine, and how large a terrain window we need around the drone.

### Bullet
- Parked: reviewed on 2026-10-08, no use found yet (see docs/decisions.md).
