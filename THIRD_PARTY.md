# Third-party software and data

Checked 2026-10-09: package licences from each installed package's own metadata (npm `package.json`, Python package
metadata); service terms from the official pages linked below. Licences can change: check the source before you
redistribute or use the app commercially. This file is not legal advice.

## Software in this repository's dependencies

| Package | Version | Licence | Used for |
|---|---|---|---|
| [CesiumJS](https://cesium.com/cesiumjs/) (`cesium`) | 1.146.0 | Apache-2.0 | the 3D globe |
| [egm96-universal](https://github.com/nicolas-van/egm96-universal) | 1.1.1 | MIT | converting heights between the ellipsoid and mean sea level |
| [MapillaryJS](https://mapillary.github.io/mapillary-js) (`mapillary-js`) | 4.1.2 | MIT | the Mapillary 360 viewer |
| [Pannellum](https://pannellum.org/) | 2.5.7 | MIT | the Panoramax 360 viewer |
| [Vite](https://vite.dev) (dev) | 8.3.3 | MIT | build and dev server |
| [Vitest](https://vitest.dev) (dev) | 5.0.3 | MIT | unit tests |
| [TypeScript](https://www.typescriptlang.org/) (dev) | 7.0.2 | Apache-2.0 | type checking |
| [playwright-core](https://playwright.dev) (dev) | 1.64.0 | Apache-2.0 | headless browser checks (drives an installed browser) |
| [pymavlink](https://github.com/ArduPilot/pymavlink) | 2.4.50 | LGPL-3.0 | MAVLink messages between the bridge and the autopilot |
| [websockets](https://github.com/python-websockets/websockets) | 17.2 | BSD-3-Clause | the bridge's WebSocket server |
| [pytest](https://pytest.org) (dev) | 9.1.1 | MIT | bridge tests |
| [lxml](https://lxml.de) (installed with pymavlink) | 6.1.3 | BSD-3-Clause | XML parsing inside pymavlink |

Transitive npm packages keep their own licences (see `web/package-lock.json` and each package in `node_modules`).

pymavlink is LGPL-3.0: the bridge uses it as an unmodified library installed from PyPI. If you ship a modified pymavlink,
the LGPL obligations apply to it.

## Downloaded at setup, not included

| Software | Licence | Notes |
|---|---|---|
| [ArduPilot](https://github.com/ArduPilot/ardupilot) ArduCopter SITL | GPL-3.0 ([COPYING.txt](https://github.com/ArduPilot/ardupilot/blob/master/COPYING.txt): "GNU General Public License, Version 3, 29 June 2007") | `sim/start-sitl.ps1` downloads ArduPilot's own prebuilt Windows SITL from firmware.ardupilot.org into a git-ignored folder. It runs as a separate program that talks MAVLink to the bridge. This repository does not contain or redistribute ArduPilot code or binaries; if you redistribute the binaries, the GPL applies to them. |

## Data and services (used live from their servers; nothing is stored in the repository)

| Source | Terms | What you must do |
|---|---|---|
| **Cesium ion**: Cesium World Terrain, Bing Maps aerial imagery ([pricing](https://cesium.com/platform/cesium-ion/pricing/)) | The free **Community** plan is for "Personal and non-commercial use" (limits include 15 GB streaming a month and 1,000 global imagery sessions a month). Commercial use needs a paid plan. | Use your own token. Keep Cesium's on-screen credits and the data attributions it supplies (the app shows them in the bottom bar). |
| **OpenStreetMap**: search (Nominatim), building counts (Overpass), street map tiles ([copyright](https://www.openstreetmap.org/copyright)) | Data under the **Open Database License (ODbL)**. Nominatim policy: at most 1 request a second, identify the app, cache results, no search-as-you-type ([policy](https://operations.osmfoundation.org/policies/nominatim/)); tile policy: clear attribution, honour cache headers ([policy](https://operations.osmfoundation.org/policies/tiles/)); Overpass: about 10,000 requests and 1 GB a day per user ([guide](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)). | Show "© OpenStreetMap contributors" while OSM data is on screen (the app does) and say the data is under the ODbL. Search runs on Enter only. |
| **Mapillary** 360 and flat photos, coverage search ([terms](https://www.mapillary.com/terms), effective 15 February 2024) | Images are CC BY-SA (uploads are licensed so). Developer terms, section 11: data from the API or vector tiles must be attributed "by visibly displaying the Mapillary logo and linking back to the Mapillary homepage". Mapillary's logos are trademarks (section 7). | Use your own client token (never the client secret). The app shows a text credit and link; **adding the logo is an open item** (see Needs you in docs). |
| **Panoramax** pictures ([API](https://api.panoramax.xyz)) | Each picture carries its own licence (for example CC-BY-SA-4.0) and producer in the API answer. No rate limit or attribution wording was found in the documentation. | Show each picture's producer and licence with it (the app does). |
| **KartaView** photos ([terms](https://kartaview.org/terms), last modified 17 June 2025) | Section 4: images under CC BY-SA 4.0; "We require that you use the credit "© Grab and KartaView Contributors"". Section 15 reserves rights in Grab Platform content "save where stated otherwise", including linking. | Show "© Grab and KartaView Contributors, CC BY-SA 4.0" (the app does). Read section 15 before relying on KartaView. |
| **EOX Sentinel-2 cloudless** imagery layer ([licence summary](https://cloudless.eox.at/documentation/license)) | Non-commercial use under CC BY-NC-SA 4.0; commercial use needs an EOX licence. Attribution: "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data "year")". | Keep the attribution visible while the layer is shown. Do not use this layer commercially without an EOX licence. |
| **Natural Earth** populated places (coverage scripts only; downloaded, git-ignored) ([terms](https://www.naturalearthdata.com/about/terms-of-use/)) | Public domain: "No permission is needed to use Natural Earth." | Nothing required; suggested citation "Made with Natural Earth." |

## Assets made by this project
- `web/public/models/drone.gltf`: generated by `scripts/make-drone-model.mjs` (own geometry), under this repository's licence.
- `docs/screenshot.png`: a screenshot of the app; the imagery in it is © its providers as credited in the picture's bottom bar.
