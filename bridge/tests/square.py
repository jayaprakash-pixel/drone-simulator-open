"""P2A.2.5 bridge integration test (needs sim/sitl-win): python bridge/tests/square.py

Through the bridge only, like a browser: arm, take off to 10 m, fly a 30 m square in Loiter by sticks (steering on the
streamed DroneState), come back over home, land. Pass: the recorded path (sim/run/square-path.json) passes within 3 m
of all 4 corners, and the last state is disarmed within 3 m of home. Run it after every bridge change.

Stick directions in Loiter, measured 2026-10-09 at heading 0 (0.5 for 3 s): pitch +0.5 moved 13.5 m SOUTH (positive pitch
is nose up, so forward is negative pitch), roll +0.5 moved 13.3 m EAST (positive roll is right).
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)
import asyncio
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from harness import BRIDGE, Session, metres, north_east  # noqa: E402

SIDE = 30.0  # metres
GAIN, LIMIT = 0.05, 0.5  # stick per metre of error, largest stick


def clamp(v):
    return max(-LIMIT, min(LIMIT, v))


async def fly_to(s, la, lo, seconds=60) -> bool:
    """Steers by sticks until within 1 m and nearly still; True when reached."""
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        st = s.state
        n, e = north_east(st["lat"], st["lon"], la, lo)
        h = math.radians(st["headingDeg"])
        fwd, right = n * math.cos(h) + e * math.sin(h), -n * math.sin(h) + e * math.cos(h)
        s.sticks.update(pitch=clamp(-GAIN * fwd), roll=clamp(GAIN * right))
        if math.hypot(n, e) < 1 and st["groundSpeed"] < 0.5:
            s.sticks.update(pitch=0.0, roll=0.0)
            return True
        await asyncio.sleep(0.04)
    s.sticks.update(pitch=0.0, roll=0.0)
    return False


async def run() -> bool:
    ok = True
    async with Session() as s:
        ok &= await s.take_off(10)
        ok &= (await s.cmd("mode", mode="loiter"))["ok"]
        home = (s.state["lat"], s.state["lon"])
        d_lat, d_lon = SIDE / 111_195, SIDE / (111_195 * math.cos(math.radians(home[0])))
        corners = [(home[0] + d_lat, home[1]), (home[0] + d_lat, home[1] + d_lon), (home[0], home[1] + d_lon), home]
        for i, c in enumerate(corners, 1):
            reached = await fly_to(s, *c)
            print(f"  corner {i}: {'reached' if reached else 'NOT reached in 60 s'}", flush=True)
            ok &= reached
        ok &= (await s.cmd("land"))["ok"]
        ok &= await s.until(lambda: s.state.get("armed") is False, 120)
        path = list(s.path)
    (BRIDGE.parent / "sim" / "run-test" / "square-path.json").write_text(json.dumps(path))
    # corners in order along the recorded path: corner 4 (home) counts only after corner 3, not at the take off
    k = 0
    for i, c in enumerate(corners, 1):
        dist = [metres(p["lat"], p["lon"], *c) for p in path[k:]]
        hit = next((j for j, d in enumerate(dist) if d <= 3), None)
        best = min(dist) if dist else float("inf")
        print(f"  path passes corner {i} within {best:.2f} m after corner {i - 1} (need <= 3)")
        ok &= hit is not None
        k += hit or 0
    end = path[-1]
    off = metres(end["lat"], end["lon"], *home)
    print(f"  last state: armed {end['armed']}, {off:.2f} m from home (need disarmed, <= 3 m); {len(path)} states recorded")
    ok &= end["armed"] is False and off <= 3
    print("PASS" if ok else "FAIL")
    return bool(ok)


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(run()) else 1)
