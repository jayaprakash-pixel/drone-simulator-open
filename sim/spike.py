"""Phase 2a spike (P2A.1.2-P2A.1.4): talk to ArduCopter SITL over MAVLink.

Start SITL first (powershell -File sim\\start-sitl.ps1 -Wipe), or pass --start to launch it from here and time it.
    python sim/spike.py --heartbeat   P2A.1.2: a HEARTBEAT within 60 s
    python sim/spike.py               P2A.1.3: print position and attitude, arm, take off to 10 m, land
    python sim/spike.py --measure     P2A.1.4: start time, message rates, and whether the ground 300 m away is flat
Run with bridge\\.venv\\Scripts\\python (pymavlink). Exit code 0 only when every step passed.
"""
from __future__ import annotations

import os
os.environ["DW_SIM_PROFILE"] = "test"  # own run folder, PID file and UDP ports: the PM2 bridge is never touched (P2A.9.1)

import argparse
import json
import struct
import math
import sys
import time
from pathlib import Path

from pymavlink import mavutil

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
import sitl  # noqa: E402

HERE = Path(__file__).parent
M = mavutil.mavlink


def say(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


def connect(start: bool, home=None):
    t0 = time.time()
    proc = None
    if start:
        proc = sitl.start(*(home or (26.4897, 74.5511)))  # the spike's sample place (sim tooling, not the app)
    m = mavutil.mavlink_connection(f"udpin:127.0.0.1:{sitl.udp_ports()[0]}", source_system=255)
    hb = m.wait_heartbeat(timeout=60)
    if not hb:
        say(f"FAIL no HEARTBEAT within 60 s on udp 127.0.0.1:{sitl.udp_ports()[0]}")
        sitl.stop(proc)
        sys.exit(1)
    say(f"HEARTBEAT after {time.time() - t0:.1f} s: type {hb.type}, autopilot {hb.autopilot}, system {m.target_system}")
    return m, proc, time.time() - t0


def rates(m, hz=25):
    for msg in (M.MAVLINK_MSG_ID_GLOBAL_POSITION_INT, M.MAVLINK_MSG_ID_ATTITUDE, M.MAVLINK_MSG_ID_GPS_RAW_INT,
                M.MAVLINK_MSG_ID_SYS_STATUS, M.MAVLINK_MSG_ID_VFR_HUD):
        m.mav.command_long_send(m.target_system, m.target_component, M.MAV_CMD_SET_MESSAGE_INTERVAL, 0, msg, 1e6 / hz, 0, 0, 0, 0, 0)


def armed(m) -> bool:
    return bool(m.messages.get("HEARTBEAT") and m.messages["HEARTBEAT"].base_mode & M.MAV_MODE_FLAG_SAFETY_ARMED)


def pump(m, seconds, every=1.0, until=None):
    """Reads messages for up to `seconds`, printing position and attitude every `every` s; stops early when until() is true."""
    end, last = time.time() + seconds, 0.0
    while time.time() < end:
        msg = m.recv_match(blocking=True, timeout=0.2)
        if msg and msg.get_type() == "STATUSTEXT":
            say("  sitl:", msg.text)
        if msg and msg.get_type() == "TERRAIN_REQUEST" and GRID:
            answer_terrain(m, msg)
        if time.time() - last >= every and "GLOBAL_POSITION_INT" in m.messages and "ATTITUDE" in m.messages:
            p, a = m.messages["GLOBAL_POSITION_INT"], m.messages["ATTITUDE"]
            g = m.messages.get("GPS_RAW_INT")
            say(f"  lat {p.lat / 1e7:.6f} lon {p.lon / 1e7:.6f} alt msl {p.alt / 1000:.1f} m rel {p.relative_alt / 1000:.1f} m | "
                f"roll {a.roll * 57.2958:.1f} pitch {a.pitch * 57.2958:.1f} yaw {a.yaw * 57.2958:.1f} | gps fix {g.fix_type if g else '?'} | "
                f"{m.flightmode} {'ARMED' if armed(m) else 'disarmed'}")
            last = time.time()
        if until and until():
            return True
    return False


GRID = None  # loaded by --terrain: real heights from sim/terrain-grid.mjs
LATLON_TO_M = 0.011131884502145034  # metres per 1e-7 degree of latitude, as ArduPilot's Location code (P2A.1.6 note)


def ground(lat, lon) -> float:
    """MSL height from the grid, bilinear; outside the grid the edge value."""
    g = GRID
    r = min(max((lat - g["lat0"]) / g["dLat"], 0), g["rows"] - 1.001)
    c = min(max((lon - g["lon0"]) / g["dLon"], 0), g["cols"] - 1.001)
    r0, c0 = int(r), int(c)
    fr, fc = r - r0, c - c0
    h = g["msl"]
    return (h[r0][c0] * (1 - fr) * (1 - fc) + h[r0][c0 + 1] * (1 - fr) * fc + h[r0 + 1][c0] * fr * (1 - fc) + h[r0 + 1][c0 + 1] * fr * fc)


def offset(lat, lon, north, east):
    dlat = north / (LATLON_TO_M * 1e7)
    return lat + dlat, lon + east / (LATLON_TO_M * 1e7 * math.cos(math.radians(lat)))


ANSWERED = set()
REQS = {}


def answer_terrain(m, req):
    """TERRAIN_DATA for every tile in the request mask (mavlink.io/en/services/terrain.html): bit b is tile column b % 8
    (west to east) and row b // 8 (south to north) from the request's south-west corner; a tile is 4x4 points
    grid_spacing apart. The order of the 16 values inside a tile is not in the spec; TERRAIN_DATA_ORDER below is checked
    by TERRAIN_CHECK in --terrain."""
    lat, lon, sp = req.lat / 1e7, req.lon / 1e7, req.grid_spacing
    REQS.setdefault((req.lat, req.lon, sp), req)
    for bit in range(56):
        if not req.mask >> bit & 1:
            continue
        tn, te = bit // 8, bit % 8
        data = []
        for a in range(4):
            for b in range(4):
                i, j = (a, b) if TERRAIN_DATA_ORDER == "north-major" else (b, a)
                la, lo = offset(lat, lon, (tn * 4 + i) * sp, (te * 4 + j) * sp)
                data.append(int(round(ground(la, lo))))
        m.mav.terrain_data_send(req.lat, req.lon, sp, bit, data)
        ANSWERED.add((req.lat, req.lon, bit))


TERRAIN_DATA_ORDER = "north-major"


def ack(m, cmd, seconds=3):
    end = time.time() + seconds
    while time.time() < end:
        a = m.recv_match(type="COMMAND_ACK", blocking=True, timeout=0.5)
        if a and a.command == cmd:
            return a.result
    return None


def ready_and_armed(m) -> bool:
    rates(m)
    say("waiting for a 3D GPS fix")
    if not pump(m, 90, until=lambda: getattr(m.messages.get("GPS_RAW_INT"), "fix_type", 0) >= 3):
        say("FAIL no GPS fix 3 within 90 s")
        return False
    say(f"GPS fix {m.messages['GPS_RAW_INT'].fix_type} before arming")
    # fresh SITL parameters have no accelerometer calibration ("PreArm: 3D Accel calibration needed"); ArduPilot's copter.parm
    # is not downloaded, so run the simple calibration a user would (MAV_CMD_PREFLIGHT_CALIBRATION param5=4, mavlink.io)
    m.mav.command_long_send(m.target_system, m.target_component, M.MAV_CMD_PREFLIGHT_CALIBRATION, 0, 0, 0, 0, 0, 4, 0, 0)
    say(f"simple accelerometer calibration: ack {ack(m, M.MAV_CMD_PREFLIGHT_CALIBRATION, 10)}")
    m.set_mode("GUIDED")
    say("arming (SITL refuses until its pre-arm checks pass; retrying for up to 90 s)")
    end = time.time() + 90
    while not armed(m) and time.time() < end:
        m.mav.command_long_send(m.target_system, m.target_component, M.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0)
        r = ack(m, M.MAV_CMD_COMPONENT_ARM_DISARM)
        pump(m, 2, until=lambda: armed(m))
        if not armed(m):
            say(f"  arm refused (ack {r}), retrying")
    if not armed(m):
        say("FAIL not armed after 90 s")
    return armed(m)


def rel_alt(m) -> float:
    return m.messages["GLOBAL_POSITION_INT"].relative_alt / 1000 if "GLOBAL_POSITION_INT" in m.messages else 0.0


def takeoff(m, h) -> float:
    m.mav.command_long_send(m.target_system, m.target_component, M.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 0, h)
    say(f"take off to {h} m: ack {ack(m, M.MAV_CMD_NAV_TAKEOFF)}")
    top = [0.0]

    def climbed():
        top[0] = max(top[0], rel_alt(m))
        return top[0] >= h - 0.5

    pump(m, 40 + 2 * h, until=climbed)
    say(f"highest altitude during the climb: {top[0]:.1f} m")
    return top[0]


def goto(m, lat, lon, h) -> bool:
    """GUIDED flight to lat, lon at h metres above home (SET_POSITION_TARGET_GLOBAL_INT, position only)."""
    m.mav.set_position_target_global_int_send(0, m.target_system, m.target_component, M.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                                              0b110111111000, int(lat * 1e7), int(lon * 1e7), h, 0, 0, 0, 0, 0, 0, 0, 0)
    say(f"going to {lat:.6f}, {lon:.6f} at {h} m above home")

    def there():
        p = m.messages.get("GLOBAL_POSITION_INT")
        return bool(p) and metres(p.lat / 1e7, p.lon / 1e7, lat, lon) < 3

    p = m.messages["GLOBAL_POSITION_INT"]
    limit = 60 + metres(p.lat / 1e7, p.lon / 1e7, lat, lon) / 4 + abs(h - p.relative_alt / 1000) / 1.5  # about 10 m/s across, 2.5 m/s up
    return pump(m, limit, every=5, until=there)


def land(m, seconds=90) -> bool:
    m.set_mode("LAND")
    say("landing")
    landed = pump(m, seconds, every=5, until=lambda: not armed(m))  # ArduCopter disarms itself after touching down in LAND
    say("disarmed on the ground" if landed else f"FAIL still armed {seconds:.0f} s after LAND")
    return landed


def metres(la1, lo1, la2, lo2) -> float:
    r = math.pi / 180
    return 2 * 6371008.8 * math.asin(math.sqrt(math.sin((la2 - la1) * r / 2) ** 2 + math.cos(la1 * r) * math.cos(la2 * r) * math.sin((lo2 - lo1) * r / 2) ** 2))


def fly(m) -> bool:
    if not ready_and_armed(m):
        return False
    top = takeoff(m, 10)
    return land(m) and top >= 9


def measure(m, start_s):
    rates(m)
    say("counting messages for 10 s")
    counts, t0 = {}, time.time()
    while time.time() - t0 < 10:
        msg = m.recv_match(blocking=True, timeout=0.2)
        if msg:
            counts[msg.get_type()] = counts.get(msg.get_type(), 0) + 1
    gp, at = counts.get("GLOBAL_POSITION_INT", 0) / 10, counts.get("ATTITUDE", 0) / 10
    params = {}
    for name in ("SIM_TERRAIN", "TERRAIN_ENABLE"):
        m.mav.param_request_read_send(m.target_system, m.target_component, name.encode(), -1)
        p = m.recv_match(type="PARAM_VALUE", condition=f"PARAM_VALUE.param_id=='{name}'", blocking=True, timeout=3)
        params[name] = p.param_value if p else "no answer"
    say(f"start time (first HEARTBEAT): {start_s:.1f} s{'' if start_s else ' (not timed: pass --start)'}")
    say(f"GLOBAL_POSITION_INT {gp:.1f} Hz, ATTITUDE {at:.1f} Hz (target >= 20 each)")
    say(f"terrain parameters: {params}; TERRAIN_REQUEST messages from SITL in 10 s: {counts.get('TERRAIN_REQUEST', 0)} (nobody answers them here)")
    # terrain: land 300 m north of home and compare the ground altitude SITL reports there with the one at home
    ok = ready_and_armed(m)
    home = m.messages["GLOBAL_POSITION_INT"]
    ground_home = home.alt / 1000
    if ok and takeoff(m, 20) >= 19 and goto(m, home.lat / 1e7 + 300 / 111_195, home.lon / 1e7, 20) and land(m):
        pump(m, 3)
        ground_b = m.messages["GLOBAL_POSITION_INT"].alt / 1000
        tr = m.messages.get("TERRAIN_REPORT")
        say(f"ground altitude (MSL) after landing: home {ground_home:.1f} m, 300 m north {ground_b:.1f} m, difference {ground_b - ground_home:+.1f} m"
            f"; TERRAIN_REPORT {'none' if not tr else f'terrain_height {tr.terrain_height:.1f} m, pending {tr.pending}, loaded {tr.loaded}'}")
        say("SITL ground here: " + ("FLAT (same height 300 m away)" if abs(ground_b - ground_home) < 1 else "NOT FLAT (height changes)"))
    else:
        ok = False
        say("FAIL terrain flight did not complete")
    return ok and gp >= 20 and at >= 20


def terrain_check(m, lat, lon):
    """SITL's own terrain height at a point (TERRAIN_CHECK -> TERRAIN_REPORT), or None."""
    m.mav.terrain_check_send(int(lat * 1e7), int(lon * 1e7))
    end = time.time() + 5
    while time.time() < end:
        r = m.recv_match(blocking=True, timeout=0.5)
        if r and r.get_type() == "TERRAIN_REQUEST":
            answer_terrain(m, r)
        if r and r.get_type() == "TERRAIN_REPORT" and abs(r.lat - int(lat * 1e7)) < 2 and abs(r.lon - int(lon * 1e7)) < 2 and r.spacing:
            return r.terrain_height
    return None


def landed_ground(m) -> float:
    pump(m, 3)
    return m.messages["GLOBAL_POSITION_INT"].alt / 1000


def terrain_test(m, home, a, b) -> bool:
    """P2A.1.6: with SIM_TERRAIN=1 and real heights supplied, does SITL's ground follow them? Lands at a and b."""
    m.mav.request_data_stream_send(m.target_system, m.target_component, M.MAV_DATA_STREAM_EXTRA3, 2, 1)  # terrain messages
    say("supplying terrain: waiting until SITL has loaded what it asked for")
    loaded = pump(m, 120, every=10, until=lambda: bool(REQS) and getattr(m.messages.get("TERRAIN_REPORT"), "pending", 1) == 0
                  and getattr(m.messages.get("TERRAIN_REPORT"), "loaded", 0) > 0)
    tr = m.messages.get("TERRAIN_REPORT")
    say(f"terrain loaded: {loaded} (pending {getattr(tr, 'pending', '?')}, loaded {getattr(tr, 'loaded', '?')}, tiles answered {len(ANSWERED)})")
    # value order inside a tile: at exact lattice points SITL does not interpolate, so its height must equal ours there,
    # not the one at the transposed point
    rq = next(iter(REQS.values()))
    sw, sp, votes = (rq.lat / 1e7, rq.lon / 1e7), rq.grid_spacing, {"ours": 0, "transposed": 0, "neither": 0}
    for tn, te, i, j in ((1, 1, 0, 3), (1, 2, 3, 0), (2, 1, 1, 2), (2, 2, 2, 1), (3, 3, 0, 2)):
        la, lo = offset(*sw, (tn * 4 + i) * sp, (te * 4 + j) * sp)
        lt, lot = offset(*sw, (tn * 4 + j) * sp, (te * 4 + i) * sp)
        t = terrain_check(m, la, lo)
        mine, other = round(ground(la, lo)), round(ground(lt, lot))
        v = "neither" if t is None else "ours" if abs(t - mine) <= 1 else "transposed" if abs(t - other) <= 1 else "neither"
        votes[v] += 1
        say(f"  lattice point tile ({tn},{te}) point ({i},{j}): SITL {t if t is None else round(t, 1)}, ours {mine}, transposed {other} -> {v}")
    say(f"tile value order {TERRAIN_DATA_ORDER}: {votes}")
    rows, ok = [], loaded and votes["ours"] >= 4
    for name, (la, lo) in (("home", home), ("A", a), ("B", b)):
        t = None
        for _ in range(6):  # a point outside the loaded area triggers new requests; give them time
            t = terrain_check(m, la, lo)
            if t is not None:
                break
            pump(m, 3)
        rows.append((name, la, lo, ground(la, lo), t))
        say(f"TERRAIN_CHECK {name} {la:.5f},{lo:.5f}: SITL terrain {t if t is None else round(t, 1)} m, Cesium {ground(la, lo):.1f} m")
        ok &= t is not None  # a summit between 100 m lattice points reads low in SITL's interpolation, so no 5 m test here
    if not ready_and_armed(m):
        return False
    results = [("home", home, landed_ground(m))]
    top = max(ground(*a), ground(*b)) - ground(*home) + 60  # clear the highest point by 60 m on the way
    for name, (la, lo) in (("A", a), ("B", b)):
        if not armed(m) and not ready_and_armed(m):
            return False
        # LAND comes down at about 1.5 m/s here (measured 2026-10-09), so allow for the height above this point's ground
        if takeoff(m, 20) < 19 or not goto(m, la, lo, top) or not land(m, 60 + (top + ground(*home) - ground(la, lo)) / 1.2):
            say(f"FAIL flight to {name}")
            return False
        results.append((name, (la, lo), landed_ground(m)))
    say("| point | lat, lon | Cesium ground MSL (m) | SITL terrain (TERRAIN_CHECK) | SITL ground after landing, MSL (m) | landing - Cesium (m) |")
    checks = {name: t for name, _, _, _, t in rows}
    for name, (la, lo), g in results:
        say(f"| {name} | {la:.5f}, {lo:.5f} | {ground(la, lo):.1f} | {checks[name] if checks[name] is None else round(checks[name], 1)} | {g:.1f} | {g - ground(la, lo):+.1f} |")
    # verdict on the spread between the points: flat ground keeps every landing at one height; real terrain moves them
    # as much as Cesium's ground does (per-point offsets come from SITL's 100 m terrain grid and its home height)
    sitl_spread = max(g for *_, g in results) - min(g for *_, g in results)
    cesium_spread = max(ground(*p) for _, p, _ in results) - min(ground(*p) for _, p, _ in results)
    follows = abs(sitl_spread - cesium_spread) <= 0.15 * cesium_spread
    flat = sitl_spread < 10
    say(f"landing heights spread {sitl_spread:.1f} m in SITL, {cesium_spread:.1f} m in Cesium")
    say("SITL ground FOLLOWS the supplied real terrain" if follows else "SITL ground stays FLAT" if flat else "SITL ground changes but does not track the supplied terrain")
    return ok and follows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", action="store_true", help="launch SITL (bridge/sitl.py, fresh parameters) and time its start")
    ap.add_argument("--heartbeat", action="store_true")
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--record", metavar="TLOG", help="save every message SITL sends to a .tlog (pymavlink log format)")
    ap.add_argument("--terrain", metavar="GRID", help="P2A.1.6: supply real heights from a sim/terrain-grid.mjs file and land on two points")
    a = ap.parse_args()
    if a.terrain:
        global GRID
        GRID = json.loads(Path(a.terrain).read_text())
        home = tuple(GRID["centre"])
        near = [(GRID["lat0"] + r * GRID["dLat"], GRID["lon0"] + c * GRID["dLon"]) for r in range(GRID["rows"]) for c in range(GRID["cols"])]
        near = [p for p in near if metres(*home, *p) <= 2000]
        pa, pb = min(near, key=lambda p: ground(*p)), max(near, key=lambda p: ground(*p))
        say(f"grid {GRID['rows']}x{GRID['cols']}; home ground {ground(*home):.1f} m; within 2 km: A lowest {ground(*pa):.1f} m, B highest {ground(*pb):.1f} m, {ground(*pb) - ground(*pa):.0f} m apart")
        m, proc, start_s = connect(True, home=(home[0], home[1], ground(*home)))
    else:
        m, proc, start_s = connect(a.start)
    if a.record:
        # pymavlink's UDP link skips its own logfile (mavudp.recv_msg), so write the same .tlog format (8-byte microsecond
        # timestamp + message, as mavfile.recv_msg does) from post_message, which sees every message
        log, post = open(a.record, "wb"), m.post_message

        def logged(msg):
            if msg.get_type() != "BAD_DATA":
                log.write(struct.pack(">Q", int(time.time() * 1e6) & ~3) + msg.get_msgbuf())
            post(msg)

        m.post_message = logged
    try:
        ok = (terrain_test(m, home, pa, pb) if a.terrain else True if a.heartbeat
              else measure(m, start_s if a.start else 0) if a.measure else fly(m))
    finally:
        sitl.stop(proc)
    say("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
