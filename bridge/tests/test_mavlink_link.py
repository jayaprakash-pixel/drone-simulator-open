"""P2A.2.1: DroneState from MAVLink, replayed from a SITL capture (fixtures/flight.tlog: start, arm, take off to 10 m,
land; recorded 2026-10-09 by `python sim/spike.py --start --record`) and from hand-made messages."""
from pathlib import Path

import pytest
from pymavlink import mavutil

from contract import DroneState
from mavlink_link import Link

M = mavutil.mavlink
TLOG = Path(__file__).parent / "fixtures" / "flight.tlog"
T = "2026-10-09T00:00:00.000Z"


def replay(stop=None):
    """Feeds the capture into a Link; yields (msg, link) after each message."""
    conn = mavutil.mavlink_connection(str(TLOG))
    link = Link(conn=conn)
    while (msg := conn.recv_match()) is not None:
        link.handle(msg)
        yield msg, link


def test_capture_every_state_passes_the_contract():
    n = 0
    for _, link in replay():
        s = link.state(T)
        if s:
            DroneState.from_dict(s.to_dict())  # raises on any field out of range
            n += 1
    assert n > 1500  # one state per message after the first 1.5 s


def test_capture_values_hand_checked():
    # mid-climb, GLOBAL_POSITION_INT time_boot_ms 49695: lat 264897001 degE7, lon 745510998, alt 4040 mm,
    # relative_alt 4049 mm, vx 0, vy 0, vz -254 cm/s (NED: climbing), hdg 12 cdeg; next ATTITUDE (49735):
    # roll 0.0029751197 rad, pitch 0.0031032506 rad
    s = None
    for msg, link in replay():
        if msg.get_type() == "ATTITUDE" and msg.time_boot_ms == 49735:
            s = link.state(T)
            break
    assert s is not None
    assert s.lat == pytest.approx(26.4897001, abs=1e-9)
    assert s.lon == pytest.approx(74.5510998, abs=1e-9)
    assert s.altMsl == pytest.approx(4.040)  # mm to m
    assert s.altAgl == pytest.approx(4.049)
    assert s.verticalSpeed == pytest.approx(2.54)  # cm/s to m/s, sign flipped to up-positive
    assert s.groundSpeed == pytest.approx(0.0)
    assert s.headingDeg == pytest.approx(0.12)  # cdeg to degrees
    assert s.rollDeg == pytest.approx(0.170462, abs=1e-5)  # 0.0029751197 rad * 57.29578
    assert s.pitchDeg == pytest.approx(0.177803, abs=1e-5)  # 0.0031032506 rad * 57.29578
    assert (s.mode, s.armed, s.gpsFix) == ("GUIDED", True, 6)
    assert 0 <= s.batteryPct <= 100


def test_capture_flight_shape():
    states = [link.state(T) for _, link in replay()]
    states = [s for s in states if s]
    assert max(s.altAgl for s in states) == pytest.approx(9.5, abs=0.6)  # the spike climbed to 9.5 m
    assert {s.mode for s in states} >= {"GUIDED", "LAND"}
    assert states[-1].armed is False and states[-1].mode == "LAND"
    assert states[-1].batteryPct < states[0].batteryPct  # the simulated battery drains in flight


def test_no_state_until_every_source_and_the_battery_are_known():
    link = Link(conn=object())
    assert link.state(T) is None
    link.handle(M.MAVLink_sys_status_message(0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0))
    assert link.battery is None  # -1 means unknown, not 0 %


def made_state(vx=300, vy=400, vz=150, hdg=9050, roll=-0.5, pitch=0.25, yaw=1.0, battery=55, base_mode=M.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED):  # ArduPilot always sets this flag
    link = Link(conn=object())
    for msg in (
        M.MAVLink_global_position_int_message(0, 264897000, 745511000, 502800, 12300, vx, vy, vz, hdg),
        M.MAVLink_attitude_message(0, roll, pitch, yaw, 0, 0, 0),
        M.MAVLink_sys_status_message(0, 0, 0, 0, 0, 0, battery, 0, 0, 0, 0, 0, 0),
        M.MAVLink_gps_raw_int_message(0, 3, 0, 0, 0, 0, 0, 0, 0, 0),
        M.MAVLink_heartbeat_message(M.MAV_TYPE_QUADROTOR, M.MAV_AUTOPILOT_ARDUPILOTMEGA, base_mode, 5, 0, 3),
    ):
        link.handle(msg)
    return link.state(T)


def test_unit_conversions_hand_made():
    s = made_state()
    assert (s.lat, s.lon, s.altMsl, s.altAgl) == (26.4897, 74.5511, 502.8, 12.3)
    assert s.groundSpeed == pytest.approx(5.0)  # 3 and 4 m/s north and east
    assert s.verticalSpeed == pytest.approx(-1.5)  # vz +150 cm/s is down
    assert s.headingDeg == pytest.approx(90.5)
    assert s.rollDeg == pytest.approx(-28.6479, abs=1e-4)  # -0.5 rad
    assert s.pitchDeg == pytest.approx(14.3239, abs=1e-4)  # 0.25 rad
    assert (s.batteryPct, s.gpsFix, s.mode, s.armed) == (55, 3, "LOITER", False)  # custom_mode 5 is Loiter in ArduCopter


def test_heading_falls_back_to_yaw_and_armed_flag():
    s = made_state(hdg=65535, yaw=-1.0, base_mode=M.MAV_MODE_FLAG_SAFETY_ARMED | M.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED)
    assert s.headingDeg == pytest.approx(302.7042, abs=1e-4)  # -1 rad = -57.2958 deg, as a compass heading
    assert s.armed is True


def test_ground_station_heartbeats_are_ignored():
    link = Link(conn=object())
    link.handle(M.MAVLink_heartbeat_message(M.MAV_TYPE_GCS, M.MAV_AUTOPILOT_INVALID, 0, 0, 0, 3))
    assert "HEARTBEAT" not in link.last


def test_udp_reset_after_the_simulator_dies_is_not_fatal():
    class Dead:  # Windows raises WSAECONNRESET on recvfrom once a send has hit the closed port
        def recv_match(self, **_):
            raise ConnectionResetError(10054, "An existing connection was forcibly closed by the remote host")

    assert Link(conn=Dead()).poll(0) is None


@pytest.mark.parametrize("field,value,channel,pwm", [
    ("roll", 0, 0, 1500), ("roll", -1, 0, 1000), ("roll", 1, 0, 2000),
    ("pitch", 0, 1, 1500), ("pitch", -1, 1, 1000), ("pitch", 1, 1, 2000),
    ("yaw", 0, 3, 1500), ("yaw", -1, 3, 1000), ("yaw", 1, 3, 2000),
    ("throttle", 0, 2, 1000), ("throttle", 1, 2, 2000), ("throttle", 0.5, 2, 1500),
])
def test_rc_mapping_table(field, value, channel, pwm):
    from contract import ControlInput
    from mavlink_link import to_pwm
    ci = {"throttle": 0.5, "yaw": 0, "pitch": 0, "roll": 0}
    ci[field] = value
    assert to_pwm(ControlInput.from_dict(ci))[channel] == pwm


def test_a_new_simulator_is_calibrated_again():
    """The old simulator's accepted calibration must not mark the new one calibrated (live_idle.py, 2026-10-09)."""
    from pymavlink import mavutil
    M = mavutil.mavlink
    sent = []

    class Conn:
        target_system = target_component = 1

        class mav:
            @staticmethod
            def command_long_send(*a):
                sent.append(a[2])

        def recv_match(self, **_):
            return None

    link = Link(conn=Conn())
    link.last["HEARTBEAT"] = type("HB", (), {"base_mode": 0})()
    link.cal_sent = 5.0
    link.acks[M.MAV_CMD_PREFLIGHT_CALIBRATION] = (M.MAV_RESULT_ACCEPTED, 6.0)  # the old simulator's answer
    link.reset()
    link.last["HEARTBEAT"] = type("HB", (), {"base_mode": 0})()  # the new simulator is heard
    link.calibrate()
    assert not link.calibrated and sent == [M.MAV_CMD_PREFLIGHT_CALIBRATION]


def test_reset_drops_what_the_old_simulator_left_queued():
    """Packets queued from the stopped simulator must not pass for the new one (params-live.mjs, 2026-10-09)."""
    class Queued:
        def __init__(self):
            self.q = ["HEARTBEAT", "PARAM_VALUE", "GPS_RAW_INT"]

        def recv_match(self, blocking=False, timeout=None):
            return self.q.pop(0) if self.q else None

    conn = Queued()
    link = Link(conn=conn)
    link.reset()
    assert conn.q == [] and link.state() is None
