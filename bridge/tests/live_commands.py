"""P2A.2.4 live check (needs sim/sitl-win): python bridge/tests/live_commands.py

Through the bridge's WebSocket only: take off before arming (must be refused with a reason), arm, take off to 10 m,
hover 5 s, Loiter, AltHold, Stabilize and RTL (each confirmed by the autopilot's next HEARTBEAT), land, disarm.
Sticks are sent at 25 per second the whole time, as a browser would: throttle down (0) until airborne, because
ArduCopter refuses to arm with the throttle up ("Arm: Throttle too high"), then centred (0.5) so the hold modes hold. Exit code 0 on pass.
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)
import asyncio
import itertools
import json
import subprocess
import sys
import time
from pathlib import Path

from websockets.asyncio.client import connect

BRIDGE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BRIDGE))
import sitl  # noqa: E402
from harness import TEST_HOME  # noqa: E402

LOG = BRIDGE.parent / "sim" / "run-test" / "bridge.log"


async def run() -> bool:
    ok = True
    sim = sitl.start(*TEST_HOME)
    log = open(LOG, "w")
    bridge = subprocess.Popen([str(BRIDGE / ".venv" / "Scripts" / "python.exe"), str(BRIDGE / "ws_server.py")], cwd=BRIDGE, stdout=log, stderr=subprocess.STDOUT)
    acks, state, ids, throttle = {}, {}, itertools.count(1), [0.0]
    try:
        await asyncio.sleep(2)
        async with connect("ws://127.0.0.1:8001") as ws:

            async def receive():
                async for raw in ws:
                    d = json.loads(raw)
                    if d.get("type") == "ack":
                        acks[d["id"]] = d
                    else:
                        state.update(d)

            async def sticks():
                while True:
                    await ws.send(json.dumps({"throttle": throttle[0], "yaw": 0, "pitch": 0, "roll": 0}))
                    await asyncio.sleep(0.04)

            tasks = [asyncio.create_task(receive()), asyncio.create_task(sticks())]

            async def cmd(command, **kw):
                i = next(ids)
                await ws.send(json.dumps({"type": "command", "id": i, "command": command, **kw}))
                end = time.monotonic() + 15
                while i not in acks and time.monotonic() < end:
                    await asyncio.sleep(0.05)
                a = acks.get(i, {"ok": False, "reason": "no ack from the bridge within 15 s"})
                print(f"  {command} {kw or ''}: {'ok' if a['ok'] else 'refused: ' + a['reason']}")
                return a

            async def until(check, seconds):
                end = time.monotonic() + seconds
                while time.monotonic() < end and not check():
                    await asyncio.sleep(0.1)
                return check()

            a = await cmd("takeoff", alt=10)
            ok &= not a["ok"] and bool(a["reason"])
            ok &= await until(lambda: state.get("gpsFix", 0) >= 3, 60)
            # arm, then take off; repeat until the take off is accepted. Early refusals come with the autopilot's words
            # ("Arm: Accels inconsistent", "Mode change to Guided failed: requires position" until its position estimate
            # is ready); an armed copter left idle disarms itself, hence arm inside the loop
            flying, end = False, time.monotonic() + 120
            while not flying and time.monotonic() < end:
                a = await cmd("arm")
                if a["ok"]:
                    a = await cmd("takeoff", alt=10)
                    flying = a["ok"]
                ok &= flying or bool(a["reason"])  # every refusal says why
                if not flying:
                    await asyncio.sleep(3)
            ok &= flying
            climbed = await until(lambda: state.get("altAgl", 0) >= 9.5, 40)
            print(f"  reached {state.get('altAgl', 0):.1f} m: {climbed}")
            throttle[0] = 0.5  # airborne: centre the throttle before any mode that reads it
            ok &= climbed
            hover = []
            for _ in range(50):
                hover.append(state["altAgl"])
                await asyncio.sleep(0.1)
            print(f"  hover 5 s: {min(hover):.1f} to {max(hover):.1f} m")
            ok &= min(hover) > 8
            for mode in ("loiter", "altHold", "stabilize", "rtl"):
                ok &= (await cmd("mode", mode=mode))["ok"]
                print(f"    state mode now {state.get('mode')}")
                await asyncio.sleep(2)
            ok &= (await cmd("land"))["ok"]
            down = await until(lambda: state.get("armed") is False, 120)
            print(f"  landed and disarmed itself: {down} (altAgl {state.get('altAgl', 0):.1f} m)")
            ok &= down
            ok &= (await cmd("disarm"))["ok"]
            for t in tasks:
                t.cancel()
    finally:
        bridge.kill()
        bridge.wait(10)
        sitl.stop(sim)
    print("PASS" if ok else "FAIL")
    return bool(ok)


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(run()) else 1)
