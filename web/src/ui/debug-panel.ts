// Bridge debug panel (P2A.3.1): connection status, states per second and the latest raw DroneState.
import type { BridgeClient } from '../net/client';

export function mountDebugPanel(host: HTMLElement, client: BridgeClient): void {
  const panel = document.createElement('div');
  panel.id = 'bridge-debug';
  panel.className = 'panel';
  panel.innerHTML = '<div class="bridge-head">Bridge: <b id="bridge-status"></b> <span id="bridge-rate"></span></div><pre id="bridge-raw"></pre>';
  host.append(panel);
  const status = panel.querySelector<HTMLElement>('#bridge-status')!;
  const rate = panel.querySelector<HTMLElement>('#bridge-rate')!;
  const raw = panel.querySelector<HTMLElement>('#bridge-raw')!;

  const show = (s: string): void => {
    status.textContent = s;
    status.dataset.state = s;
  };
  show(client.status);
  client.onStatus(show);
  let n = 0;
  client.onState((s) => {
    n++;
    raw.textContent = JSON.stringify(s, null, 1);
  });
  setInterval(() => {
    rate.textContent = client.status === 'connected' ? `${n} states/s` : '';
    n = 0;
  }, 1000);
}
