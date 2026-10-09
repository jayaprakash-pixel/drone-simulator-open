# Tuning values

Values the plan asks to record, with where they live and how they were checked. The hands-on tuning session (P2A.7.1)
changes them; update this file when it does.

## Camera views (P2A.4.2, `web/src/drone/views.ts`)
| View | Value | Measured by `web/e2e/views.mjs` (2026-10-09) |
|---|---|---|
| Chase | 12 m behind the drone along the ground (`CHASE_BACK_M`), 5 m above it (`CHASE_UP_M`), looking at it (pitch -22.6 degrees) | 12.00 m back at heading+180, 5.00 m up, camera heading = drone heading |
| First-person | 0.3 m ahead of the drone's centre (`NOSE_M`), at its height, looking along its heading and pitch | 0.30 m ahead, heading 60.0 and pitch 5.0 for a drone at 60 and 5 |
| Top-down | 150 m above the drone (`TOP_M`), straight down, north up | pitch -90.0, 150.0 m up, 0.00 m off |
| Free | normal globe controls; the camera stays where it is | did not move when the drone moved 111 m; a drag moved it 509 m |

C cycles chase, first-person, top-down, free, then chase again; it does nothing while you type in a text box or before a drone is on the globe.

## Drone smoothing (P2A.4.1, `web/src/drone/smoother.ts`)
- Time constant 40 ms (`TAU_MS`): 99 percent of a jump is closed after 200 ms, with no overshoot.
