"""P3.1.4 CSV and KML export of a flight log (the recorded SITL flight at Pushkar, 1050 samples)."""
import csv
import shutil
from pathlib import Path
from xml.dom import minidom

from export import NOTICE, export
from logger import read_log

FIXTURE = Path(__file__).parents[2] / "web" / "e2e" / "fixtures" / "flight-log.jsonl"


def run(tmp_path):
    p = tmp_path / "flight.jsonl"
    shutil.copy(FIXTURE, p)
    return export(p), [r for r in read_log(p) if r["type"] == "sample"]


def test_csv_has_a_header_and_one_row_per_sample_and_the_notice(tmp_path):
    (c, _), samples = run(tmp_path)
    lines = c.read_text(encoding="utf-8").splitlines()
    assert lines[0] == f"# {NOTICE}"
    rows = list(csv.reader(lines[1:]))
    assert rows[0][:4] == ["t", "lat", "lon", "altMsl"]
    assert len(rows) - 1 == len(samples) == 1050
    assert float(rows[1][1]) == samples[0]["state"]["lat"]


def test_kml_parses_and_has_a_linestring_with_every_sample_and_the_notice(tmp_path):
    (_, k), samples = run(tmp_path)
    doc = minidom.parse(str(k))
    lines = doc.getElementsByTagName("LineString")
    assert len(lines) == 1
    coords = lines[0].getElementsByTagName("coordinates")[0].firstChild.data.split()
    assert len(coords) == len(samples)
    lon, lat, alt = map(float, coords[0].split(","))
    s0 = samples[0]["state"]
    assert (round(lon, 6), round(lat, 6), round(alt, 1)) == (round(s0["lon"], 6), round(s0["lat"], 6), round(s0["altMsl"], 1))
    assert NOTICE in k.read_text(encoding="utf-8")
