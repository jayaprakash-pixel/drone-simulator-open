"""The browser-bridge contract (plan p.6), the Python twin of web/src/net/contract.ts.

Both are tested against docs/contract.fixtures.json, so a rule changed on one side only fails a test.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import asdict, dataclass, fields
from datetime import datetime
from pathlib import Path
from typing import Optional

MODES = ("stabilize", "altHold", "loiter", "rtl", "auto")
_ISO_UTC = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$")


def _num(v, lo=-math.inf, hi=math.inf) -> bool:
    # bool is an int in Python; JSON true must not pass as 1
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and lo <= v <= hi


def _iso(v) -> bool:
    if not isinstance(v, str) or not _ISO_UTC.match(v):
        return False
    try:
        datetime.fromisoformat(v.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


@dataclass
class ControlInput:
    throttle: float  # 0..1
    yaw: float  # -1..1
    pitch: float  # -1..1
    roll: float  # -1..1
    mode: Optional[str] = None
    arm: Optional[bool] = None

    _RULES = {
        "throttle": lambda v: _num(v, 0, 1),
        "yaw": lambda v: _num(v, -1, 1),
        "pitch": lambda v: _num(v, -1, 1),
        "roll": lambda v: _num(v, -1, 1),
        "mode": lambda v: v in MODES,
        "arm": lambda v: isinstance(v, bool),
    }
    _OPTIONAL = ("mode", "arm")

    @classmethod
    def from_dict(cls, d: dict) -> "ControlInput":
        _check(cls, d)
        return cls(**d)

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class DroneState:
    t: str  # UTC ISO 8601
    lat: float
    lon: float
    altMsl: float
    altAgl: float
    headingDeg: float
    pitchDeg: float
    rollDeg: float
    groundSpeed: float
    verticalSpeed: float
    batteryPct: float
    mode: str
    armed: bool
    gpsFix: int  # 0 none, 3 = 3D fix (MAVLink GPS_FIX_TYPE 0..8)
    wp: Optional[int] = None  # P3.3.3: the mission waypoint being flown to (1-based); absent with no mission
    wpCount: Optional[int] = None

    _RULES = {
        "t": _iso,
        "lat": lambda v: _num(v, -90, 90),
        "lon": lambda v: _num(v, -180, 180),
        "altMsl": _num,
        "altAgl": _num,
        "headingDeg": lambda v: _num(v, 0, 360),
        "pitchDeg": lambda v: _num(v, -90, 90),
        "rollDeg": lambda v: _num(v, -180, 180),
        "groundSpeed": lambda v: _num(v, 0),
        "verticalSpeed": _num,
        "batteryPct": lambda v: _num(v, 0, 100),
        "mode": lambda v: isinstance(v, str) and len(v) > 0,
        "armed": lambda v: isinstance(v, bool),
        "gpsFix": lambda v: isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 8,
        "wp": lambda v: isinstance(v, int) and not isinstance(v, bool) and v >= 0,
        "wpCount": lambda v: isinstance(v, int) and not isinstance(v, bool) and v >= 0,
    }
    _OPTIONAL = ("wp", "wpCount")

    @classmethod
    def from_dict(cls, d: dict) -> "DroneState":
        _check(cls, d)
        return cls(**d)

    def to_dict(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if v is not None or k not in self._OPTIONAL}
        _check(DroneState, d)  # never send a state the browser would reject
        return d


def _check(cls, d) -> None:
    """Raises ValueError naming the first missing, wrong or extra field."""
    if not isinstance(d, dict):
        raise ValueError("not an object")
    names = [f.name for f in fields(cls)]
    for k in d:
        if k not in names:
            raise ValueError(f"unknown field {k}")
    for k in names:
        if k not in d or d[k] is None:
            if k in d or k not in cls._OPTIONAL:  # an explicit null is never valid
                raise ValueError(f"{k} missing")
        elif not cls._RULES[k](d[k]):
            raise ValueError(f"{k} out of range or wrong type: {d[k]!r}")


COMMANDS = ("arm", "disarm", "takeoff", "land", "mode", "place", "wind", "gps", "battery", "mission", "fence", "params")
# P3.4: the only parameters the app may read or set (data/param-whitelist.json, shared with web/src/net/contract.ts)
WHITELIST = {p["name"]: (p["min"], p["max"]) for p in json.loads((Path(__file__).resolve().parents[1] / "data" / "param-whitelist.json").read_text(encoding="utf-8"))["params"]}


def _values(v) -> bool:
    """name -> number, every name on the whitelist and within its documented range"""
    return isinstance(v, dict) and 0 < len(v) <= len(WHITELIST) and all(k in WHITELIST and _num(x, *WHITELIST[k]) for k, x in v.items())
BREACH = ("rtl", "land")
MAX_WAYPOINTS = 30
_POINT = {"lat": lambda v: _num(v, -90, 90), "lon": lambda v: _num(v, -180, 180), "alt": lambda v: _num(v, 2, 120), "speed": lambda v: _num(v, 1, 15)}


def _point(w) -> bool:
    """A mission point (P3.3): lat, lon, height in metres above home, speed in m/s; nothing else."""
    return isinstance(w, dict) and set(w) == set(_POINT) and all(f(w[k]) for k, f in _POINT.items())
WIND = ("calm", "breeze", "strong", "gusty")
GPS = ("good", "weak", "dropout")


@dataclass
class Command:
    """A discrete action from the browser (P2A.2.4); the bridge answers each with a CommandAck of the same id."""
    type: str  # "command"
    id: int
    command: str
    mode: Optional[str] = None  # required for "mode": one of MODES
    alt: Optional[float] = None  # required for "takeoff": metres above home, 1..100
    lat: Optional[float] = None  # "place" (P2A.3.2): the new home, its ground height MSL and the heading to face
    lon: Optional[float] = None
    altMsl: Optional[float] = None
    heading: Optional[float] = None
    preset: Optional[str] = None  # wind (P3.2.1): one of WIND
    quality: Optional[str] = None  # gps (P3.2.2): one of GPS
    startPct: Optional[float] = None  # battery (P3.2.3): charge to start from, and drain per minute
    drainPctPerMin: Optional[float] = None
    waypoints: Optional[list] = None  # mission (P3.3.3): 1..MAX_WAYPOINTS points
    altMax: Optional[float] = None  # fence (P3.3.4): metres above home (FENCE_ALT_MAX range 10..1000)
    radius: Optional[float] = None  # metres from home (FENCE_RADIUS range 30..10000)
    breach: Optional[str] = None  # one of BREACH
    values: Optional[dict] = None  # params (P3.4): whitelisted name -> value to set; absent = read them all

    _RULES = {
        "type": lambda v: v == "command",
        "id": lambda v: isinstance(v, int) and not isinstance(v, bool) and v >= 0,
        "command": lambda v: v in COMMANDS,
        "mode": lambda v: v in MODES,
        "alt": lambda v: _num(v, 1, 100),
        "lat": lambda v: _num(v, -90, 90),
        "lon": lambda v: _num(v, -180, 180),
        "altMsl": lambda v: _num(v, -500, 9000),
        "heading": lambda v: _num(v, 0, 360),
        "preset": lambda v: v in WIND,
        "quality": lambda v: v in GPS,
        "startPct": lambda v: _num(v, 1, 100),
        "drainPctPerMin": lambda v: _num(v, 0.1, 100),
        "waypoints": lambda v: isinstance(v, list) and 1 <= len(v) <= MAX_WAYPOINTS and all(_point(w) for w in v),
        "altMax": lambda v: _num(v, 10, 1000),
        "radius": lambda v: _num(v, 30, 10000),
        "breach": lambda v: v in BREACH,
        "values": _values,
    }
    _OPTIONAL = ("mode", "alt", "lat", "lon", "altMsl", "heading", "preset", "quality", "startPct", "drainPctPerMin", "waypoints", "altMax", "radius", "breach", "values")
    _NEEDS = {"place": ("lat", "lon", "altMsl", "heading"), "wind": ("preset",), "gps": ("quality",), "battery": ("startPct", "drainPctPerMin"),
              "mission": ("waypoints",), "fence": ("altMax", "radius", "breach")}

    @classmethod
    def from_dict(cls, d: dict) -> "Command":
        _check(cls, d)
        if (d["command"] == "mode") != ("mode" in d) or (d["command"] == "takeoff") != ("alt" in d):
            raise ValueError("mode goes with command mode only, alt with command takeoff only")
        if "values" in d and d["command"] != "params":
            raise ValueError("values go with command params only")
        for cmd, keys in cls._NEEDS.items():
            if any((d["command"] == cmd) != (k in d) for k in keys):
                raise ValueError(f"{cmd} needs {', '.join(keys)}; other commands take none of them")
        return cls(**d)


@dataclass
class CommandAck:
    type: str  # "ack"
    id: int
    ok: bool
    reason: str  # plain words; empty when ok
    values: Optional[dict] = None  # params read (P3.4): name -> value as the autopilot holds it

    _RULES = {
        "type": lambda v: v == "ack",
        "id": lambda v: isinstance(v, int) and not isinstance(v, bool) and v >= 0,
        "ok": lambda v: isinstance(v, bool),
        "reason": lambda v: isinstance(v, str),
        "values": lambda v: isinstance(v, dict) and all(k in WHITELIST and _num(x) for k, x in v.items()),
    }
    _OPTIONAL = ("values",)

    @classmethod
    def from_dict(cls, d: dict) -> "CommandAck":
        _check(cls, d)
        return cls(**d)

    def to_dict(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if v is not None}
        _check(CommandAck, d)
        return d


@dataclass
class Progress:
    """A step of a long command (place: stopping, starting the simulator ...); its CommandAck ends it."""
    type: str  # "progress"
    id: int
    text: str

    _RULES = {
        "type": lambda v: v == "progress",
        "id": lambda v: isinstance(v, int) and not isinstance(v, bool) and v >= 0,
        "text": lambda v: isinstance(v, str) and len(v) > 0,
    }
    _OPTIONAL = ()

    def to_dict(self) -> dict:
        d = asdict(self)
        _check(Progress, d)
        return d


STATE_FIELDS = [f.name for f in fields(DroneState)]
