"""P2A.2.3 live check (needs sim/sitl-win): python bridge/tests/live_rc.py

Starts SITL and the bridge, sends one ControlInput at 25 per second for 6 s over the WebSocket, then disconnects.
Checks the bridge's RC override rate (25 +/- 2 per second, from its log), that SITL's own RC_CHANNELS (read on its second
MAVLink port, UDP 14561) show the mapped values, and that nothing is sent once no browser is connected.
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)
import asyncio
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from pymavlink import mavutil
from websockets.asyncio.client import connect

BRIDGE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BRIDGE))
import sitl  # noqa: E402
from harness import TEST_HOME  # noqa: E402

LOG = BRIDGE.parent / "sim" / "run-test" / "bridge.log"
CI = {"throttle": 0.5, "yaw": 0.6, "pitch": -0.4, "roll": 0.2}
WANT = (1600, 1300, 1500, 1800)  # ch1 roll, ch2 pitch, ch3 throttle, ch4 yaw


def rates_in_log():
    return [int(n) for n in re.findall(r"rc override (\d+)/s", LOG.read_text())]


async def run() -> bool:
    ok = True
    sim = sitl.start(*TEST_HOME)
    log = open(LOG, "w")
    bridge = subprocess.Popen([str(BRIDGE / ".venv" / "Scripts" / "python.exe"), str(BRIDGE / "ws_server.py")], cwd=BRIDGE, stdout=log, stderr=subprocess.STDOUT)
    side = mavutil.mavlink_connection(f"udpin:127.0.0.1:{sitl.udp_ports()[1]}", source_system=254)  # SITL's SERIAL1, separate from the bridge
    try:
        side.wait_heartbeat(timeout=30)
        side.mav.command_long_send(side.target_system, side.target_component, mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL, 0,
                                   mavutil.mavlink.MAVLINK_MSG_ID_RC_CHANNELS, 200_000, 0, 0, 0, 0, 0)
        await asyncio.sleep(3)
        async with connect("ws://127.0.0.1:8001") as ws:
            end = time.monotonic() + 6
            while time.monotonic() < end:
                await ws.send(json.dumps(CI))
                await asyncio.sleep(0.04)
            rc = None
            while (m := side.recv_match(type="RC_CHANNELS", blocking=False)) is not None or rc is None:
                rc = m or side.recv_match(type="RC_CHANNELS", blocking=True, timeout=2)
                if rc is None:
                    break
            got = rc and (rc.chan1_raw, rc.chan2_raw, rc.chan3_raw, rc.chan4_raw)
            print(f"SITL RC_CHANNELS ch1-4 while connected: {got} (want {WANT})")
            ok &= got == WANT
        connected = rates_in_log()
        await asyncio.sleep(4)
        after = rates_in_log()[len(connected):]
        window = connected[1:6] if len(connected) >= 6 else connected  # whole seconds inside the 6 s of sending
        print(f"bridge rc override per second while connected: {connected}; 5 s used: {window}")
        ok &= len(window) == 5 and all(23 <= n <= 27 for n in window)
        print(f"after the browser left: {after} (one 'stopped' line is allowed, then nothing)")
        ok &= all(n == 0 for n in after[1:]) and (not after or after[-1] == 0)
    finally:
        bridge.kill()
        bridge.wait(10)
        sitl.stop(sim)
    print("PASS" if ok else "FAIL")
    return ok


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(run()) else 1)
