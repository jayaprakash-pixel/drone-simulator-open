# World coverage survey (P1.12.3)

Mapillary street-level images within 500 m of every large populated place: pop_max at least 500,000, plus India state capitals (featurecla Admin-1 capital) and New Delhi, from Natural Earth ne_10m_populated_places_simple (public domain). 1025 places; 1015 surveyed, 10 failed (asked again on the next run). Point used: the place's Natural Earth point (usually the centre). Written by `node scripts/coverage-survey.mjs` from data/coverage-survey.json; a rerun on the same cache gives the same numbers.

**These counts are lower bounds.** Mapillary's search returns at most 500 images per box (marked +), and it does not always return every image in a box even below that (docs/world-coverage.md). "Nothing found" means none found by Mapillary within 500 m of that point, not that no imagery exists. Other providers (Panoramax, KartaView) are not counted here.

## By continent (Mapillary)
| | Places | With true 360 within 500 m | Only flat photos | Nothing found |
|---|---|---|---|---|
| **All** | 1015 | 250 (25 %) | 375 (37 %) | 390 (38 %) |
| Asia | 529 | 68 (13 %) | 162 (31 %) | 299 (57 %) |
| North America | 145 | 61 (42 %) | 65 (45 %) | 19 (13 %) |
| Europe | 138 | 75 (54 %) | 51 (37 %) | 12 (9 %) |
| Africa | 106 | 10 (9 %) | 52 (49 %) | 44 (42 %) |
| South America | 86 | 31 (36 %) | 40 (47 %) | 15 (17 %) |
| Oceania | 8 | 4 (50 %) | 3 (38 %) | 1 (13 %) |
| unknown | 3 | 1 (33 %) | 2 (67 %) | 0 (0 %) |

## Mapillary and Panoramax together
Panoramax (the second provider, P1.12.5) asked at 1015 of these places, 100 pictures at most per search (+ where capped). Shares are of those 1015 places.

| | Places | True 360 from either | Only flat photos | Nothing found by either | Panoramax adds a 360 Mapillary lacks |
|---|---|---|---|---|---|
| **All** | 1015 | 257 (25 %) | 369 (36 %) | 389 (38 %) | 7 |
| Africa | 106 | 10 (9 %) | 52 (49 %) | 44 (42 %) | 0 |
| Asia | 529 | 68 (13 %) | 163 (31 %) | 298 (56 %) | 0 |
| Europe | 138 | 78 (57 %) | 48 (35 %) | 12 (9 %) | 3 |
| North America | 145 | 62 (43 %) | 64 (44 %) | 19 (13 %) | 1 |
| Oceania | 8 | 4 (50 %) | 3 (38 %) | 1 (13 %) | 0 |
| South America | 86 | 34 (40 %) | 37 (43 %) | 15 (17 %) | 3 |
| unknown | 3 | 1 (33 %) | 2 (67 %) | 0 (0 %) | 0 |

Places where only Panoramax has a true 360 within 500 m: Nice (France, 100); Toulouse (France, 100); Bordeaux (France, 100); Rosario (Argentina, 27); Portland (United States of America, 100); Córdoba (Argentina, 98); Brasília (Brazil, 41).

## By country (Mapillary)
| | Places | With true 360 within 500 m | Only flat photos | Nothing found |
|---|---|---|---|---|
| China | 193 | 0 (0 %) | 24 (12 %) | 169 (88 %) |
| India | 109 | 3 (3 %) | 51 (47 %) | 55 (50 %) |
| United States of America | 92 | 43 (47 %) | 41 (45 %) | 8 (9 %) |
| Brazil | 43 | 9 (21 %) | 27 (63 %) | 7 (16 %) |
| Mexico | 29 | 7 (24 %) | 14 (48 %) | 8 (28 %) |
| Russia | 29 | 3 (10 %) | 18 (62 %) | 8 (28 %) |
| Indonesia | 26 | 13 (50 %) | 6 (23 %) | 7 (27 %) |
| Japan | 26 | 17 (65 %) | 8 (31 %) | 1 (4 %) |
| Nigeria | 21 | 0 (0 %) | 9 (43 %) | 12 (57 %) |
| Germany | 19 | 11 (58 %) | 8 (42 %) | 0 (0 %) |
| Iran | 15 | 0 (0 %) | 5 (33 %) | 10 (67 %) |
| Pakistan | 15 | 0 (0 %) | 8 (53 %) | 7 (47 %) |
| South Korea | 15 | 1 (7 %) | 5 (33 %) | 9 (60 %) |
| Turkey | 15 | 1 (7 %) | 9 (60 %) | 5 (33 %) |
| United Kingdom | 15 | 8 (53 %) | 7 (47 %) | 0 (0 %) |
| Taiwan | 12 | 7 (58 %) | 5 (42 %) | 0 (0 %) |
| Egypt | 11 | 0 (0 %) | 3 (27 %) | 8 (73 %) |
| Colombia | 10 | 5 (50 %) | 4 (40 %) | 1 (10 %) |
| Iraq | 10 | 0 (0 %) | 4 (40 %) | 6 (60 %) |
| Italy | 10 | 8 (80 %) | 2 (20 %) | 0 (0 %) |
| Malaysia | 10 | 1 (10 %) | 7 (70 %) | 2 (20 %) |
| Canada | 9 | 7 (78 %) | 1 (11 %) | 1 (11 %) |
| Philippines | 9 | 5 (56 %) | 3 (33 %) | 1 (11 %) |
| Poland | 9 | 5 (56 %) | 3 (33 %) | 1 (11 %) |
| Saudi Arabia | 9 | 0 (0 %) | 6 (67 %) | 3 (33 %) |
| Ukraine | 9 | 3 (33 %) | 3 (33 %) | 3 (33 %) |
| Vietnam | 9 | 4 (44 %) | 2 (22 %) | 3 (33 %) |
| Argentina | 8 | 2 (25 %) | 6 (75 %) | 0 (0 %) |
| France | 8 | 5 (63 %) | 3 (38 %) | 0 (0 %) |
| Morocco | 8 | 3 (38 %) | 3 (38 %) | 2 (25 %) |
| South Africa | 8 | 1 (13 %) | 6 (75 %) | 1 (13 %) |
| Venezuela | 8 | 0 (0 %) | 1 (13 %) | 7 (88 %) |
| Australia | 7 | 3 (43 %) | 3 (43 %) | 1 (14 %) |
| Spain | 7 | 4 (57 %) | 3 (43 %) | 0 (0 %) |
| Congo (Kinshasa) | 6 | 0 (0 %) | 3 (50 %) | 3 (50 %) |
| Algeria | 5 | 0 (0 %) | 3 (60 %) | 2 (40 %) |
| Peru | 5 | 5 (100 %) | 0 (0 %) | 0 (0 %) |
| Uzbekistan | 5 | 0 (0 %) | 2 (40 %) | 3 (60 %) |
| Bangladesh | 4 | 0 (0 %) | 3 (75 %) | 1 (25 %) |
| Chile | 4 | 4 (100 %) | 0 (0 %) | 0 (0 %) |
| Netherlands | 4 | 3 (75 %) | 1 (25 %) | 0 (0 %) |
| North Korea | 4 | 0 (0 %) | 1 (25 %) | 3 (75 %) |
| Syria | 4 | 0 (0 %) | 0 (0 %) | 4 (100 %) |
| Yemen | 4 | 0 (0 %) | 0 (0 %) | 4 (100 %) |
| Afghanistan | 3 | 0 (0 %) | 1 (33 %) | 2 (67 %) |
| Belgium | 3 | 3 (100 %) | 0 (0 %) | 0 (0 %) |
| Bolivia | 3 | 3 (100 %) | 0 (0 %) | 0 (0 %) |
| Israel | 3 | 2 (67 %) | 1 (33 %) | 0 (0 %) |
| Jordan | 3 | 1 (33 %) | 1 (33 %) | 1 (33 %) |
| Mozambique | 3 | 1 (33 %) | 1 (33 %) | 1 (33 %) |
| Myanmar | 3 | 2 (67 %) | 0 (0 %) | 1 (33 %) |
| Portugal | 3 | 3 (100 %) | 0 (0 %) | 0 (0 %) |
| Switzerland | 3 | 3 (100 %) | 0 (0 %) | 0 (0 %) |
| United Arab Emirates | 3 | 0 (0 %) | 3 (100 %) | 0 (0 %) |
| Angola | 2 | 0 (0 %) | 1 (50 %) | 1 (50 %) |
| Cameroon | 2 | 0 (0 %) | 2 (100 %) | 0 (0 %) |
| Congo (Brazzaville) | 2 | 0 (0 %) | 0 (0 %) | 2 (100 %) |
| Cuba | 2 | 1 (50 %) | 1 (50 %) | 0 (0 %) |
| Dominican Republic | 2 | 0 (0 %) | 2 (100 %) | 0 (0 %) |
| Ecuador | 2 | 1 (50 %) | 1 (50 %) | 0 (0 %) |
| Ghana | 2 | 0 (0 %) | 2 (100 %) | 0 (0 %) |
| Greece | 2 | 1 (50 %) | 1 (50 %) | 0 (0 %) |
| Guatemala | 2 | 0 (0 %) | 2 (100 %) | 0 (0 %) |
| Honduras | 2 | 0 (0 %) | 2 (100 %) | 0 (0 %) |
| Ivory Coast | 2 | 0 (0 %) | 1 (50 %) | 1 (50 %) |
| Kenya | 2 | 2 (100 %) | 0 (0 %) | 0 (0 %) |
| Lebanon | 2 | 2 (100 %) | 0 (0 %) | 0 (0 %) |
| Libya | 2 | 0 (0 %) | 0 (0 %) | 2 (100 %) |
| Malawi | 2 | 0 (0 %) | 0 (0 %) | 2 (100 %) |
| Paraguay | 2 | 2 (100 %) | 0 (0 %) | 0 (0 %) |
| Sudan | 2 | 0 (0 %) | 1 (50 %) | 1 (50 %) |
| Sweden | 2 | 0 (0 %) | 2 (100 %) | 0 (0 %) |
| Tanzania | 2 | 1 (50 %) | 0 (0 %) | 1 (50 %) |
| Zimbabwe | 2 | 0 (0 %) | 2 (100 %) | 0 (0 %) |
| Albania | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Armenia | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Azerbaijan | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Bahrain | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Belarus | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Benin | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Bosnia and Herzegovina | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Bulgaria | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Burkina Faso | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Cambodia | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Central African Republic | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Chad | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Costa Rica | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Croatia | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Czechia | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Denmark | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Djibouti | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| El Salvador | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Eritrea | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Ethiopia | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Finland | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Gabon | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Georgia | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Guinea | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Haiti | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Hong Kong S.A.R. | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Hungary | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Ireland | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Jamaica | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Kazakhstan | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Kuwait | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Kyrgyzstan | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Laos | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Liberia | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Lithuania | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Macau S.A.R | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Madagascar | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Mali | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Mauritania | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Mauritius | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Moldova | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Mongolia | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Nepal | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| New Zealand | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Nicaragua | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Niger | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Norway | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Oman | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Palestine | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Panama | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Puerto Rico | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Qatar | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Romania | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Rwanda | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Senegal | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Serbia | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Sierra Leone | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Singapore | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Somalia | 1 | 0 (0 %) | 0 (0 %) | 1 (100 %) |
| Tajikistan | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Thailand | 1 | 1 (100 %) | 0 (0 %) | 0 (0 %) |
| Togo | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Tunisia | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Turkmenistan | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Uganda | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Uruguay | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |
| Zambia | 1 | 0 (0 %) | 1 (100 %) | 0 (0 %) |

## Places with a true 360 within 500 m (number of 360 images)
Tirana (Albania, 7); Buenos Aires (Argentina, 418); La Plata (Argentina, 289); Yerevan (Armenia, 401); Brisbane (Australia, 38); Melbourne (Australia, 744); Sydney (Australia, 229); Minsk (Belarus, 8); Antwerpen (Belgium, 4312); Brussels (Belgium, 2219); Liège (Belgium, 480); Cochabamba (Bolivia, 336); La Paz (Bolivia, 377); Santa Cruz (Bolivia, 205); Sarajevo (Bosnia and Herzegovina, 106); Belém (Brazil, 1187); Campinas (Brazil, 28); Fortaleza (Brazil, 183); Maceió (Brazil, 990); Porto Alegre (Brazil, 49); Santos (Brazil, 1); São Paulo (Brazil, 97); Vila Velha (Brazil, 304); Vitória (Brazil, 357); Sofia (Bulgaria, 1404); Phnom Penh (Cambodia, 1267); Hamilton (Canada, 65); Montréal (Canada, 311); Ottawa (Canada, 896); Québec (Canada, 196); Toronto (Canada, 242); Vancouver (Canada, 238); Winnipeg (Canada, 81); Concepción (Chile, 392); Santiago (Chile, 931); Valparaíso (Chile, 90); Viña del Mar (Chile, 462); Bogota (Colombia, 636); Bucaramanga (Colombia, 1035); Cali (Colombia, 393); Medellín (Colombia, 291); Pereira (Colombia, 124); San José (Costa Rica, 1871); Zagreb (Croatia, 1079); Havana (Cuba, 83); Prague (Czechia, 459); København (Denmark, 997); Quito (Ecuador, 1055); Helsinki (Finland, 1299); Lille (France, 425); Lyon (France, 330); Marseille (France, 297); Paris (France, 296); Rouen (France, 37); Tbilisi (Georgia, 408); Bremen (Germany, 90); Cologne (Germany, 373); Dresden (Germany, 885); Frankfurt (Germany, 252); Hamburg (Germany, 62); Hanover (Germany, 68); Leipzig (Germany, 984); Mannheim (Germany, 424); Munich (Germany, 1096); Nürnberg (Germany, 1253); Wiesbaden (Germany, 329); Athens (Greece, 1625); Budapest (Hungary, 2286); Allahabad (India, 411); Varanasi (India, 340); Vishakhapatnam (India, 467); Banda Aceh (Indonesia, 89); Bandar Lampung (Indonesia, 240); Bandar Lampung (Indonesia, 393); Bandung (Indonesia, 261); Bekasi (Indonesia, 291); Binjai (Indonesia, 182); Denpasar (Indonesia, 59); Jakarta (Indonesia, 353); Malang (Indonesia, 9); Medan (Indonesia, 60); Padang (Indonesia, 393); Surabaya (Indonesia, 1452); Yogyakarta (Indonesia, 1023); Dublin (Ireland, 69); Haifa (Israel, 312); Tel Aviv (Israel, 41); Catania (Italy, 339); Florence (Italy, 454); Genoa (Italy, 1284); Milan (Italy, 1106); Naples (Italy, 96); Palermo (Italy, 1); Rome (Italy, 428); Turin (Italy, 811); Fukuoka (Japan, 232); Hachiōji (Japan, 197); Hiroshima (Japan, 339); Kanazawa (Japan, 350); Kawasaki (Japan, 408); Kōbe (Japan, 461); Kumamoto (Japan, 177); Kyoto (Japan, 1); Matsuyama (Japan, 72); Naha (Japan, 256); Niigata (Japan, 233); Okayama (Japan, 406); Ōtsu (Japan, 963); Sendai (Japan, 34); Shizuoka (Japan, 434); Tokyo (Japan, 794); Yokohama (Japan, 371); Az Zarqa (Jordan, 325); Mombasa (Kenya, 133); Nairobi (Kenya, 441); Kuwait City (Kuwait, 3); Vientiane (Laos, 324); Beirut (Lebanon, 74); Ṭarābulus (Lebanon, 13); Vilnius (Lithuania, 1165); Macau (Macau S.A.R, 282); Kuala Lumpur (Malaysia, 1035); Aguascalientes (Mexico, 141); Cancún (Mexico, 389); León (Mexico, 796); Mérida (Mexico, 371); Morelia (Mexico, 53); Saltillo (Mexico, 321); Torreón (Mexico, 94); Chișinău (Moldova, 1427); Ulaanbaatar (Mongolia, 97); Casablanca (Morocco, 1372); Marrakesh (Morocco, 328); Rabat (Morocco, 69); Maputo (Mozambique, 19); Mandalay (Myanmar, 23); Yangon (Myanmar, 14); Kathmandu (Nepal, 251); Amsterdam (Netherlands, 1405); Rotterdam (Netherlands, 396); The Hague (Netherlands, 253); Auckland (New Zealand, 440); Managua (Nicaragua, 44); Oslo (Norway, 791); Panama City (Panama, 1036); Asunción (Paraguay, 80); San Lorenzo (Paraguay, 75); Arequipa (Peru, 128); Callao (Peru, 416); Chiclayo (Peru, 877); Lima (Peru, 873); Trujillo (Peru, 767); Cebu (Philippines, 201); Davao (Philippines, 801); General Santos (Philippines, 31); Manila (Philippines, 1941); Quezon City (Philippines, 1008); Katowice (Poland, 61); Kraków (Poland, 30); Łódź (Poland, 338); Poznań (Poland, 81); Warsaw (Poland, 53); Braga (Portugal, 231); Lisbon (Portugal, 382); Porto (Portugal, 1544); Bucharest (Romania, 361); St.  Petersburg (Russia, 49); Ulyanovsk (Russia, 401); Vladivostok (Russia, 105); Kigali (Rwanda, 69); Belgrade (Serbia, 59); Freetown (Sierra Leone, 84); Singapore (Singapore, 371); Vereeniging (South Africa, 112); Seoul (South Korea, 387); Barcelona (Spain, 34); Bilbao (Spain, 205); Madrid (Spain, 5); Zaragoza (Spain, 8); Basel (Switzerland, 2); Geneva (Switzerland, 371); Zürich (Switzerland, 1139); Changhua (Taiwan, 285); Keelung (Taiwan, 259); New Taipei (Taiwan, 331); Tainan (Taiwan, 370); Taipei (Taiwan, 849); Taoyuan (Taiwan, 119); Zhongli (Taiwan, 20); Dar es Salaam (Tanzania, 444); Bangkok (Thailand, 274); Icel (Turkey, 250); Kyiv (Ukraine, 2227); Lviv (Ukraine, 1249); Odessa (Ukraine, 25); Bristol (United Kingdom, 837); Cardiff (United Kingdom, 229); Edinburgh (United Kingdom, 259); Glasgow (United Kingdom, 196); Liverpool (United Kingdom, 264); London (United Kingdom, 1319); Nottingham (United Kingdom, 16); Sheffield (United Kingdom, 291); Aurora (United States of America, 434); Austin (United States of America, 93); Birmingham (United States of America, 88); Boston (United States of America, 294); Bridgeport (United States of America, 346); Buffalo (United States of America, 320); Cleveland (United States of America, 364); Covington (United States of America, 445); Dallas (United States of America, 2); Denver (United States of America, 375); Detroit (United States of America, 4078); Fort Lauderdale (United States of America, 294); Fresno (United States of America, 1412); Hartford (United States of America, 2636); Honolulu (United States of America, 405); Houston (United States of America, 232); Jacksonville (United States of America, 1535); Lowell (United States of America, 161); Miami (United States of America, 360); Milwaukee (United States of America, 89); Minneapolis (United States of America, 60); Nashville (United States of America, 145); New Haven (United States of America, 50); New York (United States of America, 1299); Oakland (United States of America, 75); Orlando (United States of America, 408); Pasadena (United States of America, 344); Pittsburgh (United States of America, 346); Providence (United States of America, 500); Richmond (United States of America, 92); Rochester (United States of America, 74); Sacramento (United States of America, 1341); Salt Lake City (United States of America, 421); San Bernardino (United States of America, 259); San Diego (United States of America, 281); San Francisco (United States of America, 2327); San Mateo (United States of America, 351); Sarasota (United States of America, 431); Seattle (United States of America, 416); St.  Paul (United States of America, 320); St. Louis (United States of America, 296); Stamford (United States of America, 1268); Washington,  D.C. (United States of America, 3623); Biên Hòa (Vietnam, 171); Da Nang (Vietnam, 91); Haiphong (Vietnam, 7); Ho Chi Minh City (Vietnam, 4211)

## Places with only flat photos within 500 m (number of images)
Kabul (Afghanistan, 54); Algiers (Algeria, 455); Constantine (Algeria, 58); Oran (Algeria, 359); Luanda (Angola, 500+); Córdoba (Argentina, 500+); Mar del Plata (Argentina, 74); Mendoza (Argentina, 378); Rosario (Argentina, 370); Salta (Argentina, 485); Tucumán (Argentina, 26); Adelaide (Australia, 413); Gold Coast (Australia, 464); Perth (Australia, 66); Manama (Bahrain, 1627); Chattogram (Bangladesh, 108); Dhaka (Bangladesh, 179); Rajshahi (Bangladesh, 410); Belo Horizonte (Brazil, 287); Brasília (Brazil, 322); Canoas (Brazil, 291); Cuiabá (Brazil, 122); Curitiba (Brazil, 280); Duque de Caxias (Brazil, 55); Florianópolis (Brazil, 500+); Goiânia (Brazil, 445+); Jaboatao (Brazil, 357); Joinville (Brazil, 491+); Jundiaí (Brazil, 1614); Londrina (Brazil, 435); Manaus (Brazil, 303); Niterói (Brazil, 198); Nova Iguaçu (Brazil, 500+); Olinda (Brazil, 452); Recife (Brazil, 365); Ribeirão Preto (Brazil, 267); Rio de Janeiro (Brazil, 1699+); Salvador (Brazil, 157); Santo André (Brazil, 1430+); São José dos Campos (Brazil, 474); São José dos Pinhais (Brazil, 500+); São Luís (Brazil, 500+); Sorocaba (Brazil, 1354+); Teresina (Brazil, 256); Uberlândia (Brazil, 389); Ouagadougou (Burkina Faso, 300); Douala (Cameroon, 314); Yaoundé (Cameroon, 153); Edmonton (Canada, 171); Bangui (Central African Republic, 209); Anshun (China, 35); Beijing (China, 500+); Changping (China, 81); Changsha (China, 106); Changzhou (China, 16); Chengdu (China, 327); Chongqing (China, 153); Guangzhou (China, 83); Hangzhou (China, 69); Jiangmen (China, 8); Jiaxing (China, 4); Langfang (China, 35); Lianyungang (China, 500+); Mianyang (China, 206); Nanjing (China, 226); Nanning (China, 6); Ningbo (China, 158); Pingxiang (China, 389); Shanghai (China, 123); Wenzhou (China, 134); Xuzhou (China, 100); Yantai (China, 290); Yichang (China, 215); Yuci (China, 41); Barranquilla (Colombia, 405+); Cartagena (Colombia, 390); Cúcuta (Colombia, 500+); Soledad (Colombia, 1145+); Kinshasa (Congo (Kinshasa), 329); Kisangani (Congo (Kinshasa), 22); Lubumbashi (Congo (Kinshasa), 23); Santiago de Cuba (Cuba, 20); Djibouti (Djibouti, 181); Santiago (Dominican Republic, 47); Santo Domingo (Dominican Republic, 423); Guayaquil (Ecuador, 427); Alexandria (Egypt, 129); Cairo (Egypt, 294); Giza (Egypt, 110); San Salvador (El Salvador, 500+); Addis Ababa (Ethiopia, 5); Bordeaux (France, 193); Nice (France, 227); Toulouse (France, 232); Bonn (Germany, 491); Dortmund (Germany, 466); Duisburg (Germany, 770+); Düsseldorf (Germany, 458); Essen (Germany, 813); Saarbrücken (Germany, 439); Stuttgart (Germany, 357); Wuppertal (Germany, 14); Accra (Ghana, 308); Kumasi (Ghana, 402); Thessaloniki (Greece, 433); Guatemala City (Guatemala, 290); Quetzaltenango (Guatemala, 449+); Conakry (Guinea, 374); Port-au-Prince (Haiti, 74); San Pedro Sula (Honduras, 433+); Tegucigalpa (Honduras, 500+); Hong Kong (Hong Kong S.A.R., 395); Agra (India, 45); Ahmedabad (India, 1); Ajmer (India, 53); Amaravati (India, 1); Amritsar (India, 498); Aurangabad (India, 333); Bareilly (India, 7); Bhavnagar (India, 17); Bhopal (India, 4); Bhubaneswar (India, 481); Chandigarh (India, 133); Chandrapur (India, 233); Chennai (India, 351); Coimbatore (India, 204); Cuttack (India, 99); Daman (India, 3); Dehra Dun (India, 117); Delhi (India, 303); Faridabad (India, 63); Guwahati (India, 424); Hubballi (India, 2); Hyderabad (India, 326); Imphal (India, 72); Indore (India, 196); Itanagar (India, 55); Jaipur (India, 104); Jodhpur (India, 344); Kanpur (India, 101); Kochi (India, 408); Kolhapur (India, 364); Kozhikode (India, 410); Leh (India, 125); Madurai (India, 178); Meerut (India, 2); Mumbai (India, 88); Mysuru (India, 465); Nasik (India, 86); Nellore (India, 143); New Delhi (India, 240); Panaji (India, 499+); Puducherry (India, 334); Pune (India, 475); Rajkot (India, 32); Ranchi (India, 382); Shillong (India, 430); Sholapur (India, 38); Srinagar (India, 11); Surat (India, 3); Thiruvananthapuram (India, 115); Ujjain (India, 14); Vijayawada (India, 500+); Bogor (Indonesia, 392); Bukittinggi (Indonesia, 4); Cilacap (Indonesia, 42); Palembang (Indonesia, 446); Semarang (Indonesia, 44); Surakarta (Indonesia, 101); Arak (Iran, 247); Hamadan (Iran, 6); Karaj (Iran, 298); Mashhad (Iran, 486+); Tehran (Iran, 3); As Sulaymaniyah (Iraq, 500+); Baghdad (Iraq, 27); Basra (Iraq, 68); Irbil (Iraq, 105); Jerusalem (Israel, 328); Bari (Italy, 334); Salerno (Italy, 436); Bouaké (Ivory Coast, 271); Hamamatsu (Japan, 401); Kagoshima (Japan, 478); Kitakyūshū (Japan, 313); Nagoya (Japan, 254); Ōsaka (Japan, 406); Sapporo (Japan, 281); Tsu (Japan, 51); Utsunomiya (Japan, 467); Amman (Jordan, 1529+); Almaty (Kazakhstan, 279); Bishkek (Kyrgyzstan, 491); Monrovia (Liberia, 446); Antananarivo (Madagascar, 98); Butterworth (Malaysia, 340); George Town (Malaysia, 457+); Ipoh (Malaysia, 67); Johor Bahru (Malaysia, 40); Kelang (Malaysia, 26); Kota Baharu (Malaysia, 378); Malacca (Malaysia, 427); Bamako (Mali, 298); Nouakchott (Mauritania, 409); Port Louis (Mauritius, 500+); Chihuahua (Mexico, 176); Cuernavaca (Mexico, 434); Culiacán (Mexico, 51); Guadalajara (Mexico, 357); Hermosillo (Mexico, 387); Mexicali (Mexico, 488); Mexico City (Mexico, 500+); Monterrey (Mexico, 970); Nezahualcoyotl (Mexico, 316); Puebla (Mexico, 410+); San Luis Potosí (Mexico, 371); Tijuana (Mexico, 376); Tlaxcala (Mexico, 43); Veracruz (Mexico, 373); Fez (Morocco, 492); Meknes (Morocco, 220); Tangier (Morocco, 1562+); Matola (Mozambique, 165); Utrecht (Netherlands, 395); Niamey (Niger, 277); Abeokuta (Nigeria, 391); Enugu (Nigeria, 176); Ibadan (Nigeria, 364); Jos (Nigeria, 473); Kaduna (Nigeria, 4); Kano (Nigeria, 423); Lagos (Nigeria, 218); Ogbomosho (Nigeria, 234); Port Harcourt (Nigeria, 417); Pyongyang (North Korea, 22); Muscat (Oman, 496+); Abbottabad (Pakistan, 160); Faisalabad (Pakistan, 406); Hyderabad (Pakistan, 1); Karachi (Pakistan, 26); Lahore (Pakistan, 444); Peshawar (Pakistan, 169); Rawalpindi (Pakistan, 202); Saidu (Pakistan, 74); Bacolod (Philippines, 80); Naga (Philippines, 87); Zamboanga (Philippines, 452); Bytom (Poland, 435); Gdańsk (Poland, 500+); Wrocław (Poland, 453); Doha (Qatar, 494); Astrakhan (Russia, 1); Barnaul (Russia, 499); Chelyabinsk (Russia, 334); Izhevsk (Russia, 73); Kazan (Russia, 1175+); Krasnodar (Russia, 496); Krasnoyarsk (Russia, 293); Lipetsk (Russia, 55); Novokuznetsk (Russia, 266); Orenburg (Russia, 120); Penza (Russia, 43); Rostov (Russia, 398); Ryazan (Russia, 400); Tolyatti (Russia, 307); Volgograd (Russia, 304); Voronezh (Russia, 155); Yaroslavl (Russia, 159); Yekaterinburg (Russia, 170); At Taif (Saudi Arabia, 6); Dammam (Saudi Arabia, 22); Jeddah (Saudi Arabia, 442); Makkah (Saudi Arabia, 7); Medina (Saudi Arabia, 8); Riyadh (Saudi Arabia, 461); Dakar (Senegal, 389); Benoni (South Africa, 44); Cape Town (South Africa, 3); Johannesburg (South Africa, 438); Pietermaritzburg (South Africa, 412); Port Elizabeth (South Africa, 452); Pretoria (South Africa, 251); Ansan (South Korea, 397); Busan (South Korea, 112); Daejeon (South Korea, 117); Jeonju (South Korea, 1); Suwon (South Korea, 35); Málaga (Spain, 465); Seville (Spain, 246); Valencia (Spain, 478); Khartoum (Sudan, 6); Göteborg (Sweden, 116); Stockholm (Sweden, 201); Chiayi (Taiwan, 449); Hsinchu (Taiwan, 419); Kaohsiung (Taiwan, 30); Pingtung (Taiwan, 481+); Taichung (Taiwan, 491); Dushanbe (Tajikistan, 469+); Lomé (Togo, 401); Tunis (Tunisia, 413); Adana (Turkey, 430); Ankara (Turkey, 56); Antalya (Turkey, 443); Diyarbakır (Turkey, 19); Eskişehir (Turkey, 481); Istanbul (Turkey, 21); İzmir (Turkey, 438); Kayseri (Turkey, 447); Samsun (Turkey, 101); Ashgabat (Turkmenistan, 367); Kampala (Uganda, 488); Dnipro (Ukraine, 100); Kharkiv (Ukraine, 718); Mykolayiv (Ukraine, 1752); Abu Dhabi (United Arab Emirates, 386); Dubai (United Arab Emirates, 495+); Sharjah (United Arab Emirates, 483+); Birmingham (United Kingdom, 392); Bradford (United Kingdom, 2); Brighton (United Kingdom, 433); Leeds (United Kingdom, 356); Manchester (United Kingdom, 178); Newcastle (United Kingdom, 97); Southend-on-Sea (United Kingdom, 26); Akron (United States of America, 487+); Albany (United States of America, 73); Albuquerque (United States of America, 481); Arlington (United States of America, 450); Atlanta (United States of America, 227); Baltimore (United States of America, 393); Charlotte (United States of America, 464); Chicago (United States of America, 375); Cincinnati (United States of America, 130); Columbus (United States of America, 312); Dayton (United States of America, 489+); Ft.  Worth (United States of America, 498); Glendale (United States of America, 498+); Grand Rapids (United States of America, 495); Harrisburg (United States of America, 190); Indianapolis (United States of America, 487+); Irvine (United States of America, 464); Kansas City (United States of America, 491+); Kansas City (United States of America, 444+); Las Vegas (United States of America, 66); Long Beach (United States of America, 367); Los Angeles (United States of America, 478+); Louisville (United States of America, 450); Mesa (United States of America, 425); New Orleans (United States of America, 978+); Norfolk (United States of America, 324); Oceanside (United States of America, 66); Oklahoma City (United States of America, 17); Omaha (United States of America, 469); Phoenix (United States of America, 486+); Portland (United States of America, 3759+); Raleigh (United States of America, 321); San Jose (United States of America, 500+); St. Petersburg (United States of America, 424); Stockton (United States of America, 465); Syracuse (United States of America, 359); Tacoma (United States of America, 352); Tampa (United States of America, 1035); Tulsa (United States of America, 149); Vancouver (United States of America, 62); Virginia Beach (United States of America, 310); Montevideo (Uruguay, 378); Samarkand (Uzbekistan, 320); Tashkent (Uzbekistan, 371); Caracas (Venezuela, 69); Hue (Vietnam, 425); Qui Nhon (Vietnam, 118); Lusaka (Zambia, 399); Bulawayo (Zimbabwe, 2); Harare (Zimbabwe, 419)

## Places with nothing found within 500 m
Jalalabad (Afghanistan); Kandahar (Afghanistan); Annaba (Algeria); Blida (Algeria); Huambo (Angola); Newcastle (Australia); Baku (Azerbaijan); Khulna (Bangladesh); Cotonou (Benin); Aracaju (Brazil); Campo Grande (Brazil); João Pessoa (Brazil); Natal (Brazil); Natal (Brazil); Novo Hamburgo (Brazil); Vila Velha (Brazil); Calgary (Canada); N'Djamena (Chad); Aksu (China); Ankang (China); Anqing (China); Anshan (China); Anyang (China); Baoding (China); Baoji (China); Baoshan (China); Baotou (China); Beihai (China); Bengbu (China); Benxi (China); Cangzhou (China); Changchun (China); Changde (China); Changzhi (China); Chifeng (China); Dalian (China); Dandong (China); Daqing (China); Datong (China); Dongguan (China); Foshan (China); Fushun (China); Fuxin (China); Fuyang (China); Fuzhou (China); Ganzhou (China); Guilin (China); Guiyang (China); Haikou (China); Hami (China); Handan (China); Harbin (China); Hechi (China); Hefei (China); Hegang (China); Hengyang (China); Heze (China); Hohhot (China); Huaibei (China); Huainan (China); Huaiyin (China); Huangshi (China); Huzhou (China); Jiamusi (China); Jian (China); Jianmen (China); Jiaozuo (China); Jilin (China); Jinan (China); Jincheng (China); Jingzhou (China); Jinhua (China); Jining (China); Jinxi (China); Jinzhou (China); Jiujiang (China); Jixi (China); Kaifeng (China); Kashgar (China); Korla (China); Kunming (China); Lanzhou (China); Leshan (China); Liaoyang (China); Liaoyuan (China); Linfen (China); Lingyuan (China); Linxia (China); Linyi (China); Liupanshui (China); Liuzhou (China); Luan (China); Luoyang (China); Luzhou (China); Maanshan (China); Maoming (China); Mudangiang (China); Nanchang (China); Nanchong (China); Nantong (China); Nanyang (China); Neijiang (China); Pingdingshan (China); Puyang (China); Qingdao (China); Qingyuan (China); Qinhuangdao (China); Qiqihar (China); Quanzhou (China); Rizhao (China); Shache (China); Shangqiu (China); Shangrao (China); Shantou (China); Shaoguan (China); Shaoxing (China); Shenyeng (China); Shenzhen (China); Shihezi (China); Shijiazhuang (China); Shiyan (China); Shuangyashan (China); Shuozhou (China); Shuyang (China); Siping (China); Suining (China); Suzhou (China); Suzhou (China); Taian (China); Taiyuan (China); Taizhou (China); Tangshan (China); Tianjin (China); Tianshui (China); Tongliao (China); Tongling (China); Turpan (China); Ürümqi (China); Wanzhou (China); Weifang (China); Weihai (China); Wuhan (China); Wuhu (China); Wuxi (China); Xiamen (China); Xian (China); Xiangtai (China); Xiangtan (China); Xiangyang (China); Xiantao (China); Xianyang (China); Xingyi (China); Xining (China); Xinxiang (China); Xinyang (China); Xinyi (China); Xinyu (China); Xuanzhou (China); Yancheng (China); Yangjiang (China); Yangquan (China); Yangzhou (China); Yibin (China); Yichun (China); Yichun (China); Yinchuan (China); Yingkow (China); Yining (China); Yiyang (China); Yongzhou (China); Yueyang (China); Yulin (China); Zaozhuang (China); Zhangjiakou (China); Zhangzhou (China); Zhanjiang (China); Zhanyi (China); Zhaotang (China); Zhengzhou (China); Zhenjiang (China); Zhucheng (China); Zhuhai (China); Zhuozhou (China); Zhuzhou (China); Zibo (China); Zigong (China); Zunyi (China); Bello (Colombia); Brazzaville (Congo (Brazzaville)); Pointe-Noire (Congo (Brazzaville)); Kananga (Congo (Kinshasa)); Kikwit (Congo (Kinshasa)); Mbuji-Mayi (Congo (Kinshasa)); Bur Said (Egypt); Damanhûr (Egypt); El Mansura (Egypt); El Minya (Egypt); Ismaïlia (Egypt); Luxor (Egypt); Sohag (Egypt); Suez (Egypt); Asmara (Eritrea); Libreville (Gabon); Agartala (India); Aizawl (India); Akola (India); Aligarh (India); Amravati (India); Asansol (India); Belagavi (India); Bengaluru (India); Bhilai (India); Bhiwandi (India); Bikaner (India); Bilaspur (India); Davangere (India); Dhanbad (India); Dispur (India); Gandhinagar (India); Gangtok (India); Ghaziabad (India); Gorakhpur (India); Guntur (India); Gwalior (India); Haora (India); Hisar (India); Jabalpur (India); Jammu (India); Jamshedpur (India); Jhansi (India); Jullundur (India); Kalyan (India); Kavaratti (India); Kohima (India); Kolkata (India); Kota (India); Lucknow (India); Ludhiana (India); Malegaon (India); Mangaluru (India); Moradabad (India); Nagpur (India); Nanded (India); Patna (India); Port Blair (India); Raipur (India); Raurkela (India); Salem (India); Sangli (India); Shivamogga (India); Siliguri (India); Silvassa (India); Simla (India); Tiruchirappalli (India); Tirunelveli (India); Tiruppur (India); Vadodara (India); Warangal (India); Bandjarmasin (Indonesia); Makassar (Indonesia); Palu (Indonesia); Pasuruan (Indonesia); Pekanbaru (Indonesia); Pontianak (Indonesia); Samarinda (Indonesia); Ahvaz (Iran); Isfahan (Iran); Kerman (Iran); Kermanshah (Iran); Qom (Iran); Rasht (Iran); Shiraz (Iran); Tabriz (Iran); Urmia (Iran); Zahedan (Iran); Al Hillah (Iraq); Duhok (Iraq); Karbala (Iraq); Kirkuk (Iraq); Mosul (Iraq); Najaf (Iraq); Abidjan (Ivory Coast); Kingston (Jamaica); Nagano (Japan); Irbid (Jordan); Banghazi (Libya); Tripoli (Libya); Blantyre (Malawi); Lilongwe (Malawi); Kota Kinabalu (Malaysia); Kuching (Malaysia); Acapulco (Mexico); Ciudad Juárez (Mexico); Matamoros (Mexico); Mazatlán (Mexico); Oaxaca (Mexico); Querétaro (Mexico); Tampico (Mexico); Toluca (Mexico); Agadir (Morocco); Kenitra (Morocco); Beira (Mozambique); Naypyidaw (Myanmar); Aba (Nigeria); Abuja (Nigeria); Awka (Nigeria); Benin City (Nigeria); Ikare (Nigeria); Ilorin (Nigeria); Maiduguri (Nigeria); Oyo (Nigeria); Sokoto (Nigeria); Uyo (Nigeria); Warri (Nigeria); Zaria (Nigeria); Chongjin (North Korea); Hamhung (North Korea); Nampo (North Korea); Bahawalpur (Pakistan); Bannu (Pakistan); Gujranwala (Pakistan); Islamabad (Pakistan); Multan (Pakistan); Quetta (Pakistan); Sargodha (Pakistan); Gaza City (Palestine); Cagayan de Oro (Philippines); Gliwice (Poland); San Juan (Puerto Rico); Irkutsk (Russia); Khabarovsk (Russia); Makhachkala (Russia); Novosibirsk (Russia); Omsk (Russia); Saratov (Russia); Tomsk (Russia); Tyumen (Russia); Al Hillah (Saudi Arabia); Hofuf (Saudi Arabia); Tabuk (Saudi Arabia); Mogadishu (Somalia); Durban (South Africa); Bucheon (South Korea); Changwon (South Korea); Cheongju (South Korea); Daegu (South Korea); Goyang (South Korea); Gwangju (South Korea); Incheon (South Korea); Songnam (South Korea); Ulsan (South Korea); Omdurman (Sudan); Aleppo (Syria); Damascus (Syria); Homs (Syria); Latakia (Syria); Moshi (Tanzania); Bursa (Turkey); Gaziantep (Turkey); Konya (Turkey); Tarsus (Turkey); Trabzon (Turkey); Donetsk (Ukraine); Kryvyy Rih (Ukraine); Zaporizhzhya (Ukraine); El Paso (United States of America); Gary (United States of America); Joliet (United States of America); Memphis (United States of America); Philadelphia (United States of America); San Antonio (United States of America); Tucson (United States of America); West Palm Beach (United States of America); Andijan (Uzbekistan); Fargona (Uzbekistan); Namangan (Uzbekistan); Barcelona (Venezuela); Barquisimeto (Venezuela); Ciudad Guayana (Venezuela); Maracaibo (Venezuela); Maracay (Venezuela); Puerto la Cruz (Venezuela); Valencia (Venezuela); Can Tho (Vietnam); Thái Nguyên (Vietnam); Vinh (Vietnam); Aden (Yemen); Al Hudaydah (Yemen); Sanaa (Yemen); Taizz (Yemen)

## Not surveyed: Mapillary refused the request
Knoxville (United States of America): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Nizhny Novgorod (Russia): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Ufa (Russia): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Samara (Russia): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Perm (Russia): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Riga (Latvia): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Hanoi (Vietnam): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Berlin (Germany): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Vienna (Austria): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request; Moscow (Russia): Mapillary HTTP 500: Please reduce the amount of data you're asking for, then retry your request. These are among the densest image areas (Mapillary refused even a box split into 64 parts); they are retried on the next run.

## KartaView check (P1.12.5, \`node scripts/kartaview-probe.mjs\`, 2026-10-09)
A seeded sample (seed 20261009) of 40 of the places where neither Mapillary nor Panoramax found anything within 500 m, one KartaView request each within 100 m (500 m queries timed out), paced at 100 an hour. KartaView had photos at 2 (Bahawalpur, Pakistan: 2; Can Tho, Vietnam: 1), none at 37, and 1 query timed out (Kota Kinabalu). So KartaView adds coverage Mapillary lacks, and it is now the third provider at clicked points. Results in data/kartaview-probe.json.
