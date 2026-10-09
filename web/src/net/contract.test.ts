import { describe, expect, it } from 'vitest';
import fx from '../../../docs/contract.fixtures.json';
import { checkCommand, checkCommandAck, checkControlInput, checkDroneState, checkProgress, STATE_FIELDS } from './contract';

describe('contract (docs/contract.fixtures.json)', () => {
  it.each(fx.controlInput.valid)('accepts ControlInput %j', (v) => expect(checkControlInput(v)).toBeNull());
  it.each(fx.controlInput.invalid)('rejects ControlInput: $why', ({ value }) => expect(checkControlInput(value)).not.toBeNull());
  it.each(fx.droneState.valid)('accepts DroneState %j', (v) => expect(checkDroneState(v)).toBeNull());
  it.each(fx.droneState.invalid)('rejects DroneState: $why', ({ value }) => expect(checkDroneState(value)).not.toBeNull());
  it.each(fx.command.valid)('accepts Command %j', (v) => expect(checkCommand(v)).toBeNull());
  it.each(fx.command.invalid)('rejects Command: $why', ({ value }) => expect(checkCommand(value)).not.toBeNull());
  it.each(fx.ack.valid)('accepts CommandAck %j', (v) => expect(checkCommandAck(v)).toBeNull());
  it.each(fx.ack.invalid)('rejects CommandAck: $why', ({ value }) => expect(checkCommandAck(value)).not.toBeNull());
  it.each(fx.progress.valid)('accepts Progress %j', (v) => expect(checkProgress(v)).toBeNull());
  it.each(fx.progress.invalid)('rejects Progress: $why', ({ value }) => expect(checkProgress(value)).not.toBeNull());
  it("DroneState has the plan's 14 fields plus the optional mission progress (wp, wpCount)", () => expect(STATE_FIELDS).toEqual(fx.droneStateFields));
});
