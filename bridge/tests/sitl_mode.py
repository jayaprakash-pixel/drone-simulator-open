"""Prints SITL's flight mode and armed state as SITL itself reports them on its second MAVLink port (UDP 14561 live, 14661 for checks), so a
test can watch the drone without going through the bridge.  python bridge/tests/sitl_mode.py [seconds]"""
import sys
import time

from pathlib import Path

from pymavlink import mavutil

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sitl  # noqa: E402  (its profile comes from the caller: DW_SIM_PROFILE=test for checks)

m = mavutil.mavlink_connection(f"udpin:127.0.0.1:{sitl.udp_ports()[1]}", source_system=252)
mode, armed, end = None, None, time.monotonic() + float(sys.argv[1] if len(sys.argv) > 1 else 3)
while time.monotonic() < end:
    h = m.recv_match(type="HEARTBEAT", blocking=True, timeout=0.5)
    if h and h.autopilot != mavutil.mavlink.MAV_AUTOPILOT_INVALID:
        mode, armed = mavutil.mode_string_v10(h), bool(h.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
print(f"{mode} {'armed' if armed else 'disarmed'}")
