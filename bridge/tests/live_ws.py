"""P2A.2.2 live check (needs sim/sitl-win): python bridge/tests/live_ws.py

Starts SITL and the bridge, counts DroneState messages for 10 s, kills SITL and starts it again, and measures how long
until the stream resumes, all without restarting the bridge. Every message must pass the contract. Exit code 0 on pass.
Stops every process it started.
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)
import asyncio
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
from contract import DroneState  # noqa: E402

PORT = 8001


async def run() -> bool:
    bad, ok = [], True
    sim = sitl.start(*TEST_HOME)
    blog = open(BRIDGE.parent / "sim" / "run-test" / "bridge.log", "w")
    bridge = subprocess.Popen([str(BRIDGE / ".venv" / "Scripts" / "python.exe"), str(BRIDGE / "ws_server.py"), "--port", str(PORT)], cwd=BRIDGE, stdout=blog, stderr=subprocess.STDOUT)
    try:
        await asyncio.sleep(2)
        async with connect(f"ws://127.0.0.1:{PORT}") as ws:

            async def count(seconds):
                n, end = 0, time.monotonic() + seconds
                while time.monotonic() < end:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=max(0.01, end - time.monotonic()))
                    except asyncio.TimeoutError:
                        break
                    try:
                        DroneState.from_dict(json.loads(raw))
                    except ValueError as e:
                        bad.append(str(e))
                    n += 1
                return n

            async def first_message(limit):
                t0 = time.monotonic()
                try:
                    await asyncio.wait_for(ws.recv(), timeout=limit)
                    return time.monotonic() - t0
                except asyncio.TimeoutError:
                    return None

            wait = await first_message(30)
            print(f"first DroneState after {wait if wait is None else round(wait, 1)} s more")
            n = await count(10)
            print(f"messages in 10 s: {n} (need >= 200)")
            ok &= n >= 200

            sitl.stop(sim)
            killed = time.monotonic()
            await asyncio.sleep(2)
            while True:  # drain what was sent before the kill
                try:
                    await asyncio.wait_for(ws.recv(), timeout=0.2)
                except asyncio.TimeoutError:
                    break
            quiet = await count(2)
            print(f"messages in 2 s with SITL stopped: {quiet} (stale states must not be sent)")
            ok &= quiet == 0
            sim = sitl.start(*TEST_HOME)
            restarted = time.monotonic()
            back = await first_message(30)
            print(f"stream resumed {back if back is None else round(back, 1)} s after SITL restarted "
                  f"({restarted - killed:.1f} s after the kill; need within 10 s of the restart)")
            ok &= back is not None and back <= 10
            n2 = await count(10)
            print(f"messages in 10 s after the restart: {n2}")
            ok &= n2 >= 200
        print(f"contract failures: {len(bad)}{' ' + bad[0] if bad else ''}")
        ok &= not bad
        print(f"bridge still the same process: {bridge.poll() is None}")
        ok &= bridge.poll() is None
    finally:
        bridge.kill()
        bridge.wait(10)
        sitl.stop(sim)
    print("PASS" if ok else "FAIL")
    return ok


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(run()) else 1)
