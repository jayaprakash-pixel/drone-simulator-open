"""Flight log (P3.1.1): JSON Lines, one sample per 1/20 s with the DroneState and the ControlInput, plus events.

    {"t": "2026-10-09T10:00:00.050Z", "type": "sample", "state": {...DroneState, altMsl not alt...}, "control": {...}}
    {"t": "...", "type": "event", "kind": "arm" | "disarm" | "mode" | "fence" | "crash" | ..., ...details}

Arm, disarm and mode changes are found in the states themselves; fence breaches and crashes are reported with event().
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

RATE_HZ = 20


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class FlightLog:
    def __init__(self, path: str | Path, rate_hz: float = RATE_HZ):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.f = open(self.path, "w", encoding="utf-8", newline="\n", buffering=1)  # line by line: a killed bridge loses nothing (found 2026-10-09)
        self.period = 1 / rate_hz
        self.next_t: float | None = None  # seconds (the caller's clock) when the next sample is due
        self.last: dict | None = None

    def _write(self, rec: dict) -> None:
        self.f.write(json.dumps(rec, separators=(",", ":")) + "\n")

    def sample(self, now: float, wall: datetime, state: dict | None, control: dict | None) -> bool:
        """Called as often as wanted; writes at most RATE_HZ samples a second. `now` is a monotonic clock in seconds."""
        if state is None:
            return False
        if self.last is not None:  # events found in the states, written as soon as they are seen
            if state["armed"] != self.last["armed"]:
                self.event(wall, "arm" if state["armed"] else "disarm")
            if state["mode"] != self.last["mode"]:
                self.event(wall, "mode", **{"from": self.last["mode"], "to": state["mode"]})
        self.last = state
        if self.next_t is not None and now < self.next_t:
            return False
        self.next_t = (self.next_t or now) + self.period
        if now - self.next_t > self.period:  # fell behind (a pause): restart the schedule rather than burst
            self.next_t = now + self.period
        self._write({"t": iso(wall), "type": "sample", "state": state, "control": control})
        return True

    def event(self, wall: datetime, kind: str, **details) -> None:
        self._write({"t": iso(wall), "type": "event", "kind": kind, **details})

    def close(self) -> None:
        self.f.close()


def read_log(path: str | Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_log(records: list[dict], path: str | Path) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in records:
            f.write(json.dumps(r, separators=(",", ":")) + "\n")


def session_path(root: str | Path, when: datetime | None = None) -> Path:
    """data/logs/flight-20261009T101500Z.jsonl"""
    w = (when or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return Path(root) / f"flight-{w.strftime('%Y%m%dT%H%M%SZ')}.jsonl"

