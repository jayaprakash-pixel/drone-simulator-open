"""Live-test harness: SITL + the bridge + one WebSocket client that behaves like a browser (sticks at 25 per second,
commands with answers, the latest DroneState). Used by square.py and the live checks. Needs sim/sitl-win."""
from __future__ import annotations

import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)

import asyncio
import itertools
import json
import math
import subprocess
import sys
import time
from pathlib import Path

from websockets.asyncio.client import connect

BRIDGE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BRIDGE))
import sitl  # noqa: E402

LOG = BRIDGE.parent / "sim" / "run-test" / "bridge.log"
TEST_HOME = (26.4897, 74.5511)  # tests only: where the live checks start SITL (a sample place; the app takes any)


def metres(la1, lo1, la2, lo2) -> float:
    r = math.pi / 180
    return 2 * 6371008.8 * math.asin(math.sqrt(math.sin((la2 - la1) * r / 2) ** 2 + math.cos(la1 * r) * math.cos(la2 * r) * math.sin((lo2 - lo1) * r / 2) ** 2))


def north_east(la1, lo1, la2, lo2) -> tuple[float, float]:
    """Metres north and east from point 1 to point 2 (flat-earth, fine for a few hundred metres)."""
    return (la2 - la1) * 111_195, (lo2 - lo1) * 111_195 * math.cos(math.radians(la1))


class Session:
    """async with Session() as s: ... ; s.state, s.sticks (dict sent at 25/s), await s.cmd(...), s.path (all states)."""

    def __init__(self, home=None):
        self.home = home  # (lat, lon, altMsl, heading) for SITL, default bridge/sitl.py's
        self.state: dict = {}
        self.path: list[dict] = []
        self.sticks = {"throttle": 0.0, "yaw": 0.0, "pitch": 0.0, "roll": 0.0}
        self.acks: dict = {}
        self.ids = itertools.count(1)

    async def __aenter__(self):
        self.sim = sitl.start(*(self.home or TEST_HOME))
        self.log = open(LOG, "w")
        self.bridge = subprocess.Popen([str(BRIDGE / ".venv" / "Scripts" / "python.exe"), str(BRIDGE / "ws_server.py")], cwd=BRIDGE,
                                       stdout=self.log, stderr=subprocess.STDOUT)
        await asyncio.sleep(2)
        self.ws = await connect("ws://127.0.0.1:8001")
        self.tasks = [asyncio.create_task(self._receive()), asyncio.create_task(self._send_sticks())]
        return self

    async def __aexit__(self, *exc):
        for t in self.tasks:
            t.cancel()
        await self.ws.close()
        self.bridge.kill()
        self.bridge.wait(10)
        sitl.stop(self.sim)

    async def _receive(self):
        async for raw in self.ws:
            d = json.loads(raw)
            if d.get("type") == "ack":
                self.acks[d["id"]] = d
            else:
                self.state = d
                self.path.append(d)

    async def _send_sticks(self):
        while True:
            await self.ws.send(json.dumps(self.sticks))
            await asyncio.sleep(0.04)

    async def cmd(self, command, quiet=False, **kw) -> dict:
        i = next(self.ids)
        await self.ws.send(json.dumps({"type": "command", "id": i, "command": command, **kw}))
        end = time.monotonic() + 15
        while i not in self.acks and time.monotonic() < end:
            await asyncio.sleep(0.05)
        a = self.acks.get(i, {"ok": False, "reason": "no ack from the bridge within 15 s"})
        if not quiet:
            print(f"  {command} {kw or ''}: {'ok' if a['ok'] else 'refused: ' + a['reason']}", flush=True)
        return a

    async def until(self, check, seconds) -> bool:
        end = time.monotonic() + seconds
        while time.monotonic() < end and not check():
            await asyncio.sleep(0.1)
        return check()

    async def take_off(self, alt=10) -> bool:
        """Arm and take off, retrying while the autopilot is not ready (each refusal printed); throttle down until airborne
        (ArduCopter will not arm with the throttle up), then centred."""
        self.sticks["throttle"] = 0.0
        await self.until(lambda: self.state.get("gpsFix", 0) >= 3, 60)
        end = time.monotonic() + 120
        while time.monotonic() < end:
            if (await self.cmd("arm", quiet=True))["ok"] and (await self.cmd("takeoff", quiet=True, alt=alt))["ok"]:
                break
            await asyncio.sleep(3)
        else:
            return False
        up = await self.until(lambda: self.state.get("altAgl", 0) >= alt - 0.5, 40)
        self.sticks["throttle"] = 0.5
        print(f"  airborne at {self.state.get('altAgl', 0):.1f} m: {up}", flush=True)
        return up
