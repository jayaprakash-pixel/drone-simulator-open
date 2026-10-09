"""Watches the test simulator's second MAVLink port (no bridge involved) and writes one JSON line per GPS reading: wall
time, fix type, satellites, reported horizontal accuracy and the raw GPS position's distance from SITL's true position
(SIMSTATE), plus the flight mode, every STATUSTEXT and BATTERY_STATUS (mAh used, % left, amps). Used by the live condition checks (P3.2).

    python sim/gps-watch.py SECONDS OUT.jsonl
"""
import os
os.environ.setdefault("DW_SIM_PROFILE", "test")

import json
import math
import sys
import time
from pathlib import Path

from pymavlink import mavutil

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
import sitl  # noqa: E402

M = mavutil.mavlink


def main(seconds: float, out: str) -> None:
    m = mavutil.mavlink_connection(f"udpin:127.0.0.1:{sitl.udp_ports()[1]}", source_system=251)
    truth, mode, asked = None, None, False
    end = time.time() + seconds
    with open(out, "w") as f:
        while time.time() < end:
            msg = m.recv_match(blocking=True, timeout=0.5)
            if not msg:
                continue
            k = msg.get_type()
            if k == "HEARTBEAT" and msg.autopilot != M.MAV_AUTOPILOT_INVALID:
                mode = mavutil.mode_string_v10(msg)
                if not asked:  # rates are per channel: ask on this one
                    for mid in (M.MAVLINK_MSG_ID_GPS_RAW_INT, M.MAVLINK_MSG_ID_SIMSTATE, M.MAVLINK_MSG_ID_BATTERY_STATUS):
                        m.mav.command_long_send(1, 1, M.MAV_CMD_SET_MESSAGE_INTERVAL, 0, mid, 200_000, 0, 0, 0, 0, 0)
                    asked = True
            elif k == "SIMSTATE":
                truth = (msg.lat / 1e7, msg.lng / 1e7)
            elif k == "GPS_RAW_INT":
                err = None
                if truth and msg.fix_type >= 2:
                    la, lo = msg.lat / 1e7, msg.lon / 1e7
                    err = round(math.hypot((la - truth[0]) * 111195, (lo - truth[1]) * 111195 * math.cos(math.radians(la))), 2)
                f.write(json.dumps({"t": time.time(), "fix": msg.fix_type, "sats": msg.satellites_visible, "hacc_m": getattr(msg, "h_acc", 0) / 1000, "err_m": err, "mode": mode}) + "\n")
            elif k == "BATTERY_STATUS":  # charge used (mAh) and remaining, for the drain-rate check (P3.2.3)
                f.write(json.dumps({"t": time.time(), "mah": msg.current_consumed, "pct": msg.battery_remaining, "amps": msg.current_battery / 100, "mode": mode}) + "\n")
            elif k == "STATUSTEXT":
                f.write(json.dumps({"t": time.time(), "text": msg.text, "mode": mode}) + "\n")
            f.flush()


if __name__ == "__main__":
    main(float(sys.argv[1]), sys.argv[2])
