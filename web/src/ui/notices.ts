// Plain on-screen messages. One element per id (#token-missing, #offline, ...), so a message never stacks twice
// and the headless checks can find each one. Text is always set as text, never as HTML.
let host: HTMLElement;

export const initNotices = (el: HTMLElement): void => {
  host = el;
};

export function showNotice(id: string, text: string, kind: 'info' | 'warn' | 'error' = 'warn'): void {
  let n = host.querySelector<HTMLElement>(`#${id}`);
  if (!n) {
    n = document.createElement('div');
    n.id = id;
    host.append(n);
  }
  n.className = `notice ${kind}`;
  n.textContent = text;
}

export const clearNotice = (id: string): void => host.querySelector(`#${id}`)?.remove();
