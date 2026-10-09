"""MAVLink in from the simulator, DroneState out (P2A.2.1).

Folds the autopilot's messages into the latest DroneState (contract.py). Sources and units:
  GLOBAL_POSITION_INT  lat, lon degE7 -> degrees; alt, relative_alt mm -> m; vx, vy, vz cm/s (NED, z down) -> m/s; hdg cdeg
  ATTITUDE             roll, pitch, yaw radians -> degrees (yaw is the heading when hdg is unknown, 65535)
  SYS_STATUS           battery_remaining percent (-1 = unknown)
  GPS_RAW_INT          fix_type (0 none ... 3 3D fix ... 6 RTK fixed)
  HEARTBEAT            flight mode name and the armed flag, from the autopilot only (not other ground stations)
altAgl is relative_alt, the height above home. SITL's ground is flat at the home height unless terrain is supplied
(P2A.1.4, P2A.1.6), so this is the simulator's own height above ground there; the browser checks real ground (P2A.6.2).
"""
from __future__ import annotations

import math
import time
from datetime import datetime, timezone

from pymavlink import mavutil

from contract import ControlInput, DroneState

M = mavutil.mavlink
NEEDED = ("GLOBAL_POSITION_INT", "ATTITUDE", "SYS_STATUS", "GPS_RAW_INT", "HEARTBEAT")
STALE_S = 1.0  # no MAVLink for this long: the simulator has gone (killed or restarting)


def to_pwm(ci: ControlInput) -> tuple[int, int, int, int]:
    """RC override channels (plan): ch1 roll, ch2 pitch, ch3 throttle, ch4 yaw. Sticks -1..1 -> 1000..2000 with 1500 at
    centre; throttle 0..1 -> 1000..2000. Which way each sign moves the drone is ArduPilot's; it is measured in P2A.2.5."""
    def stick(v: float) -> int:
        return round(1500 + 500 * v)

    return stick(ci.roll), stick(ci.pitch), round(1000 + 1000 * ci.throttle), stick(ci.yaw)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Link:
    def __init__(self, url: str | None = None, conn=None):
        """url: where the simulator sends (default UDP 14550 on loopback). conn: an open pymavlink connection instead
        (a .tlog replay in the tests)."""
        if url is None and conn is None:
            import sitl  # the profile's port: 14550 live, 14650 for checks (P2A.9.1)
            url = f"udpin:127.0.0.1:{sitl.udp_ports()[0]}"
        self.conn = conn or mavutil.mavlink_connection(url, source_system=255)
        self.last: dict = {}  # latest message of each NEEDED type
        self.battery: float | None = None  # last known percentage; SITL sends -1 for about 1.5 s after start
        self.asked = False  # message rates requested from the autopilot (live links only)
        self.calibrated, self.cal_sent = False, 0.0  # see calibrate()
        self.last_rx = 0.0  # time.monotonic() of the last message
        self.acks: dict[int, tuple[int, float]] = {}  # MAV_CMD -> (MAV_RESULT, time.monotonic()) of its latest COMMAND_ACK
        self.texts: list[tuple[float, int, str]] = []  # recent STATUSTEXT: (time.monotonic(), severity, text)
        self.params: dict[str, tuple[float, float]] = {}  # name -> (value, time.monotonic()) of its latest PARAM_VALUE
        self.mission_rx: list = []  # (time.monotonic(), MISSION_REQUEST_INT / MISSION_ACK) during an upload
        self.mission_seq = -1  # the autopilot's current mission item (MISSION_CURRENT)
        self.mission_wp: dict[int, int] = {}  # mission item -> waypoint number shown (commands.upload_mission)
        self.mission_count = 0  # waypoints in the uploaded mission; 0 = none
        self.fence_breach = 0  # FENCE_STATUS breach_status

    def reset(self) -> None:
        """Forgets the previous simulator (Place drone here starts a new one)."""
        # what the old simulator sent is still queued in the socket: read and drop it, or it passes for the new one
        # (a stale "Ready" and stale parameter answers after a second place, found 2026-10-09 by params-live.mjs)
        for _ in range(100_000):
            if self._recv(False) is None:
                break
        self.last.clear()
        self.battery = None
        self.mission_wp, self.mission_count, self.mission_seq = {}, 0, -1
        self.forget_calibration()
        self.last_rx = 0.0

    def forget_calibration(self) -> None:
        """A new simulator: rates and calibration must be asked again, and the old simulator's calibration answer must not
        count for the new one (it did: after a second Place drone here the bridge never calibrated and every arm was
        refused with "3D Accel calibration needed", found by live_idle.py 2026-10-09)."""
        self.asked = self.calibrated = False
        self.cal_sent = 0.0
        self.acks.pop(M.MAV_CMD_PREFLIGHT_CALIBRATION, None)

    def handle(self, msg) -> None:
        t = msg.get_type()
        if t == "HEARTBEAT" and (msg.type == M.MAV_TYPE_GCS or msg.autopilot == M.MAV_AUTOPILOT_INVALID):
            return  # another ground station or a non-autopilot component
        if t == "COMMAND_ACK":
            self.acks[msg.command] = (msg.result, time.monotonic())
        if t == "PARAM_VALUE":
            self.params[msg.param_id] = (msg.param_value, time.monotonic())
        if t in ("MISSION_REQUEST_INT", "MISSION_REQUEST", "MISSION_ACK"):  # the upload conversation (commands.upload_mission)
            self.mission_rx = self.mission_rx[-49:] + [(time.monotonic(), msg)]
        if t == "FENCE_STATUS":  # P3.3.4: breach_status 1 while outside the fence
            self.fence_breach = int(msg.breach_status)
        if t == "MISSION_CURRENT":
            self.mission_seq = msg.seq
        if t == "STATUSTEXT":
            self.texts = self.texts[-19:] + [(time.monotonic(), msg.severity, msg.text)]
        if t == "SYS_STATUS" and msg.battery_remaining >= 0:
            self.battery = float(msg.battery_remaining)
        if t in NEEDED:
            self.last[t] = msg

    def state(self, t: str | None = None) -> DroneState | None:
        """The current DroneState, or None until every source has been heard once and the battery is known."""
        if any(k not in self.last for k in NEEDED) or self.battery is None:
            return None
        p, a, g, hb = (self.last[k] for k in ("GLOBAL_POSITION_INT", "ATTITUDE", "GPS_RAW_INT", "HEARTBEAT"))
        heading = p.hdg / 100 if p.hdg != 65535 else math.degrees(a.yaw) % 360
        return DroneState.from_dict({
            "t": t or utc_now(),
            "lat": p.lat / 1e7,
            "lon": p.lon / 1e7,
            "altMsl": p.alt / 1000,
            "altAgl": p.relative_alt / 1000,
            "headingDeg": heading,
            "pitchDeg": math.degrees(a.pitch),
            "rollDeg": math.degrees(a.roll),
            "groundSpeed": math.hypot(p.vx, p.vy) / 100,
            "verticalSpeed": -p.vz / 100,  # NED z points down; DroneState is positive up
            "batteryPct": self.battery,
            "mode": mavutil.mode_string_v10(hb),
            "armed": bool(hb.base_mode & M.MAV_MODE_FLAG_SAFETY_ARMED),
            **({"wp": self.mission_wp.get(self.mission_seq, 0), "wpCount": self.mission_count} if self.mission_count else {}),
            "gpsFix": int(g.fix_type),
        })

    def poll(self, timeout: float = 0.05) -> DroneState | None:
        """Reads every message waiting (blocking up to `timeout` for the first) and returns the current state."""
        msg = self._recv(True, timeout)
        while msg is not None:
            self.handle(msg)
            self.last_rx = time.monotonic()
            msg = self._recv(False)
        if not self.fresh():  # a restarted simulator forgets the rates (and its calibration): redo both once it is heard
            self.forget_calibration()
            self.last.pop("HEARTBEAT", None)
        if not self.asked and "HEARTBEAT" in self.last:  # a udpin link can only send once the simulator has been heard
            self.request_rates()
        if self.asked:
            self.calibrate()
        return self.state()

    def _recv(self, blocking, timeout=None):
        try:
            return self.conn.recv_match(blocking=blocking, timeout=timeout)
        except ConnectionResetError:
            # Windows: after something we sent hit a closed UDP port (the simulator was killed), the next recvfrom raises
            # WSAECONNRESET ("a previous send operation resulted in an ICMP Port Unreachable message", Microsoft recvfrom
            # docs). The socket stays usable; nothing was received.
            return None

    def send_rc(self, ci: ControlInput) -> bool:
        """Sends one RC_CHANNELS_OVERRIDE for channels 1-4 (5-8 ignored: UINT16_MAX). False while the simulator is not heard."""
        if not self.fresh():
            return False
        ignore = 65535
        self.conn.mav.rc_channels_override_send(self.conn.target_system, self.conn.target_component, *to_pwm(ci), ignore, ignore, ignore, ignore)
        return True

    def release_rc(self) -> None:
        """Hands channels 1-4 back to the radio (value 0, mavlink.io RC_CHANNELS_OVERRIDE)."""
        if self.fresh():
            self.conn.mav.rc_channels_override_send(self.conn.target_system, self.conn.target_component, 0, 0, 0, 0, 65535, 65535, 65535, 65535)

    def fresh(self) -> bool:
        """True while the simulator is being heard (a message within STALE_S)."""
        return time.monotonic() - self.last_rx < STALE_S

    def request_rates(self, hz: float = 25) -> None:
        """Asks the autopilot to send each source message at `hz` (it sends none of them until asked; P2A.1.4 measured
        21.5 Hz for a 25 Hz request)."""
        for msg_id in (M.MAVLINK_MSG_ID_GLOBAL_POSITION_INT, M.MAVLINK_MSG_ID_ATTITUDE, M.MAVLINK_MSG_ID_SYS_STATUS, M.MAVLINK_MSG_ID_GPS_RAW_INT,
                       M.MAVLINK_MSG_ID_MISSION_CURRENT, M.MAVLINK_MSG_ID_FENCE_STATUS):
            self.command(M.MAV_CMD_SET_MESSAGE_INTERVAL, msg_id, 1e6 / hz)
        self.asked = True

    def calibrate(self) -> None:
        """SIMULATOR ONLY: our SITL starts without ArduPilot's copter.parm, so it has no accelerometer calibration and
        refuses to arm ("Arm: 3D Accel calibration needed"). The simple calibration a user would run fixes that
        (MAV_CMD_PREFLIGHT_CALIBRATION param5=4; P2A.1.3). SITL refuses it for its first seconds, so it is repeated every
        3 s until accepted, once per simulator session. Never do this on a real drone; the real link is parked."""
        if self.calibrated or self.armed() or "HEARTBEAT" not in self.last:
            return
        result, t = self.acks.get(M.MAV_CMD_PREFLIGHT_CALIBRATION, (None, 0.0))
        if result == M.MAV_RESULT_ACCEPTED and t >= self.cal_sent > 0:
            self.calibrated = True
        elif time.monotonic() - self.cal_sent > 3:
            self.cal_sent = self.command(M.MAV_CMD_PREFLIGHT_CALIBRATION, 0, 0, 0, 0, 4)

    def command(self, cmd: int, *params: float) -> float:
        """Sends COMMAND_LONG to the autopilot (missing params are 0); returns the send time for wait-for-ack."""
        p = (list(params) + [0] * 7)[:7]
        self.conn.mav.command_long_send(self.conn.target_system, self.conn.target_component, cmd, 0, *p)
        return time.monotonic()

    def armed(self) -> bool:
        hb = self.last.get("HEARTBEAT")
        return bool(hb and hb.base_mode & M.MAV_MODE_FLAG_SAFETY_ARMED)

    def mode(self) -> str | None:
        hb = self.last.get("HEARTBEAT")
        return mavutil.mode_string_v10(hb) if hb else None


if __name__ == "__main__":  # live check: python bridge/mavlink_link.py [--start] [--seconds 20]
    import argparse
    import time

    import sitl

    ap = argparse.ArgumentParser()
    ap.add_argument("--start", metavar="LAT,LON", help="start SITL there (bridge/sitl.py) for the check and stop it after")
    ap.add_argument("--seconds", type=float, default=20)
    a = ap.parse_args()
    proc = sitl.start(*map(float, a.start.split(","))) if a.start else None
    try:
        link, s, t0 = Link(), None, time.time()
        while time.time() - t0 < a.seconds:
            s = link.poll(0.1) or s
        print(s.to_dict() if s else "no complete DroneState")
    finally:
        sitl.stop(proc)
