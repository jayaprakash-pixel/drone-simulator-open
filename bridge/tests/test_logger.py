"""P3.1.1 the flight log with a 10 s synthetic session."""
import json
import re
from datetime import datetime, timedelta, timezone

from contract import DroneState
from logger import FlightLog, read_log, write_log

T0 = datetime(2026, 10, 9, 10, 0, 0, tzinfo=timezone.utc)


def state(i: int) -> dict:
    armed = i >= 50  # armed 1 s in
    mode = "GUIDED" if i < 200 else "LOITER"  # mode change at 4 s
    return DroneState.from_dict({
        "t": (T0 + timedelta(seconds=i / 50)).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "lat": 26.4897 + i * 1e-6, "lon": 74.5511, "altMsl": 503.0 + i * 0.02, "altAgl": i * 0.02, "headingDeg": 90,
        "pitchDeg": 0, "rollDeg": 0, "groundSpeed": 1.0, "verticalSpeed": 1.0, "batteryPct": 99, "mode": mode,
        "armed": armed, "gpsFix": 6}).to_dict()


def session(tmp_path):
    p = tmp_path / "flight.jsonl"
    log = FlightLog(p)
    for i in range(500):  # 10 s of states at 50 per second
        now, wall = i / 50, T0 + timedelta(seconds=i / 50)
        log.sample(now, wall, state(i), {"throttle": 0.5, "yaw": 0, "pitch": 0, "roll": 0})
        if i == 300:
            log.event(wall, "fence", reason="max distance 100 m")
        if i == 400:
            log.event(wall, "crash", lat=26.49, lon=74.55, altMsl=530.0, groundMsl=530.2)
    log.close()
    return p


def test_ten_seconds_give_at_least_195_lines_every_line_json(tmp_path):
    p = session(tmp_path)
    lines = p.read_text(encoding="utf-8").splitlines()
    assert len(lines) >= 195
    recs = [json.loads(line) for line in lines]
    samples = [r for r in recs if r["type"] == "sample"]
    assert 195 <= len(samples) <= 201  # 20 per second


def test_time_is_iso_utc_and_altitude_is_altmsl(tmp_path):
    for r in read_log(session(tmp_path)):
        assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", r["t"])
        if r["type"] == "sample":
            assert "altMsl" in r["state"] and "alt" not in r["state"] and "alt" not in r
            DroneState.from_dict(r["state"])  # the state still passes the contract


def test_arm_mode_fence_and_crash_events_appear(tmp_path):
    kinds = [r["kind"] for r in read_log(session(tmp_path)) if r["type"] == "event"]
    assert kinds == ["arm", "mode", "fence", "crash"]
    mode = next(r for r in read_log(tmp_path / "flight.jsonl") if r.get("kind") == "mode")
    assert (mode["from"], mode["to"]) == ("GUIDED", "LOITER")


def test_parser_round_trips_the_file(tmp_path):
    p = session(tmp_path)
    q = tmp_path / "again.jsonl"
    write_log(read_log(p), q)
    assert q.read_bytes() == p.read_bytes()
