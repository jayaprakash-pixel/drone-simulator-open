"""P3.2.2 and P3.2.3 presets: every contract choice has a preset; the battery capacity gives the chosen drain at hover."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import commands  # noqa: E402
from contract import GPS  # noqa: E402


def test_every_gps_choice_has_a_preset():
    assert set(commands.GPS) == set(GPS)
    assert commands.GPS["dropout"]["SIM_GPS1_ENABLE"] == 0 and commands.GPS["good"]["SIM_GPS1_ENABLE"] == 1
    assert commands.GPS["weak"]["SIM_GPS1_NUMSATS"] < commands.GPS["good"]["SIM_GPS1_NUMSATS"]


def test_battery_capacity_gives_the_chosen_drain_at_hover():
    for drain in (5, 20, 60):
        p = commands.battery_params(drain)
        per_min = commands.HOVER_A * 1000 / 60 / p["BATT_CAPACITY"] * 100
        assert abs(per_min - drain) < 0.05 * drain
        assert p["BATT_LOW_MAH"] == round(p["BATT_CAPACITY"] * 0.25) and p["BATT_CRT_MAH"] == round(p["BATT_CAPACITY"] * 0.10)
        assert p["BATT_FS_LOW_ACT"] == 2 and p["BATT_FS_CRT_ACT"] == 1  # low returns home, critical lands


def test_mission_items_map_every_item_to_the_waypoint_shown():
    wps = [{"lat": 26.49 + i / 1000, "lon": 74.55, "alt": 20 + i, "speed": 5} for i in range(5)]
    items, shown = commands.mission_items(wps)
    assert len(items) == 2 + 2 * 5 + 1  # home, take off, (speed, waypoint) x 5, return home
    nav = [i for i, it in enumerate(items) if it[1] == commands.M.MAV_CMD_NAV_WAYPOINT and i > 0]
    assert [shown[i] for i in nav] == [1, 2, 3, 4, 5]
    assert items[1][1] == commands.M.MAV_CMD_NAV_TAKEOFF and items[1][8] == 20
    assert items[-1][1] == commands.M.MAV_CMD_NAV_RETURN_TO_LAUNCH and set(shown) == set(range(len(items)))


def test_fence_breach_actions():
    assert commands.fence_params(120, 100, "rtl")["FENCE_ACTION"] == 1 and commands.fence_params(120, 100, "land")["FENCE_ACTION"] == 2
