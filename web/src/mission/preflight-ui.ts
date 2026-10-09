// Pre-flight panel (P3.3.5): shown when take off is asked for and anything is not a pass. A fail blocks take off with its
// reason; warnings need one click on Continue, remembered until the drone is placed again.
import type { Item } from './checklist';

const MARK = { pass: '✓', warn: '!', fail: '✗' } as const;

export function mountPreflight(host: HTMLElement): { gate(items: Item[]): Promise<boolean>; reset(): void } {
  const panel = document.createElement('div');
  panel.id = 'preflight';
  panel.className = 'panel hidden';
  panel.setAttribute('role', 'alertdialog');
  panel.setAttribute('aria-label', 'Pre-flight checklist');
  host.append(panel);
  let acknowledged = false;
  let pending: ((ok: boolean) => void) | null = null;
  const close = (ok: boolean): void => {
    panel.classList.add('hidden');
    pending?.(ok);
    pending = null;
  };
  return {
    gate(items) {
      const fails = items.filter((i) => i.status === 'fail'), warns = items.filter((i) => i.status === 'warn');
      if (!fails.length && (!warns.length || acknowledged)) return Promise.resolve(true);
      pending?.(false); // a newer request replaces an open one
      panel.innerHTML = `<b>Pre-flight checklist</b>
        <ul class="list" id="pf-items">${items.map((i) => `<li class="pf-${i.status}" data-id="${i.id}" data-status="${i.status}"><span class="mono">${MARK[i.status]}</span> ${i.label}: <span class="muted">${i.reason}</span></li>`).join('')}</ul>
        <div class="row">${fails.length ? `<span id="pf-blocked">Take off blocked: ${fails.map((f) => f.reason).join('; ')}.</span>` : '<button class="btn" id="pf-continue">Continue with warnings</button>'}<button class="btn" id="pf-close">Close</button></div>`;
      panel.classList.remove('hidden');
      return new Promise((res) => {
        pending = res;
        panel.querySelector('#pf-close')!.addEventListener('click', () => close(false));
        panel.querySelector('#pf-continue')?.addEventListener('click', () => ((acknowledged = true), close(true)));
      });
    },
    reset: () => void (acknowledged = false),
  };
}
