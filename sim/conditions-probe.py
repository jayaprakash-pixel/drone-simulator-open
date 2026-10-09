"""P3.2 measurements before building the GPS and battery presets (test profile, never the PM2 simulator).

    bridge\\.venv\\Scripts\\python sim\\conditions-probe.py

Reads, on SITL's second MAVLink port (no bridge involved): (1) whether each parameter the presets would use exists in
this SITL build and its default; (2) the battery current, voltage and remaining % in a 20 s hover at 10 m;
(3) for each GPS setting tried, fix type, satellites, eph and the spread of the raw GPS position over 15 s on the ground.
Prints a JSON summary. Stops the simulator it started.
"""
import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)

import json
import math
import statistics
import sys
import time
from pathlib import Path

from pymavlink import mavutil

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
import sitl  # noqa: E402
from mavlink_link import Link  # noqa: E402

M = mavutil.mavlink
NAMES = ["SIM_GPS1_ENABLE", "SIM_GPS1_NUMSATS", "SIM_GPS1_HNSE", "SIM_GPS1_NOISE", "SIM_GPS1_JAM", "SIM_GPS1_FIXTYPE",
         "SIM_GPS_DISABLE", "SIM_GPS_NUMSATS", "SIM_BATT_CAP_AH", "SIM_BATT_VOLTAGE", "BATT_MONITOR", "BATT_CAPACITY",
         "BATT_LOW_MAH", "BATT_CRT_MAH", "BATT_LOW_VOLT", "BATT_CRT_VOLT", "BATT_FS_LOW_ACT", "BATT_FS_CRT_ACT",
         "BATT_LOW_TIMER", "FS_EKF_ACTION", "FS_EKF_THRESH", "AHRS_GPS_MINSATS"]


def main() -> None:
    out: dict = {"date": time.strftime("%Y-%m-%d %H:%M"), "params": {}, "hover": {}, "gps": {}}
    proc = sitl.start(26.4897, 74.5511)
    link = Link()  # the test profile's port; this script is the only listener
    try:
        t0 = time.monotonic()
        while time.monotonic() - t0 < 60 and not (link.poll(0.1) and link.state() and link.state().gpsFix >= 3):
            pass

        def read(name: str):
            link.conn.mav.param_request_read_send(1, 1, name.encode(), -1)
            end = time.monotonic() + 3
            while time.monotonic() < end:
                m = link.conn.recv_match(type="PARAM_VALUE", blocking=True, timeout=0.5)
                if m and m.param_id == name:
                    return round(m.param_value, 4)
                link.poll(0)
            return None  # no such parameter in this build

        def put(name: str, value: float):
            link.conn.mav.param_set_send(1, 1, name.encode(), value, M.MAV_PARAM_TYPE_REAL32)
            time.sleep(0.3)
            return read(name)

        for n in NAMES:
            out["params"][n] = read(n)

        def gps_window(seconds: float) -> dict:
            fixes, sats, ephs, pts, texts = [], [], [], [], []
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                m = link.conn.recv_match(blocking=True, timeout=0.2)
                if not m:
                    continue
                link.handle(m)
                if m.get_type() == "GPS_RAW_INT":
                    fixes.append(m.fix_type), sats.append(m.satellites_visible), ephs.append(m.eph)
                    if m.fix_type >= 2:
                        pts.append((m.lat / 1e7, m.lon / 1e7))
                elif m.get_type() == "STATUSTEXT":
                    texts.append(m.text)
            spread = None
            if len(pts) > 2:
                la0, lo0 = statistics.mean(p[0] for p in pts), statistics.mean(p[1] for p in pts)
                d = [math.hypot((p[0] - la0) * 111195, (p[1] - lo0) * 111195 * math.cos(math.radians(la0))) for p in pts]
                spread = round(max(d), 2)
            return {"fix": sorted(set(fixes)), "sats": sorted(set(sats)), "eph_cm": sorted(set(ephs))[:6], "pos_spread_m": spread,
                    "samples": len(fixes), "texts": sorted(set(texts))[:8]}

        # GPS on the ground: defaults first, then each candidate setting, back to defaults between
        link.request_rates()
        out["gps"]["default"] = gps_window(15)
        enable = "SIM_GPS1_ENABLE" if out["params"]["SIM_GPS1_ENABLE"] is not None else None
        nsat = "SIM_GPS1_NUMSATS" if out["params"]["SIM_GPS1_NUMSATS"] is not None else "SIM_GPS_NUMSATS"
        hnse = "SIM_GPS1_HNSE"
        d_sats, d_hnse = out["params"][nsat], out["params"].get(hnse)
        for label, sets in [("sats5_hnse3", {nsat: 5, hnse: 3}), ("sats4", {nsat: 4}), ("disabled", {enable: 0} if enable else {"SIM_GPS_DISABLE": 1})]:
            out["gps"][label] = {"set": {k: put(k, v) for k, v in sets.items()}, **gps_window(15)}
            put(nsat, d_sats)
            if d_hnse is not None:
                put(hnse, d_hnse)
            if enable:
                put(enable, 1)
            else:
                put("SIM_GPS_DISABLE", 0)
            gps_window(10)  # recover
        # hover current: calibrate, arm, take off to 10 m, 20 s of SYS_STATUS
        t0 = time.monotonic()
        while time.monotonic() - t0 < 120 and not link.armed():
            link.poll(0.1)
            if link.calibrated and time.monotonic() - t0 > 5:
                link.conn.mav.set_mode_send(1, M.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)  # GUIDED
                link.command(M.MAV_CMD_COMPONENT_ARM_DISARM, 1)
                time.sleep(2)
        link.command(M.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 10)
        t0 = time.monotonic()
        while time.monotonic() - t0 < 30 and not (link.state() and link.state().altAgl > 9.5):
            link.poll(0.1)
        cur, volt, rem = [], [], []
        end = time.monotonic() + 20
        while time.monotonic() < end:
            m = link.conn.recv_match(type="SYS_STATUS", blocking=True, timeout=0.5)
            if m:
                cur.append(m.current_battery / 100), volt.append(m.voltage_battery / 1000), rem.append(m.battery_remaining)
            link.poll(0)
        out["hover"] = {"armed": link.armed(), "alt": round(link.state().altAgl, 1) if link.state() else None,
                        "current_A_median": statistics.median(cur) if cur else None, "voltage_V_median": statistics.median(volt) if volt else None,
                        "remaining_pct_first_last": [rem[0], rem[-1]] if rem else None, "samples": len(cur)}
    finally:
        sitl.stop(proc)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
