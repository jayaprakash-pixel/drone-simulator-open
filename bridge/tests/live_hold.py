"""P2A.7.3 live check (needs sim/sitl-win): python bridge/tests/live_hold.py

Through the bridge like a browser: take off, Loiter, fly forward for 3 s, centre all sticks. From 5 s after the release,
for 10 s, the drone must stay within 3 m horizontally and 1 m vertically of where it was at 5 s.
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from harness import Session, metres  # noqa: E402


async def run() -> bool:
    async with Session() as s:
        ok = await s.take_off(20)
        ok &= (await s.cmd("mode", mode="loiter"))["ok"]
        s.sticks["pitch"] = -0.5  # forward
        await asyncio.sleep(3)
        speed = s.state["groundSpeed"]
        s.sticks.update(throttle=0.5, yaw=0.0, pitch=0.0, roll=0.0)  # every key released
        await asyncio.sleep(5)
        ref = dict(s.state)
        horiz = vert = 0.0
        for _ in range(100):  # 10 s
            await asyncio.sleep(0.1)
            st = s.state
            horiz = max(horiz, metres(ref["lat"], ref["lon"], st["lat"], st["lon"]))
            vert = max(vert, abs(st["altMsl"] - ref["altMsl"]))
        print(f"  flying forward at {speed:.1f} m/s, then sticks centred; over the 10 s from 5 s later: {horiz:.2f} m horizontally, {vert:.2f} m vertically (need <= 3 and <= 1)")
        ok &= speed > 2 and horiz <= 3 and vert <= 1
        await s.cmd("land")
        await s.until(lambda: s.state.get("armed") is False, 120)
    print("PASS" if ok else "FAIL")
    return bool(ok)


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(run()) else 1)
