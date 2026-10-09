// WebSocket client for the bridge (P2A.3.1): DroneState in, ControlInput and Command out. Reconnects on its own every
// second while the bridge is away; messages that break the contract (contract.ts) are dropped and counted.
import { checkCommandAck, checkDroneState, checkProgress } from './contract';
import type { Command, CommandAck, ControlInput, DroneState, LogEvent, Progress } from './contract';

export const BRIDGE_URL = 'ws://127.0.0.1:8000';
export type BridgeStatus = 'connecting' | 'connected' | 'disconnected';

export interface BridgeClient {
  onState(cb: (s: DroneState) => void): void;
  onStatus(cb: (s: BridgeStatus) => void): void;
  onAck(cb: (a: CommandAck) => void): void;
  onProgress(cb: (p: Progress) => void): void;
  send(m: ControlInput | Command | LogEvent): boolean;
  readonly status: BridgeStatus;
  readonly dropped: number;
  close(): void;
}

export function createBridgeClient(url = BRIDGE_URL, retryMs = 1000): BridgeClient {
  const states: ((s: DroneState) => void)[] = [];
  const statuses: ((s: BridgeStatus) => void)[] = [];
  const acks: ((a: CommandAck) => void)[] = [];
  const progress: ((p: Progress) => void)[] = [];
  let ws: WebSocket | null = null;
  let status: BridgeStatus = 'connecting';
  let dropped = 0;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (s: BridgeStatus): void => {
    if (s === status) return;
    status = s;
    statuses.forEach((cb) => cb(s));
  };
  const open = (): void => {
    ws = new WebSocket(url);
    ws.onopen = () => setStatus('connected');
    ws.onmessage = (e) => {
      let m: unknown;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        dropped++;
        return;
      }
      if (checkDroneState(m) === null) states.forEach((cb) => cb(m as DroneState));
      else if (checkCommandAck(m) === null) acks.forEach((cb) => cb(m as CommandAck));
      else if (checkProgress(m) === null) progress.forEach((cb) => cb(m as Progress));
      else dropped++;
    };
    ws.onclose = () => {
      ws = null;
      if (closed) return;
      setStatus('disconnected');
      retry = setTimeout(open, retryMs);
    };
  };
  open();

  return {
    onState: (cb) => void states.push(cb),
    onStatus: (cb) => void statuses.push(cb),
    onAck: (cb) => void acks.push(cb),
    onProgress: (cb) => void progress.push(cb),
    send: (m) => {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(m));
      return true;
    },
    get status() {
      return status;
    },
    get dropped() {
      return dropped;
    },
    close: () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    },
  };
}
