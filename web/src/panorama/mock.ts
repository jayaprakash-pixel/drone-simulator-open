// A stand-in provider for the checks and for use before a Mapillary token exists (?pano=mock). Images are made up
// around whatever point is asked about; `scenario` picks what the search finds:
//   near   a 360 panorama 40 m away (a flat photo 20 m away loses to it) and a second panorama 30 m beyond
//   far    nothing within 100 m; the nearest panorama is 640 m away
//   empty  nothing within 1 km
import { chooseNearest } from './provider';
import type { Found, OnView, Pano, PanoramaProvider } from './provider';

export type MockScenario = 'near' | 'far' | 'empty';

const shift = (lat: number, lon: number, east: number, north: number): { lat: number; lon: number } => ({
  lat: lat + north / 111_320,
  lon: lon + east / (111_320 * Math.cos((lat * Math.PI) / 180)),
});

export function createMockProvider(scenario: MockScenario = 'near'): PanoramaProvider & { panos: Pano[] } {
  const made = Date.UTC(2023, 2, 14);
  let panos: Pano[] = [];
  let shown: { el: HTMLElement; pano: Pano; bearing: number } | undefined;

  const provider = {
    name: 'Mock provider (test data)',
    attribution: 'Test data, not a real image',
    get panos() {
      return panos;
    },
    async findNearest(lat: number, lon: number, radius: number): Promise<Found | undefined> {
      const a = shift(lat, lon, 28.28, 28.28);
      const b = shift(a.lat, a.lon, 0, 30);
      const f = shift(lat, lon, 0, -20);
      const far = shift(lat, lon, 640, 0);
      const pano = (id: string, p: { lat: number; lon: number }, is360 = true): Pano => ({ id, ...p, capturedAt: made, is360, heading: 0, creator: 'mock-user' });
      panos =
        scenario === 'near' ? [pano('mock-a', a), pano('mock-b', b), pano('mock-flat', f, false)]
        : scenario === 'far' ? [pano('mock-far', far)]
        : [];
      return chooseNearest(panos, lat, lon, radius);
    },
    async countNear() {
      return scenario === 'near' ? { pano: 2, any: 3, capped: false } : { pano: 0, any: 0, capped: false };
    },
    async panosIn([w, s, e, n]: [number, number, number, number]) {
      // 'near': one 360 in the middle of every box asked for; other scenarios: none
      return scenario === 'near' ? [{ lat: (s + n) / 2, lon: (w + e) / 2 }] : [];
    },
    async open(container: HTMLElement, pano: Pano, onView: OnView): Promise<void> {
      container.innerHTML = `
        <div class="mock-pano">
          <p>Mock panorama <b id="mock-id"></b>: test data, not a real image.</p>
          <div class="row"><button class="btn" id="mock-next">Next image</button><button class="btn" id="mock-turn">Turn 30°</button></div>
        </div>`;
      shown = { el: container, pano, bearing: pano.heading ?? 0 };
      const report = (): void => {
        if (!shown) return;
        container.querySelector('#mock-id')!.textContent = shown.pano.id;
        onView(shown.pano, shown.bearing);
      };
      container.querySelector('#mock-next')!.addEventListener('click', () => {
        const i = panos.findIndex((p) => p.id === shown?.pano.id);
        if (shown && panos.length > 1) shown.pano = panos[(i + 1) % panos.length];
        report();
      });
      container.querySelector('#mock-turn')!.addEventListener('click', () => {
        if (shown) shown.bearing = (shown.bearing + 30) % 360;
        report();
      });
      report();
    },
    close(): void {
      shown?.el.replaceChildren();
      shown = undefined;
    },
  };
  return provider;
}
