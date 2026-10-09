"""P2A.9.2 live check (needs sim/sitl-win): python bridge/tests/live_idle.py

On a test bridge (8001, DW_SIM_PROFILE=test): (1) place a drone, leave it on the ground, close every browser: the
simulator must stop within IDLE_STOP_S + 30 s. (2) place again, arm and take off to 10 m (no sticks sent, so leaving does
not trigger the return-home hold), close every browser: the simulator must still run IDLE_STOP_S + 30 s later, and a
browser that reconnects then still sees the drone airborne. Stops every process it started. Exit code 0 on pass.
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
from ws_server import IDLE_STOP_S  # noqa: E402

LIMIT = IDLE_STOP_S + 30
ids = itertools.count(1)


def alive(pid: int) -> bool:
    return "ArduCopter.elf" in subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"], capture_output=True, text=True).stdout


async def session(airborne: bool) -> tuple[int, dict]:
    """Places the drone (and flies it up when asked), then disconnects. Returns the simulator PID and the last state."""
    async with connect("ws://127.0.0.1:8001") as ws:
        state, acks = {}, {}

        async def receive():
            async for raw in ws:
                d = json.loads(raw)
                (acks.__setitem__(d["id"], d) if d.get("type") == "ack" else state.update(d) if "lat" in d else None)

        rx = asyncio.create_task(receive())

        async def cmd(command, timeout=120, **kw):
            i = next(ids)
            await ws.send(json.dumps({"type": "command", "id": i, "command": command, **kw}))
            end = time.monotonic() + timeout
            while i not in acks and time.monotonic() < end:
                await asyncio.sleep(0.1)
            return acks.get(i, {"ok": False, "reason": "no answer"})

        a = await cmd("place", lat=TEST_HOME[0], lon=TEST_HOME[1], altMsl=0, heading=0)
        print(f"  place: {'Ready' if a['ok'] else a['reason']}", flush=True)
        pid = int(sitl.pidfile().read_text())
        if airborne:
            end = time.monotonic() + 120
            while time.monotonic() < end:
                if (await cmd("arm", 15))["ok"] and (await cmd("takeoff", 15, alt=10))["ok"]:  # takeoff picks its own mode
                    break
                await asyncio.sleep(3)
            end = time.monotonic() + 40
            while state.get("altAgl", 0) < 9.5 and time.monotonic() < end:
                await asyncio.sleep(0.2)
            print(f"  airborne at {state.get('altAgl', 0):.1f} m, armed {state.get('armed')}", flush=True)
        rx.cancel()
        return pid, dict(state)


async def watch(pid: int, seconds: float) -> float | None:
    """Seconds until the simulator PID is gone, or None if it still runs after `seconds`."""
    t0 = time.monotonic()
    while time.monotonic() - t0 < seconds:
        if not alive(pid):
            return time.monotonic() - t0
        await asyncio.sleep(2)
    return None


async def run() -> bool:
    ok = True
    log = open(BRIDGE.parent / "sim" / "run-test" / "bridge-idle.log", "w")
    bridge = subprocess.Popen([str(BRIDGE / ".venv" / "Scripts" / "python.exe"), "-u", str(BRIDGE / "ws_server.py")], cwd=BRIDGE, stdout=log, stderr=subprocess.STDOUT)
    pids = []
    try:
        await asyncio.sleep(2)
        print("1. on the ground, every browser gone", flush=True)
        pid, st = await session(airborne=False)
        pids.append(pid)
        gone = await watch(pid, LIMIT)
        ok &= gone is not None and not st.get("armed")
        print(f"  simulator {pid} stopped {gone:.0f} s after the last browser left (need within {LIMIT} s)" if gone is not None else f"  FAIL simulator {pid} still running after {LIMIT} s", flush=True)

        print("2. airborne, every browser gone", flush=True)
        pid, st = await session(airborne=True)
        pids.append(pid)
        up = st.get("armed") and st.get("altAgl", 0) >= 9.5
        gone = await watch(pid, LIMIT)
        async with connect("ws://127.0.0.1:8001") as ws:  # a browser comes back: what does it see?
            back = {}
            while "lat" not in back:
                back = json.loads(await asyncio.wait_for(ws.recv(), 10))
        ok &= bool(up) and gone is None and back.get("armed") and back.get("altAgl", 0) >= 5
        print(f"  {'PASS' if gone is None else 'FAIL'} simulator {pid} {'still running' if gone is None else f'stopped after {gone:.0f} s'} {LIMIT} s after the last browser left; "
              f"returning browser sees armed {back.get('armed')}, {back.get('altAgl', 0):.1f} m up (was {st.get('altAgl', 0):.1f} m)", flush=True)
    finally:
        bridge.kill()
        bridge.wait(10)
        for p in pids:
            if alive(p):
                subprocess.run(["taskkill", "/F", "/PID", str(p)], capture_output=True)
        sitl.stop_stale()
        log.close()
        print(f"  cleanup: test simulators left {sum(alive(p) for p in pids)}", flush=True)
    return ok


if __name__ == "__main__":
    good = asyncio.run(run())
    print("PASS" if good else "FAIL")
    sys.exit(0 if good else 1)
