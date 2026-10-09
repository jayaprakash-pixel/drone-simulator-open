"""P2A.6.3 live check (needs sim/sitl-win): python bridge/tests/live_linkloss.py

Take off, AltHold, push forward, then kill the browser's WebSocket abruptly. Within 3 s the bridge must have stopped the
RC override (SITL's own RC_CHANNELS fall back from the pushed value) and SITL's HEARTBEAT must show LOITER or RTL. A new
browser that connects and pushes the sticks must not move the drone until it sends a mode command.
SITL's view is read on its second MAVLink port (UDP 14561), independent of the bridge.
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)
import asyncio
import json
import sys
import time
from pathlib import Path

from pymavlink import mavutil
from websockets.asyncio.client import connect

sys.path.insert(0, str(Path(__file__).parent))
from harness import Session  # noqa: E402

M = mavutil.mavlink


def side_view(side, seconds):
    """Latest HEARTBEAT mode and RC channel 2 (pitch) from SITL's own port over `seconds`."""
    mode, ch2, end = None, None, time.monotonic() + seconds
    while time.monotonic() < end:
        m = side.recv_match(blocking=True, timeout=0.1)
        if m and m.get_type() == "HEARTBEAT" and m.autopilot != M.MAV_AUTOPILOT_INVALID:
            mode = mavutil.mode_string_v10(m)
        if m and m.get_type() == "RC_CHANNELS":
            ch2 = m.chan2_raw
    return mode, ch2


def min_alt(side, seconds):
    side.mav.command_long_send(side.target_system, side.target_component, M.MAV_CMD_SET_MESSAGE_INTERVAL, 0, M.MAVLINK_MSG_ID_GLOBAL_POSITION_INT, 200_000, 0, 0, 0, 0, 0)
    low, end = float("inf"), time.monotonic() + seconds
    while time.monotonic() < end:
        m = side.recv_match(type="GLOBAL_POSITION_INT", blocking=True, timeout=0.2)
        if m:
            low = min(low, m.relative_alt / 1000)
    return low


async def run() -> bool:
    ok = True
    async with Session() as s:
        side = mavutil.mavlink_connection(f"udpin:127.0.0.1:{sitl.udp_ports()[1]}", source_system=253)
        side.wait_heartbeat(timeout=30)
        side.mav.command_long_send(side.target_system, side.target_component, M.MAV_CMD_SET_MESSAGE_INTERVAL, 0, M.MAVLINK_MSG_ID_RC_CHANNELS, 100_000, 0, 0, 0, 0, 0)
        ok &= await s.take_off(20)
        ok &= (await s.cmd("mode", mode="altHold"))["ok"]
        s.sticks["pitch"] = -0.3  # forward
        await asyncio.sleep(2)
        mode, ch2 = await asyncio.to_thread(side_view, side, 1.5)
        print(f"  before: SITL mode {mode}, RC ch2 {ch2} (pitch pushed)")
        for t in s.tasks:
            t.cancel()
        s.ws.transport.abort()  # abrupt: no close handshake, like a crashed tab
        t0 = time.monotonic()
        alt0 = s.state["altAgl"]
        mode, ch2 = await asyncio.to_thread(side_view, side, 3.0)
        print(f"  3 s after the drop: SITL mode {mode}, RC ch2 {ch2}")
        ok &= mode in ("LOITER", "RTL") and ch2 != 1350
        # and it must not sink: with the override gone SITL's own radio throttle is at minimum (seen: Loiter fell 20 m)
        low = await asyncio.to_thread(lambda: min_alt(side, 6.0))
        print(f"  lowest height over the next 6 s: {low:.1f} m (was {alt0:.1f} m at the drop)")
        ok &= low > alt0 - 2
        # a new browser pushing the sticks must not move the drone until it chooses a mode
        ws = await connect("ws://127.0.0.1:8001")
        before = dict(s.state) if s.state else None
        for _ in range(75):  # 3 s of forward stick
            await ws.send(json.dumps({"throttle": 0.5, "yaw": 0, "pitch": -0.5, "roll": 0}))
            await asyncio.sleep(0.04)
        mode2, ch2b = await asyncio.to_thread(side_view, side, 1.0)
        print(f"  reconnected and pushing forward 3 s: SITL mode {mode2}, RC ch2 {ch2b} (1250 would mean the sticks resumed)")
        ok &= ch2b != 1250 and mode2 in ("LOITER", "RTL")
        print(f"  (the drone is on its way home; a mode command now takes it back)")
        await ws.send(json.dumps({"type": "command", "id": 900, "command": "mode", "mode": "loiter"}))
        for _ in range(50):
            await ws.send(json.dumps({"throttle": 0.5, "yaw": 0, "pitch": -0.5, "roll": 0}))
            await asyncio.sleep(0.04)
        mode3, ch2c = await asyncio.to_thread(side_view, side, 1.0)
        print(f"  after a mode command: SITL mode {mode3}, RC ch2 {ch2c} (sticks back)")
        ok &= ch2c == 1250
        await ws.send(json.dumps({"type": "command", "id": 901, "command": "land"}))
        await asyncio.sleep(1)
        await ws.close()
        print(f"  bridge log: {[l for l in Path(s.log.name).read_text().splitlines() if 'lost' in l or 'unlocked' in l]}")
        print(f"  drop to check: {time.monotonic() - t0:.1f} s total incl. reconnect test; first state {before is not None}")
    print("PASS" if ok else "FAIL")
    return bool(ok)


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(run()) else 1)
