"""Commands from the browser (P2A.2.4): arm, disarm, take off, land and mode changes, each answered with ok or a plain
reason. ArduCopter answers a COMMAND_LONG with COMMAND_ACK and explains a refusal in STATUSTEXT ("PreArm: ...");
a mode change counts only when the next HEARTBEAT shows the new mode.
"""
from __future__ import annotations

import asyncio
import time

from pymavlink import mavutil

from contract import WHITELIST, Command
from mavlink_link import Link

M = mavutil.mavlink
MODE_NAMES = {"stabilize": "STABILIZE", "altHold": "ALT_HOLD", "loiter": "LOITER", "rtl": "RTL", "land": "LAND", "guided": "GUIDED", "auto": "AUTO"}
MODE_NUMBERS = {name: num for num, name in mavutil.mode_mapping_acm.items()}  # ArduCopter: STABILIZE 0, GUIDED 4, LOITER 5 ...
RESULTS = {M.MAV_RESULT_TEMPORARILY_REJECTED: "temporarily rejected", M.MAV_RESULT_DENIED: "denied",
           M.MAV_RESULT_UNSUPPORTED: "not supported", M.MAV_RESULT_FAILED: "failed"}
TICK = 0.04  # the bridge reads MAVLink every 1/25 s; commands look at what it has read


async def wait_for(check, seconds: float) -> bool:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if check():
            return True
        await asyncio.sleep(TICK)
    return check()


async def send(link: Link, cmd: int, *params: float, seconds: float = 3) -> tuple[bool, str]:
    """COMMAND_LONG and its COMMAND_ACK. A refusal carries the autopilot's own words when it gave any."""
    t0 = link.command(cmd, *params)
    if not await wait_for(lambda: link.acks.get(cmd, (0, 0.0))[1] >= t0, seconds):
        return False, f"no answer from the autopilot within {seconds:.0f} s"
    result = link.acks[cmd][0]
    if result == M.MAV_RESULT_ACCEPTED:
        return True, ""
    await asyncio.sleep(0.2)  # the STATUSTEXT explaining a refusal can follow the ack
    words = [text for t, sev, text in link.texts if t >= t0 and sev <= M.MAV_SEVERITY_WARNING]
    return False, words[-1] if words else "refused by the autopilot (" + RESULTS.get(result, f"result {result}") + ")"


# wind presets (P3.2.1; decisions.md): speed m/s, direction it blows FROM (degrees), turbulence m/s
WIND = {"calm": (0, 0, 0), "breeze": (3, 270, 0), "strong": (8, 270, 0), "gusty": (5, 270, 4)}


# GPS presets (P3.2.2). Names and units from ardupilot.org/copter/docs/parameters.html (read 2026-10-09), checked against
# this SITL build by sim/conditions-probe.py the same day: SIM_GPS1_HNSE (horizontal noise) is NOT in this build, so the
# horizontal error of "weak" is a fixed offset (SIM_GPS1_GLTCH_X, degrees: 0.00002 = 2.2 m north, measured against
# SITL's true position); SIM_GPS1_ACC raises only the accuracy the GPS reports (h_acc 0.3 m -> 5 m); SIM_GPS1_NOISE is
# vertical noise in metres. "good" restores this build's defaults (read the same day).
GPS = {
    "good": {"SIM_GPS1_ENABLE": 1, "SIM_GPS1_NUMSATS": 10, "SIM_GPS1_ACC": 0.3, "SIM_GPS1_NOISE": 0, "SIM_GPS1_GLTCH_X": 0},
    "weak": {"SIM_GPS1_ENABLE": 1, "SIM_GPS1_NUMSATS": 5, "SIM_GPS1_ACC": 5, "SIM_GPS1_NOISE": 3, "SIM_GPS1_GLTCH_X": 0.00002},
    "dropout": {"SIM_GPS1_ENABLE": 0},
}

# Battery (P3.2.3). ArduPilot counts the charge used (BATT_MONITOR 4) against BATT_CAPACITY; MAV_CMD_BATTERY_RESET
# (42651, MAVLink: "Battery percentage remaining to set") sets the start charge. The drain rate is made by choosing the
# capacity for the current a hover draws, measured in this SITL: 28.1 A (sim/conditions-probe.py, 2026-10-09), so the
# rate holds at hover and is faster when climbing, slower when descending. Low at 25 % (the instruments' warning) returns
# home (BATT_FS_LOW_ACT 2 RTL), critical at 10 % lands (BATT_FS_CRT_ACT 1 Land): the autopilot's own failsafes.
HOVER_A = 28.1
BATT_LOW_PCT, BATT_CRIT_PCT = 25, 10


def battery_params(drain_pct_per_min: float) -> dict[str, float]:
    cap = round(HOVER_A * 1000 / 60 / (drain_pct_per_min / 100))  # mAh: hover draws drain% of it each minute
    return {"BATT_CAPACITY": cap, "BATT_LOW_MAH": round(cap * BATT_LOW_PCT / 100), "BATT_CRT_MAH": round(cap * BATT_CRIT_PCT / 100),
            "BATT_FS_LOW_ACT": 2, "BATT_FS_CRT_ACT": 1}


# Mission upload (P3.3.3), MAVLink mission protocol (mavlink.io/en/services/mission.html): MISSION_COUNT, then the
# autopilot asks for each item (MISSION_REQUEST_INT) and ends with MISSION_ACK. Items: 0 home (ArduPilot replaces it
# with the real home), 1 take off to the first height, then per point a speed change (DO_CHANGE_SPEED, ground speed)
# and the waypoint (heights above home, MAV_FRAME_GLOBAL_RELATIVE_ALT_INT), last return to launch.
REL = M.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT


def mission_items(wps: list[dict]) -> tuple[list[tuple], dict[int, int]]:
    """(frame, command, p1, p2, p3, p4, lat, lon, alt) per item, and item -> waypoint number shown (1-based; the
    return home shows as the last waypoint)."""
    items = [(REL, M.MAV_CMD_NAV_WAYPOINT, 0, 0, 0, 0, 0, 0, 0), (REL, M.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, wps[0]["alt"])]
    shown = {0: 1, 1: 1}
    for n, w in enumerate(wps, 1):
        shown[len(items)] = n
        items.append((M.MAV_FRAME_MISSION, M.MAV_CMD_DO_CHANGE_SPEED, 1, w["speed"], -1, 0, 0, 0, 0))
        shown[len(items)] = n
        items.append((REL, M.MAV_CMD_NAV_WAYPOINT, 0, 0, 0, 0, w["lat"], w["lon"], w["alt"]))
    shown[len(items)] = len(wps)
    items.append((REL, M.MAV_CMD_NAV_RETURN_TO_LAUNCH, 0, 0, 0, 0, 0, 0, 0))
    return items, shown


async def upload_mission(link: Link, wps: list[dict], seconds: float = 3) -> tuple[bool, str]:
    items, shown = mission_items(wps)
    t0 = time.monotonic()
    link.conn.mav.mission_count_send(link.conn.target_system, link.conn.target_component, len(items), M.MAV_MISSION_TYPE_MISSION)
    seen = t0
    while True:
        if not await wait_for(lambda: any(t > seen for t, _ in link.mission_rx), seconds):
            return False, f"the autopilot stopped asking for mission items (no request within {seconds:.0f} s)"
        seen, msg = next((t, m) for t, m in link.mission_rx if t > seen)
        if msg.get_type() == "MISSION_ACK":
            if msg.type != M.MAV_MISSION_ACCEPTED:
                return False, f"the autopilot refused the mission ({M.enums['MAV_MISSION_RESULT'][msg.type].name})"
            link.mission_wp, link.mission_count, link.mission_seq = shown, len(wps), -1
            return True, ""
        f, cmd, p1, p2, p3, p4, lat, lon, alt = items[msg.seq]
        link.conn.mav.mission_item_int_send(link.conn.target_system, link.conn.target_component, msg.seq, f, cmd, 0, 1, p1, p2, p3, p4,
                                            int(round(lat * 1e7)), int(round(lon * 1e7)), alt, M.MAV_MISSION_TYPE_MISSION)


# Geofence (P3.3.4), parameters from ardupilot.org (read 2026-10-09): FENCE_TYPE bitmask bit 0 max altitude, bit 1
# circle centred on home; FENCE_ACTION 1 "RTL or Land", 2 "Always Land".
def fence_params(alt_max: float, radius: float, breach: str) -> dict[str, float]:
    return {"FENCE_TYPE": 3, "FENCE_ALT_MAX": alt_max, "FENCE_RADIUS": radius, "FENCE_ACTION": 1 if breach == "rtl" else 2, "FENCE_ENABLE": 1}


async def _ask_all(link: Link, names: list[str], send, seconds: float) -> list[str]:
    """Sends for every name at once and waits for all the PARAM_VALUE answers together; the missing ones are sent again
    in up to 4 short rounds (a simulator still starting up answers slowly: one by one, 30 names overran the page's
    30 s, 2026-10-09).
    Returns the names never answered."""
    missing = list(names)
    for attempt in range(4):  # a burst of 30 loses a few answers: short rounds, the missing ones again
        t0 = time.monotonic()
        for name in missing:
            send(name)
        await wait_for(lambda: all(link.params.get(n, (None, 0.0))[1] >= t0 for n in missing), seconds)
        missing = [n for n in missing if link.params.get(n, (None, 0.0))[1] < t0]
        if not missing:
            break
    return missing


async def get_params(link: Link, names: list[str], seconds: float = 2) -> tuple[bool, str, dict[str, float]]:
    """PARAM_REQUEST_READ for every name; the values as the autopilot holds them."""
    rd = lambda n: link.conn.mav.param_request_read_send(link.conn.target_system, link.conn.target_component, n.encode(), -1)
    missing = await _ask_all(link, names, rd, seconds)
    if missing:
        return False, f"the autopilot did not answer for {', '.join(missing)} (not in this ArduPilot build, or still starting?)", {}
    return True, "", {n: round(float(link.params[n][0]), 6) for n in names}


async def set_params(link: Link, values: dict[str, float], seconds: float = 2) -> tuple[bool, str]:
    """PARAM_SET every value; each counts only when the autopilot's PARAM_VALUE echoes it back equal."""
    st = lambda n: link.conn.mav.param_set_send(link.conn.target_system, link.conn.target_component, n.encode(), float(values[n]), M.MAV_PARAM_TYPE_REAL32)
    missing = await _ask_all(link, list(values), st, seconds)
    if missing:
        return False, f"the autopilot did not confirm {', '.join(missing)} (no such parameter in this ArduPilot build?)"
    wrong = [f"{n} read back {link.params[n][0]}, not {v}" for n, v in values.items() if abs(link.params[n][0] - v) > 1e-3]
    return (False, "; ".join(wrong)) if wrong else (True, "")


async def set_mode(link: Link, name: str) -> tuple[bool, str]:
    target = MODE_NAMES[name]
    ok, why = await send(link, M.MAV_CMD_DO_SET_MODE, M.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, MODE_NUMBERS[target])
    if not ok:
        return False, why
    if not await wait_for(lambda: link.mode() == target, 3):  # the next HEARTBEAT (1 per second) confirms it
        return False, f"the autopilot accepted {target} but still reports {link.mode()}"
    return True, ""


async def execute(link: Link, c: Command) -> tuple[bool, str]:
    if not link.fresh():
        return False, "the simulator is not connected"
    if c.command in ("arm", "disarm"):
        want = c.command == "arm"
        if link.armed() == want:
            return True, ""
        ok, why = await send(link, M.MAV_CMD_COMPONENT_ARM_DISARM, 1 if want else 0)
        if ok and not await wait_for(lambda: link.armed() == want, 3):
            return False, "the autopilot accepted but still reports " + ("disarmed" if want else "armed")
        return ok, why
    if c.command == "takeoff":
        if not link.armed():
            return False, "arm first"
        ok, why = await set_mode(link, "guided")  # ArduCopter takes off by command in Guided mode
        return (await send(link, M.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, c.alt)) if ok else (False, why)
    if c.command == "land":
        return await set_mode(link, "land")
    if c.command == "wind":
        spd, direction, turb = WIND[c.preset]
        return await set_params(link, {"SIM_WIND_SPD": spd, "SIM_WIND_DIR": direction, "SIM_WIND_TURB": turb})
    if c.command == "gps":
        return await set_params(link, GPS[c.quality])
    if c.command == "battery":
        ok, why = await set_params(link, battery_params(c.drainPctPerMin))
        return (await send(link, M.MAV_CMD_BATTERY_RESET, 1, c.startPct)) if ok else (False, why)
    if c.command == "mission":
        return await upload_mission(link, c.waypoints)
    if c.command == "params":  # P3.4: only whitelisted names reach here (contract.py checks them and their ranges)
        return await set_params(link, c.values) if c.values else await get_params(link, list(WHITELIST))
    if c.command == "fence":
        return await set_params(link, fence_params(c.altMax, c.radius, c.breach))
    return await set_mode(link, c.mode)
