import json
from pathlib import Path

import pytest

from contract import STATE_FIELDS, Command, CommandAck, ControlInput, DroneState, Progress

FX = json.loads((Path(__file__).parents[2] / "docs" / "contract.fixtures.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("v", FX["controlInput"]["valid"])
def test_control_valid(v):
    assert ControlInput.from_dict(v).to_dict() == v


@pytest.mark.parametrize("case", FX["controlInput"]["invalid"], ids=lambda c: c["why"])
def test_control_invalid(case):
    with pytest.raises(ValueError):
        ControlInput.from_dict(case["value"])


@pytest.mark.parametrize("v", FX["droneState"]["valid"])
def test_state_valid(v):
    assert DroneState.from_dict(v).to_dict() == v


@pytest.mark.parametrize("case", FX["droneState"]["invalid"], ids=lambda c: c["why"])
def test_state_invalid(case):
    with pytest.raises(ValueError):
        DroneState.from_dict(case["value"])


def test_state_has_the_plans_14_fields():
    assert STATE_FIELDS == FX["droneStateFields"]


@pytest.mark.parametrize("v", FX["command"]["valid"])
def test_command_valid(v):
    Command.from_dict(v)


@pytest.mark.parametrize("case", FX["command"]["invalid"], ids=lambda c: c["why"])
def test_command_invalid(case):
    with pytest.raises(ValueError):
        Command.from_dict(case["value"])


@pytest.mark.parametrize("v", FX["ack"]["valid"])
def test_ack_valid(v):
    assert CommandAck.from_dict(v).to_dict() == v


@pytest.mark.parametrize("case", FX["ack"]["invalid"], ids=lambda c: c["why"])
def test_ack_invalid(case):
    with pytest.raises(ValueError):
        CommandAck.from_dict(case["value"])


@pytest.mark.parametrize("v", FX["progress"]["valid"])
def test_progress_valid(v):
    assert Progress(**v).to_dict() == v


@pytest.mark.parametrize("case", FX["progress"]["invalid"], ids=lambda c: c["why"])
def test_progress_invalid(case):
    with pytest.raises(ValueError):
        Progress(**case["value"]).to_dict()
