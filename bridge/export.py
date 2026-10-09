"""Export a flight log to CSV and KML (P3.1.4).

    python bridge/export.py data/logs/flight-20261009T101500Z.jsonl   -> .csv and .kml next to it

CSV: the notice line (starting with #), then a header row and one row per sample. KML: one LineString through every
sample at its MSL height (Google Earth's absolute altitude), with the notice in the description and a comment.
Every exported file carries the rehearsal-only notice (P3.4.2).
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from logger import read_log

NOTICE = "Rehearsal tool only: not a substitute for pre-flight checks or legal permission to fly."  # as on screen
COLUMNS = ["t", "lat", "lon", "altMsl", "altAgl", "headingDeg", "pitchDeg", "rollDeg", "groundSpeed", "verticalSpeed",
           "batteryPct", "mode", "armed", "gpsFix", "throttle", "yaw", "pitch", "roll"]


def samples(log: list[dict]) -> list[dict]:
    return [r for r in log if r.get("type") == "sample" and r.get("state")]


def to_csv(log: list[dict], path: Path) -> int:
    rows = samples(log)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(f"# {NOTICE}\n")
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for r in rows:
            row = {**(r.get("control") or {}), **r["state"]}  # state and stick keys do not overlap
            w.writerow([row.get(k, "") for k in COLUMNS])
    return len(rows)


def to_kml(log: list[dict], path: Path, name: str) -> int:
    rows = samples(log)
    coords = " ".join(f"{r['state']['lon']:.7f},{r['state']['lat']:.7f},{r['state']['altMsl']:.2f}" for r in rows)
    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- {escape(NOTICE)} -->
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{escape(name)}</name>
    <description>{escape(NOTICE)}</description>
    <Placemark>
      <name>{escape(name)}</name>
      <description>{escape(NOTICE)}</description>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>{coords}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
"""
    path.write_text(kml, encoding="utf-8")
    return len(rows)


def export(log_path: str | Path) -> tuple[Path, Path]:
    p = Path(log_path)
    log = read_log(p)
    csv_path, kml_path = p.with_suffix(".csv"), p.with_suffix(".kml")
    to_csv(log, csv_path)
    to_kml(log, kml_path, p.stem)
    return csv_path, kml_path


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        c, k = export(arg)
        print(f"wrote {c} and {k}")
