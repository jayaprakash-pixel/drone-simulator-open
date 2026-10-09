"""WebSocket link to the browser (P2A.2.2): pushes DroneState JSON at 25 per second to every connected browser.

    python bridge/ws_server.py [--port 8000] [--replay bridge/tests/fixtures/flight.tlog]

Listens on 127.0.0.1 only (port 8000). MAVLink comes in on UDP 14550 (mavlink_link.Link).
When the simulator goes quiet for 1 s (killed or restarting) no state is sent; when it is heard again the link asks for
its message rates again and the stream resumes, without restarting the bridge.
"""
from __future__ import annotations

import argparse
import os
import asyncio
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from pymavlink import mavutil
from websockets.asyncio.server import broadcast, serve

import sitl
from commands import execute, set_mode, wait_for
from contract import Command, CommandAck, ControlInput, Progress
from logger import FlightLog, session_path
from mavlink_link import Link

LOGS = Path(__file__).resolve().parents[1] / "data" / "logs"  # flight logs (P3.1), git-ignored

# checks (DW_SIM_PROFILE=test) use 8001 and their own simulator ports, so the PM2 bridge on 8000 stays up (P2A.9.1)
HOST, PORT = "127.0.0.1", int(os.environ.get("DW_BRIDGE_PORT") or (8001 if sitl.profile() == "test" else 8000))
RATE_HZ = 25
PROBE = os.environ.get("DW_PROBE") == "1"  # P2A.7.4 measurement: times each roll press inside the bridge (off by default)
IDLE_STOP_S = 120  # no browser for this long and on the ground: the simulator is stopped (it holds ~100 MB)


class Replay:
    """A recorded .tlog played back at its own pace, in a loop, in place of the UDP link (no simulator needed). Sends
    from the bridge (rate requests, RC override, commands) go nowhere."""

    def __init__(self, path: str):
        conn = mavutil.mavlink_connection(path)
        self.msgs = []
        while (m := conn.recv_match()) is not None:
            self.msgs.append(m)
        self.t_rec = [m._timestamp - self.msgs[0]._timestamp for m in self.msgs]
        self.i, self.t0 = 0, time.monotonic()
        self.mav = self  # command_long_send and friends land in __getattr__
        self.target_system, self.target_component = 1, 1

    def __getattr__(self, name):  # any *_send: dropped
        return lambda *a, **k: None

    def recv_match(self, blocking=False, timeout=None):
        if self.i == len(self.msgs):  # loop
            self.i, self.t0 = 0, time.monotonic()
        if time.monotonic() - self.t0 < self.t_rec[self.i]:
            return None
        self.i += 1
        return self.msgs[self.i - 1]


class Bridge:
    def __init__(self, link: Link):
        self.link = link
        self.clients: set = set()
        self.control: ControlInput | None = None  # latest stick input from a browser
        self.rc_sent = 0  # RC overrides sent since the last stats line
        self.rc_last = 0  # the count printed last (a line is printed while sending and once after it stops)
        self.sim = None  # the simulator this bridge started (Place drone here)
        # link-loss safety (P2A.6.3): after the last browser drops while armed, sticks stay locked until a mode command
        self.locked = False
        self.placing = asyncio.Lock()
        self.log: FlightLog | None = None  # the flight log of the current place (P3.1.1)
        self.last_seen = time.monotonic()  # when the last browser left
        self.probe: dict | None = None  # DW_PROBE: the roll press being timed
        self.text_seen = 0.0  # the newest STATUSTEXT already written to the flight log
        self.fence_seen = 0  # the breach status last written to the flight log

    async def handler(self, ws):
        self.clients.add(ws)
        try:
            async for raw in ws:
                try:
                    d = json.loads(raw)
                    if isinstance(d, dict) and d.get("type") == "event":
                        # events only the browser knows (a crash against real terrain): written to the flight log
                        if self.log and isinstance(d.get("kind"), str):
                            self.log.event(datetime.now(timezone.utc), d["kind"], **{k: v for k, v in d.items() if k not in ("type", "kind")})
                    elif isinstance(d, dict) and d.get("type") == "command":
                        asyncio.create_task(self.answer(ws, Command.from_dict(d)))
                    else:
                        self.control = ControlInput.from_dict(d)  # its optional mode and arm are not acted on: use commands
                        if PROBE and abs(self.control.roll) > 0 and not self.probe:  # a roll press starts (P2A.7.4 split)
                            self.probe = {"in": time.perf_counter(), "dir": 1 if self.control.roll > 0 else -1}
                        elif PROBE and self.control.roll == 0 and self.probe and "state" in self.probe:
                            self.probe = None  # sticks back to centre: ready for the next press
                except (ValueError, TypeError) as e:  # not JSON, not a ControlInput or a Command: ignored, never sent on
                    print(f"bridge: ignored a message from the browser: {e}", flush=True)
        finally:
            self.clients.discard(ws)
            self.last_seen = time.monotonic()

    async def place(self, ws, c: Command) -> tuple[bool, str]:
        """Place drone here: stop our simulator, start a new one with its home at the point, report each step, answer
        once the first state from the new place arrives."""
        async def say(text):
            print(f"bridge: place {c.id}: {text}", flush=True)
            try:
                await ws.send(json.dumps(Progress("progress", c.id, text).to_dict()))
            except Exception:
                pass

        async with self.placing:
            if self.sim:
                await say("Stopping the simulator")
                await asyncio.to_thread(sitl.stop, self.sim)
            self.link.reset()
            await say("Starting simulator")
            try:
                self.sim = await asyncio.to_thread(sitl.start, c.lat, c.lon, c.altMsl, c.heading)
            except FileNotFoundError as e:
                return False, str(e)
            await say("Simulator started, waiting for its GPS position")
            # until its GPS has a fix SITL reports lat 0, lon 0 (seen in the spike), so Ready waits for fix 3 or better
            if not await wait_for(lambda: (s := self.link.state()) is not None and s.gpsFix >= 3, 90):
                return False, "the simulator started but had no GPS position within 90 s"
            if self.log:
                self.log.close()
            self.log = FlightLog(session_path(LOGS))
            print(f"bridge: flight log {self.log.path}", flush=True)
            await say("Ready")
            return True, ""

    async def answer(self, ws, c: Command):
        ok, reason, *values = await (self.place(ws, c) if c.command == "place" else execute(self.link, c))  # params read: + values
        if ok and c.command == "mode" and self.locked:
            self.locked = False  # a deliberate mode choice hands the sticks back
            print("bridge: sticks unlocked by a mode command", flush=True)
        print(f"bridge: command {c.command} {c.mode or ''} -> {'ok' if ok else 'refused: ' + reason}", flush=True)
        try:
            await ws.send(json.dumps(CommandAck("ack", c.id, ok, reason, values[0] if values else None).to_dict()))
        except Exception:  # the browser left before the answer
            pass

    async def hold(self):
        # RTL, not Loiter: with the override released, SITL's own simulated radio holds the throttle at 1000, and Loiter
        # then descends to the ground (measured 2026-10-09: 19.6 m to 0 in about 10 s). RTL ignores the sticks.
        ok, why = await set_mode(self.link, "rtl")
        print(f"bridge: browser lost while flying: return home {'set' if ok else 'refused: ' + why}; sticks locked until a mode command", flush=True)

    async def stream(self):
        """Every 1/25 s: state out to the browsers; RC override in to the autopilot while a browser is connected and has
        sent a ControlInput. When the last browser leaves, the channels are released and nothing more is sent."""
        loop = asyncio.get_running_loop()
        next_t, stats_t = loop.time(), time.monotonic()
        while True:
            s = self.link.poll(0)
            if self.log and self.link.fence_breach != self.fence_seen:  # P3.3.4: the autopilot's FENCE_STATUS
                self.fence_seen = self.link.fence_breach
                self.log.event(datetime.now(timezone.utc), "fence breach" if self.fence_seen else "fence clear")
            if self.log:  # the autopilot's own words (battery low, failsafes, EKF) as log events (P3.2)
                for t, sev, text in self.link.texts:
                    if t > self.text_seen:
                        self.log.event(datetime.now(timezone.utc), "autopilot", text=text, severity=sev)
                        self.text_seen = t
            if PROBE and s and self.probe and "rc" in self.probe and "state" not in self.probe and (s.rollDeg - self.probe["roll0"]) * self.probe["dir"] > 0.5:
                self.probe["state"] = time.perf_counter()
                print(f"probe: input->rc {1000 * (self.probe['rc'] - self.probe['in']):.1f} ms, rc->state {1000 * (self.probe['state'] - self.probe['rc']):.1f} ms", flush=True)
            if self.log:
                self.log.sample(time.monotonic(), datetime.now(timezone.utc), s.to_dict() if s else None, self.control.to_dict() if self.control else None)
            if s and self.clients:
                broadcast(self.clients, json.dumps(s.to_dict()))
            if not self.link.armed():
                self.locked = False  # nothing to protect on the ground
            if self.clients and self.control and not self.locked:
                self.rc_sent += self.link.send_rc(self.control)
                if PROBE and self.probe and "rc" not in self.probe:
                    self.probe["rc"], self.probe["roll0"] = time.perf_counter(), s.rollDeg if s else 0.0
            elif self.control and not self.clients:
                # the browser is gone: let go of the sticks and hold position (P2A.6.3)
                self.link.release_rc()
                self.control = None
                if self.link.armed():
                    self.locked = True
                    if self.link.mode() not in ("RTL", "LAND"):
                        asyncio.create_task(self.hold())
            if self.sim and not self.clients and not self.placing.locked() and not self.link.armed() and time.monotonic() - self.last_seen > IDLE_STOP_S:
                sim, self.sim = self.sim, None
                print(f"bridge: no browser for {IDLE_STOP_S} s: simulator stopped (Place drone here starts it again)", flush=True)
                asyncio.create_task(asyncio.to_thread(sitl.stop, sim))
            if time.monotonic() - stats_t >= 1:
                # the ground-station heartbeat: when it stops (bridge killed) ArduPilot's GCS failsafe returns home
                # (FS_GCS_ENABLE 1, FS_GCS_TIMEOUT 2 s in sim/copter-min.parm; P2A.7.7)
                if self.link.fresh():
                    self.link.conn.mav.heartbeat_send(mavutil.mavlink.MAV_TYPE_GCS, mavutil.mavlink.MAV_AUTOPILOT_INVALID, 0, 0, 0)
                if self.rc_sent or self.rc_last:
                    print(f"bridge: rc override {self.rc_sent}/s, browsers {len(self.clients)}", flush=True)
                self.rc_last, self.rc_sent, stats_t = self.rc_sent, 0, time.monotonic()
            next_t += 1 / RATE_HZ
            await asyncio.sleep(max(0.0, next_t - loop.time()))


async def main(port: int, link: Link | None = None):
    bridge = Bridge(link or Link())
    async with serve(bridge.handler, HOST, port):
        print(f"bridge: ws://{HOST}:{port}, MAVLink from {'a recording' if link else f'udp 127.0.0.1:{sitl.udp_ports()[0]}'}", flush=True)
        try:
            await bridge.stream()
        finally:
            sitl.stop(bridge.sim)  # on Ctrl+C; a killed bridge cannot, and the next start clears it (sitl.stop_stale)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--replay", metavar="TLOG", help="play a recorded flight instead of listening to the simulator")
    a = ap.parse_args()
    asyncio.run(main(a.port, Link(conn=Replay(a.replay)) if a.replay else None))
