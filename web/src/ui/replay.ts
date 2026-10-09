// Replay a flight log (P3.1.2): load a .jsonl written by the bridge (bridge/logger.py), scrub with the slider or play at
// 0.5x to 4x; the drone is drawn at the log's position for the slider time (interpolated between samples). Open with ?replay.
import type { DroneState } from '../net/contract';

export type Sample = { ms: number; s: DroneState };

export function parseLog(text: string): Sample[] {
  const out: Sample[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { t: string; type: string; state?: DroneState };
    if (r.type === 'sample' && r.state) out.push({ ms: Date.parse(r.t), s: r.state });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number): number => (a + ((((b - a) % 360) + 540) % 360 - 180) * k + 360) % 360;

/** The state at `ms` after the first sample, linear between the two samples around it. */
export function stateAt(samples: Sample[], ms: number): DroneState {
  const t = samples[0].ms + ms;
  let i = samples.findIndex((x) => x.ms > t);
  if (i === -1) return samples[samples.length - 1].s;
  if (i === 0) return samples[0].s;
  const a = samples[i - 1], b = samples[i];
  const k = (t - a.ms) / (b.ms - a.ms);
  return {
    ...a.s,
    lat: lerp(a.s.lat, b.s.lat, k), lon: lerp(a.s.lon, b.s.lon, k), altMsl: lerp(a.s.altMsl, b.s.altMsl, k), altAgl: lerp(a.s.altAgl, b.s.altAgl, k),
    headingDeg: lerpAngle(a.s.headingDeg, b.s.headingDeg, k), pitchDeg: lerp(a.s.pitchDeg, b.s.pitchDeg, k), rollDeg: lerp(a.s.rollDeg, b.s.rollDeg, k),
  };
}

export function mountReplay(host: HTMLElement, show: (s: DroneState) => void): void {
  const panel = document.createElement('div');
  panel.id = 'replay';
  panel.className = 'panel';
  panel.innerHTML = `<b>Replay a flight log</b>
    <div class="row"><input type="file" id="replay-file" accept=".jsonl"></div>
    <div id="replay-controls" class="hidden">
      <input type="range" id="replay-slider" min="0" step="1" value="0" style="width:100%">
      <div class="row"><button class="btn" id="replay-play">Play</button>
        <label>Speed <select id="replay-speed"><option>0.5</option><option selected>1</option><option>2</option><option>4</option></select></label>
        <span id="replay-time" class="mono"></span></div>
    </div>`;
  host.append(panel);
  const el = <T extends HTMLElement>(id: string): T => panel.querySelector<T>(`#${id}`)!;
  const slider = el<HTMLInputElement>('replay-slider');
  let samples: Sample[] = [];
  let raf = 0;

  const goTo = (ms: number): void => {
    slider.value = String(Math.round(ms));
    el('replay-time').textContent = `${(ms / 1000).toFixed(1)} / ${(Number(slider.max) / 1000).toFixed(1)} s`;
    show(stateAt(samples, ms));
  };
  const stop = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    el('replay-play').textContent = 'Play';
  };
  el<HTMLInputElement>('replay-file').addEventListener('change', async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    samples = parseLog(await f.text());
    if (samples.length < 2) return void (el('replay-time').textContent = 'No samples in this file.');
    slider.max = String(samples[samples.length - 1].ms - samples[0].ms);
    el('replay-controls').classList.remove('hidden');
    stop();
    goTo(0);
  });
  slider.addEventListener('input', () => goTo(Number(slider.value)));
  el('replay-play').addEventListener('click', () => {
    if (raf) return stop();
    if (Number(slider.value) >= Number(slider.max)) goTo(0);
    el('replay-play').textContent = 'Pause';
    panel.dataset.started = String(performance.now());
    let last = performance.now();
    const tick = (now: number): void => {
      const ms = Math.min(Number(slider.max), Number(slider.value) + (now - last) * Number(el<HTMLSelectElement>('replay-speed').value));
      last = now;
      goTo(ms);
      if (ms >= Number(slider.max)) {
        panel.dataset.ended = String(performance.now());
        return stop();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
