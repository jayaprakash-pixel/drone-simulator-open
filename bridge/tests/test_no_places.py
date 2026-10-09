"""P1.12.1 the bridge works anywhere: no place name or test-place coordinate in bridge code (tests may hold them)."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = [p for f in ("world-places.json", "test-places.json") for p in json.loads((ROOT / "data" / f).read_text(encoding="utf-8"))["places"]]
NAMES = sorted({re.sub(r"\s*\(.*\)\s*$", "", p["name"]).strip() for p in DATA} - {""})
COORDS = sorted({f"{v:.4f}".rstrip("0") for p in DATA for v in (p.get("lat"), p.get("lon")) if isinstance(v, (int, float)) and v % 1})


def code(path: Path) -> str:
    src = re.sub(r'"""[\s\S]*?"""', "", path.read_text(encoding="utf-8"))  # docstrings
    return re.sub(r"#.*$", "", src, flags=re.M)  # comments


def sources():
    return [(p.name, code(p)) for p in (ROOT / "bridge").glob("*.py")]


def test_lists_loaded():
    assert len(NAMES) > 30 and len(COORDS) > 30


def test_no_place_name_in_bridge_code():
    hits = [f"{f}: {n}" for f, src in sources() for n in NAMES if len(n) > 3 and re.search(rf"\b{re.escape(n)}\b", src, re.I)]
    assert hits == []


def test_no_test_place_coordinate_in_bridge_code():
    hits = [f"{f}: {c}" for f, src in sources() for c in COORDS if re.search(rf"(?<![\d.]){re.escape(c)}\d*", src)]
    assert hits == []
