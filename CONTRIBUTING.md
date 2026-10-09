# Contributing

Thank you for helping. Small, tested changes are easiest to review.

## Setup
Follow the Quick start in README.md: Node.js 22 and Python 3.11, `npm ci` in `web/`, a virtual environment for the bridge
with `pip install -r bridge/requirements.txt`. Put tokens only in `web/.env.local` (copy `web/.env.example`); it is
git-ignored. Never commit a token, a key or a client secret.

## Branches and pull requests
1. Fork the repository and create a branch from `main` (for example `fix/geofence-ring`).
2. Keep each pull request to one change, with a test that fails without it.
3. Run the checks below, then open a pull request using the template; describe what you changed and how you checked it.
4. A maintainer reviews it; CI must pass.

## Which checks need what
| Check | Command | Needs |
|---|---|---|
| Web unit tests | `cd web && npm test` | nothing (no token, no GPU) |
| Type check and build | `cd web && npm run build` | nothing |
| Bridge tests | `bridge/.venv/Scripts/python -m pytest bridge/tests -q` (Windows) | nothing |
| Browser checks (`web/e2e/*.mjs`, not `*-live`) | `cd web && npm run e2e` with the app served on 127.0.0.1:3003 | an installed Edge, a GPU; most need a Cesium ion token, some a Mapillary token |
| Live checks (`web/e2e/*-live.mjs`, `bridge/tests/live_*.py`, `golden.py`) | see each file's header | the ArduPilot simulator (Windows), a Cesium ion token |

CI runs only the first three (no secrets, no browser). Please run the browser and live checks that touch your change
locally and say so in the pull request.

## Style
Match the code around you: plain names, short comments that say why, no new dependency when a few lines do. User-facing
text is plain English and says what to do next.

## Licence of contributions
By contributing you agree that your contribution is licensed under the repository's licence (Apache-2.0, LICENSE),
as described in its section 5.
