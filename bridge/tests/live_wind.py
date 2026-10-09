"""P3.2.1 live check (needs sim/sitl-win): python bridge/tests/live_wind.py

Each wind preset through the bridge (the bridge reads every SIM_WIND_* parameter back), then a 15 s hover in AltHold
(holds height, not position) in calm air and in the 8 m/s preset: the strong wind must push the drone measurably further.
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from harness import Session, metres  # noqa: E402


async def drift(s, preset: str, seconds: float = 15) -> float:
    assert (await s.cmd("wind", preset=preset))["ok"]
    assert (await s.cmd("mode", mode="loiter"))["ok"]
    await asyncio.sleep(3)  # settle in place
    assert (await s.cmd("mode", mode="altHold"))["ok"]
    a = dict(s.state)
    await asyncio.sleep(seconds)
    d = metres(a["lat"], a["lon"], s.state["lat"], s.state["lon"])
    print(f"  {preset}: drifted {d:.1f} m in {seconds:.0f} s of AltHold hover")
    return d


async def run() -> bool:
    ok = True
    async with Session() as s:
        ok &= await s.take_off(20)
        for p in ("calm", "breeze", "strong", "gusty"):
            ok &= (await s.cmd("wind", preset=p))["ok"]  # ok only when every parameter read back equal
        calm = await drift(s, "calm")
        strong = await drift(s, "strong")
        print(f"  strong wind drift {strong:.1f} m vs calm {calm:.1f} m")
        ok &= strong > calm + 5
        await s.cmd("wind", preset="calm")
        await s.cmd("mode", mode="rtl")
        await s.until(lambda: s.state.get("armed") is False, 180)
    print("PASS" if ok else "FAIL")
    return bool(ok)


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(run()) else 1)
