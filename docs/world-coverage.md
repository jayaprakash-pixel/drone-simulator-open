# World coverage

P1.10.2. What the app has at each of the 36 world test places: one row per place, counts as measured, no averages.
The same four lookups run live in the app's "What is here?" panel (P1.10.3) when you click the ground.

<!-- table:start -->
Measured by `node scripts/world-coverage.mjs` (cached in `data/world-coverage.json`; dates per value in the cache). Last table written 2026-10-08. Places: `data/world-places.json`.

| Place | Type | Finest Bing imagery level (cm per pixel) | OSM buildings in +-500 m / with height or levels tag | Mapillary within 500 m: true 360 / any | Terrain level (height-point spacing) | Centre check (second source) |
|---|---|---|---|---|---|---|
| New York | Dense city | 19 (23 cm) | 652 / 572 | 1049 / 1377 | 18 (about 1 m) | Wikidata Q60 centre 0.01 km away |
| London | Dense city | 19 (19 cm) | 776 / 415 | 867 / 1395 | 17 (about 2 m) | Wikidata Q23311 centre 0.07 km away |
| Mumbai | Dense city | 18 (56 cm) | 147 / 2 | 0 / 254 | 13 (about 38 m) | Wikidata Q1156 centre 2.48 km away - CHECK: over 2 km; the point lies in: L Ward, Mumbai Zone 5, Mumbai, Mumbai Suburban District, Maharashtra, India |
| Lagos | Dense city | 18 (59 cm) | 1694 / 746 | 0 / 247 | 13 (about 38 m) | Wikidata Q8673 centre 0.13 km away |
| Sao Paulo | Dense city | 19 (27 cm) | 1667 / 1639 | 141 / 1782 | 13 (about 38 m) | Wikidata Q174 centre 0.06 km away |
| Jakarta | Dense city | 18 (59 cm) | 76 / 6 | 242 / 669 | 13 (about 38 m) | Wikidata Q3630 centre 0.03 km away |
| Cairo | Dense city | 18 (52 cm) | 376 / 41 | 0 / 447 | 13 (about 38 m) | Wikidata Q85 centre 0.01 km away |
| Bhawanipatna (your spot) | Small town | 18 (56 cm) | 9 / 0 | 0 / 0 | 13 (about 38 m) | fixed point (the owner's screenshot spot); reverse geocode: Sadar, Kalahandi, Odisha, India |
| Pushkar | Small town | 18 (53 cm) | 841 / 0 | 0 / 259 | 13 (about 38 m) | Wikidata Q749170 centre 0.47 km away |
| Sarlat-la-Caneda | Small town | 19 (21 cm) | 1882 / 217 | 243 / 444 | 13 (about 38 m) | Wikidata Q6381 centre 0.23 km away |
| Decorah (Iowa) | Small town | 19 (22 cm) | 75 / 1 | 0 / 184 | 16 (about 5 m) | Wikidata Q1781710 centre 0.45 km away |
| Narok (Kenya) | Small town | 18 (60 cm) | 1480 / 8 | 0 / 153 | 13 (about 38 m) | Wikidata Q998813 centre 0.80 km away |
| Ninh Binh | Small town | 18 (56 cm) | 7 / 0 | 417 / 395 | 13 (about 38 m) | Wikidata Q16877130 centre 0.03 km away |
| Near Ludhiana (farmland) | Farmland and delta | 18 (51 cm) | 0 / 0 | 0 / 0 | 13 (about 38 m) | fixed point (open farmland north-west of Ludhiana city, Punjab); reverse geocode: Ludhiana, Ludhiana (West) Tahsil, Ludhiana, Punjab, 141001, India |
| Central Iowa (farmland) | Farmland and delta | 19 (22 cm) | 0 / 0 | 43 / 43 | 16 (about 5 m) | fixed point (row-crop farmland in Story County, Iowa, away from towns); reverse geocode: Warren Township, Story County, Iowa, United States |
| Can Tho | Farmland and delta | 18 (59 cm) | 273 / 8 | 0 / 414 | 13 (about 38 m) | Wikidata Q216075 centre 34.04 km away - CHECK: over 2 km; the point lies in: Phường Ninh Kiều, Cần Thơ, 94000, Vietnam |
| Thar Desert (empty stretch) | Desert | 18 (53 cm) | 0 / 0 | 0 / 0 | 13 (about 38 m) | fixed point (the Phase 1 empty desert point); reverse geocode: Jaisalmer Tehsil, Jaisalmer, Rajasthan, India |
| Merzouga (Sahara) | Desert | 18 (51 cm) | 186 / 0 | 0 / 72 | 13 (about 38 m) | Wikidata Q1922278 centre 0.25 km away |
| San Pedro de Atacama | Desert | 18 (55 cm) | 549 / 10 | 453 / 476 | 13 (about 38 m) | Wikidata Q23660231 centre 0.65 km away |
| Spiti Valley (Kaza) | Mountains | 18 (51 cm) | 563 / 0 | 0 / 58 | 13 (about 38 m) | Wikidata Q1013544 centre 0.15 km away |
| Zermatt | Mountains | 19 (21 cm) | 958 / 28 | 440 / 500+ | 13 (about 38 m) | Wikidata Q27494 centre 0.32 km away |
| Cusco | Mountains | 18 (58 cm) | 1250 / 28 | 994 / 500+ | 13 (about 38 m) | Wikidata Q5582862 centre 0.02 km away |
| Namche Bazaar | Mountains | 18 (53 cm) | 338 / 8 | 0 / 0 | 13 (about 38 m) | Wikidata Q376123 centre 0.04 km away |
| Male (Maldives) | Coast and islands | 18 (60 cm) | 243 / 25 | 0 / 360 | 13 (about 38 m) | Wikidata Q9347 centre 0.43 km away |
| Honolulu | Coast and islands | 19 (28 cm) | 225 / 120 | 228 / 433 | 14 (about 19 m) | Wikidata Q18094 centre 0.16 km away |
| Fira (Santorini) | Coast and islands | 18 (48 cm) | 292 / 12 | 475 / 500+ | 13 (about 38 m) | Wikidata Q617169 centre 0.57 km away |
| Manaus | Forest | 18 (60 cm) | 42 / 1 | 0 / 426 | 13 (about 38 m) | Wikidata Q40236 centre 4.57 km away - CHECK: over 2 km; the point lies in: Distrito Industrial I, Manaus, Amazonas, North Region, 69000-000, Brazil |
| Kuching | Forest | 18 (60 cm) | 236 / 12 | 38 / 485 | 13 (about 38 m) | Wikidata Q220445 centre 0.30 km away |
| Tromso | High latitude | 18 (21 cm) | 1365 / 601 | 0 / 478+ | 13 (about 38 m) | Wikidata Q26087 centre 0.23 km away |
| Reykjavik | High latitude | 18 (26 cm) | 1438 / 247 | 170 / 491+ | 13 (about 38 m) | Wikidata Q1764 centre 0.39 km away |
| Sydney | Oceania and other | 19 (25 cm) | 568 / 439 | 1318 / 2116+ | 15 (about 10 m) | Wikidata Q3130 centre 0.28 km away |
| Auckland | Oceania and other | 19 (24 cm) | 658 / 275 | 411 / 392+ | 15 (about 10 m) | Wikidata Q37100 centre 0.38 km away |
| Tokyo | Oceania and other | 19 (24 cm) | 600 / 92 | 1150 / 1939+ | 13 (about 38 m) | Wikidata Q1490 centre 6.67 km away - CHECK: over 2 km; the point lies in: Marunouchi 3, Marunouchi, Chiyoda, Tokyo, 100-0005, Japan |
| Nairobi | Oceania and other | 18 (60 cm) | 385 / 56 | 282 / 437 | 13 (about 38 m) | Wikidata Q3870 centre 0.29 km away |
| Lima | Oceania and other | 18 (58 cm) | 823 / 368 | 554 / 1054 | 13 (about 38 m) | Wikidata Q2868 centre 1.73 km away |
| Istanbul | Oceania and other | 18 (45 cm) | 1887 / 92 | 277 / 248 | 13 (about 38 m) | Wikidata Q406 centre 1.37 km away |
<!-- table:end -->

## What the table shows, and what it does not

1. Each number is one measurement at one point on one day (2026-10-08). It says nothing about the town 2 km away, and a place type with a few rows is not a sample of that type: no conclusion about "deserts" or "mountains" follows from it.
2. Imagery level is the finest Bing level whose tile exists at that point (17-21 probed). It says how sharp the picture can get, not how old it is: Bing capture dates cannot be established (docs/data-sources.md). cm per pixel shrinks toward the poles at the same level, which is why Tromso at level 18 reads 21 cm.
3. OSM counts are what volunteers mapped, not what stands there. 0 at Near Ludhiana and the Thar point means none mapped; Bhawanipatna, a town, has 9. The tagged count is how many could be drawn at a real height; all others get Cesium's guess. Buildings stay a visual aid either way (decisions.md).
4. Mapillary counts are lower bounds. A search returns at most 500 images per box ("+" marks a box that hit that), and in some rows the "any" count is smaller than the 360 count (Ninh Binh, Auckland, Istanbul), so the service does not return every image in a box even below the limit. 0 means none found by this search, not none taken.
5. Terrain level is Cesium World Terrain's finest tile there; the spacing is a rough north-south figure. Level 13 (about 38 m) is the floor seen almost everywhere; finer levels appear only in a few countries (United States, United Kingdom, Australia, New Zealand, Hawaii in this set). Spacing is not accuracy: P1.6.2 measured errors up to 24.7 m at Indian test points.
6. Four places are marked CHECK: the point used is more than 2 km from Wikidata's centre (Mumbai, Can Tho, Manaus, Tokyo). The point is in the city, but it is not the official centre; each row says where it lies.
7. The type names are labels for the Places list. "Oceania and other" holds the rows that did not fit elsewhere (Tokyo, Nairobi, Lima, Istanbul), so it is not a region.

<!-- random:start -->
## 30 random places (P1.12.2, `node web/e2e/random-places.mjs`, 2026-10-09)
Natural Earth populated places (public domain), seed **20261009**, 5 drawn per continent (scripts/ne-places.mjs); one browser, one place at a time, the app's own Enter place (360) and What is here?. Results: 360 opened at the point 1, a 360 within 1 km 3, flat photos only 14, nothing within 1 km 12, errors 0. Cached in data/random-places.json.

| Place | Country | Continent | Enter place (360) | Lookup time | Console errors | What is here? (photos line) |
|---|---|---|---|---|---|---|
| Makeni | Sierra Leone | Africa | flat photo | 0.8 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 441 in all. |
| As Sidr | Libya | Africa | nothing within 1 km | 1.6 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Otavi | Namibia | Africa | flat photo | 0.6 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 45 in all. |
| Harper | Liberia | Africa | nothing within 1 km | 1.6 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Kumbo | Cameroon | Africa | nothing within 1 km | 1.6 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Taibao | Taiwan | Asia | 360 within 1 km | 1.1 s | 0 | Street-level photos within 500 m (Mapillary): 100 true 360, 264 in all. |
| Jambi | Indonesia | Asia | flat photo | 1.8 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Andong | South Korea | Asia | nothing within 1 km | 1.6 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Pagadian | Philippines | Asia | nothing within 1 km | 1.7 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Artvin | Turkey | Asia | nothing within 1 km | 1.6 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Kovrov | Russia | Europe | flat photo | 1.4 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 49 in all. |
| Bezhetsk | Russia | Europe | nothing within 1 km | 3.1 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Rennes | France | Europe | 360 opened | 0.4 s | 0 | Street-level photos within 500 m (Mapillary): 252 true 360, 247 in all. |
| Hania | Greece | Europe | flat photo | 1.1 s | 1 | Street-level photos within 500 m (Mapillary): 163 true 360, 500+ in all. |
| Borisoglebsk | Russia | Europe | flat photo | 1.6 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 156 in all. |
| Naujaat | Canada | North America | nothing within 1 km | 1.9 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Arctic Bay | Canada | North America | nothing within 1 km | 1.9 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Weyburn | Canada | North America | flat photo | 0.8 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 78 in all. |
| Brooks | Canada | North America | flat photo | 2.6 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Yuma | United States of America | North America | flat photo | 0.8 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 440 in all. |
| Passos | Brazil | South America | flat photo | 2.1 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 419 in all. |
| Tacuarembó | Uruguay | South America | 360 within 1 km | 1.1 s | 0 | Street-level photos within 500 m (Mapillary): 217 true 360, 217 in all. |
| Carmelo | Uruguay | South America | nothing within 1 km | 1.7 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Piso Firme | Bolivia | South America | nothing within 1 km | 1.8 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Lorica | Colombia | South America | flat photo | 1.2 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 37 in all. |
| Halls Creek | Australia | Oceania | nothing within 1 km | 1.6 s | 0 | Street-level photos: none within 500 m (Mapillary). |
| Sohano | Papua New Guinea | Oceania | flat photo | 1.5 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 62 in all. |
| Dalby | Australia | Oceania | flat photo | 2.0 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 15 in all. |
| Bowen | Australia | Oceania | flat photo | 1.3 s | 0 | Street-level photos within 500 m (Mapillary): no true 360, 60 in all. |
| Goroka | Papua New Guinea | Oceania | 360 within 1 km | 1.1 s | 0 | Street-level photos within 500 m (Mapillary): 37 true 360, 321 in all. |

Note: the one console error (Hania) came from the MapillaryJS viewer library itself, "MapillaryError: 100 (MLYApiException ...): Param z must be a number", logged right after the 360 viewer opened at Rennes was closed. It was not an uncaught exception, and the app showed its message as usual. Cause NOT FOUND (most likely a request still in flight while the viewer was removed).
<!-- random:end -->
