"""P3.5.1 golden flight (needs sim/sitl-win): a scripted calm-air mission through the bridge, like a browser.

    python bridge/tests/golden.py --save            fly it and save the path as data/golden/calm.jsonl
    python bridge/tests/golden.py                   fly it and compare with data/golden/calm.jsonl
    python bridge/tests/golden.py --wind 5          the same mission in 5 m/s wind (P3.5.3; set on SITL's second port)
    python bridge/tests/golden.py --params FILE     load a .param file first (P3.5.5; whitelisted names only)
    --out PATH  also save this run's path

The mission: Pushkar (the test home), 5 waypoints 40-60 m apart at 15-25 m, 5 m/s, uploaded with the mission command,
armed and taken off, then Auto. The path is every DroneState from Auto until the mission's last item (return home).
Prints the largest position drift from the golden path at the same time since Auto (m), the time drift (s), and the
largest cross-track distance from the planned route (m). Pass/fail against data/golden/thresholds.json when it exists
(thresholds set from the first three runs, decisions.md).
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)

import argparse
import asyncio
import json
import math
import sys
import time
from pathlib import Path

from pymavlink import mavutil

sys.path.insert(0, str(Path(__file__).parent))
from harness import BRIDGE, TEST_HOME, Session, metres, north_east  # noqa: E402

sys.path.insert(0, str(BRIDGE))
import sitl  # noqa: E402
from contract import WHITELIST  # noqa: E402

GOLDEN = BRIDGE.parent / "data" / "golden"
R = math.pi / 180


def offset(n, e, alt, speed=5.0):
    return {"lat": TEST_HOME[0] + n / 111_195, "lon": TEST_HOME[1] + e / (111_195 * math.cos(TEST_HOME[0] * R)), "alt": alt, "speed": speed}


MISSION = [offset(40, 0, 15), offset(40, 50, 20), offset(0, 60, 25), offset(-40, 30, 20), offset(-30, -20, 15)]


def cross_track(p, route) -> float:
    """Shortest distance (m) from point p to the polyline route (flat-earth, metres around the first point)."""
    def xy(q):
        n, e = north_east(route[0][0], route[0][1], q[0], q[1])
        return e, n
    px, py = xy(p)
    best = math.inf
    for a, b in zip(route, route[1:]):
        (ax, ay), (bx, by) = xy(a), xy(b)
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
        best = min(best, math.hypot(px - ax - t * dx, py - ay - t * dy))
    return best


def side_wind(speed: float, direction: float = 90) -> None:
    """Simulator wind on SITL's second port (test tooling: the app's own wind choices are the presets)."""
    m = mavutil.mavlink_connection(f"udpin:127.0.0.1:{sitl.udp_ports()[1]}", source_system=250)
    m.wait_heartbeat(timeout=30)
    for name, v in (("SIM_WIND_SPD", speed), ("SIM_WIND_DIR", direction), ("SIM_WIND_TURB", 0)):
        m.mav.param_set_send(1, 1, name.encode(), float(v), mavutil.mavlink.MAV_PARAM_TYPE_REAL32)
        got = m.recv_match(type="PARAM_VALUE", blocking=True, timeout=5)
        print(f"  {name} -> {got.param_value if got else 'no answer'}", flush=True)
    m.close()


def read_param_file(path: str) -> dict:
    out = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            name, value = line.replace("\t", ",").replace(" ", ",").split(",")[:2]
            if name in WHITELIST:
                out[name] = float(value)
    return out


async def fly(wind: float | None, params: str | None) -> list[dict]:
    path = []
    async with Session() as s:
        await s.until(lambda: s.state.get("gpsFix", 0) >= 3, 90)
        if params:
            a = await s.cmd("params", values=read_param_file(params))
            if not a["ok"]:
                raise SystemExit(f"params refused: {a['reason']}")
        if wind is not None:
            side_wind(wind)
        if not (await s.cmd("mission", waypoints=MISSION))["ok"]:
            raise SystemExit("mission upload refused")
        if not await s.take_off(MISSION[0]["alt"]):
            raise SystemExit("did not take off")
        if not (await s.cmd("mode", mode="auto"))["ok"]:
            raise SystemExit("Auto refused")
        t0 = time.monotonic()
        seen = len(s.path)
        while time.monotonic() - t0 < 300:
            for st in s.path[seen:]:
                if st.get("mode") == "AUTO":
                    path.append({"t": round(time.monotonic() - t0, 2), "lat": st["lat"], "lon": st["lon"], "altAgl": st["altAgl"], "wp": st.get("wp"), "state": st})
            seen = len(s.path)
            if s.state.get("mode") == "RTL" or (path and s.state.get("mode") not in ("AUTO", "GUIDED")):
                break
            await asyncio.sleep(0.1)
        await s.cmd("land", quiet=True)
    return path


def compare(run: list[dict], gold: list[dict]) -> dict:
    def at(path, t):
        return min(path, key=lambda p: abs(p["t"] - t))
    drift = max(metres(g["lat"], g["lon"], at(run, g["t"])["lat"], at(run, g["t"])["lon"]) for g in gold)
    return {"position_drift_m": round(drift, 2), "time_drift_s": round(abs(run[-1]["t"] - gold[-1]["t"]), 2)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--save", action="store_true")
    ap.add_argument("--wind", type=float)
    ap.add_argument("--params")
    ap.add_argument("--out")
    ap.add_argument("--summary", help="also write the summary JSON here")
    a = ap.parse_args()
    path = asyncio.run(fly(a.wind, a.params))
    if len(path) < 10:
        print(f"FAIL only {len(path)} states in Auto")
        return 1
    route = [TEST_HOME] + [(w["lat"], w["lon"]) for w in MISSION]
    xt = max(cross_track((p["lat"], p["lon"]), route) for p in path)
    reached = [min(metres(w["lat"], w["lon"], p["lat"], p["lon"]) for p in path) for w in MISSION]
    summary = {"states": len(path), "duration_s": path[-1]["t"], "max_cross_track_m": round(xt, 2), "nearest_pass_m": [round(r, 1) for r in reached], "wind": a.wind}
    GOLDEN.mkdir(parents=True, exist_ok=True)
    if a.out:  # as a flight log the replay screen opens (?replay): one sample per state
        Path(a.out).write_text("\n".join(json.dumps({"t": p["state"]["t"], "type": "sample", "state": p["state"]}) for p in path) + "\n")
    if a.save:
        (GOLDEN / "calm.jsonl").write_text("\n".join(json.dumps({k: v for k, v in p.items() if k != "state"}) for p in path) + "\n")
        print(json.dumps({**summary, "saved": str(GOLDEN / "calm.jsonl")}))
        return 0
    gold = [json.loads(l) for l in (GOLDEN / "calm.jsonl").read_text().splitlines() if l]
    summary.update(compare(path, gold))
    th = GOLDEN / "thresholds.json"
    if th.exists():
        limits = json.loads(th.read_text())
        summary["pass"] = summary["position_drift_m"] <= limits["position_drift_m"] and summary["time_drift_s"] <= limits["time_drift_s"]
        summary["thresholds"] = limits
    print(json.dumps(summary))
    if a.summary:
        Path(a.summary).write_text(json.dumps(summary))
    return 0 if summary.get("pass", True) else 1


if __name__ == "__main__":
    sys.exit(main())
