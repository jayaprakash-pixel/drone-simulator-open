/** The screen regions of the plan's layout (p.7): corners, a right-hand detail panel, notices and the attribution bar. */
export interface Regions {
  tl: HTMLElement;
  tr: HTMLElement;
  bl: HTMLElement;
  br: HTMLElement;
  side: HTMLElement;
  notices: HTMLElement;
  /** where Cesium draws its own data credits and logos */
  cesiumCredits: HTMLElement;
}

/** On screen and on every exported file (P3.4.2); the same words as bridge/export.py NOTICE. */
export const REHEARSAL_NOTICE = 'Rehearsal tool only: not a substitute for pre-flight checks or legal permission to fly.';

export function mountLayout(root: HTMLElement): Regions {
  const make = (cls: string, id: string): HTMLElement => {
    const d = document.createElement('div');
    d.id = id;
    d.className = cls;
    root.append(d);
    return d;
  };
  // bottom bar, always on screen: the rehearsal-only notice, OpenStreetMap credit (when its data is shown), Cesium's credits
  const credits = make('credits', 'credits');
  const rehearsal = document.createElement('span');
  rehearsal.id = 'rehearsal-notice';
  rehearsal.textContent = REHEARSAL_NOTICE;
  const osm = document.createElement('span');
  osm.id = 'osm-credit';
  osm.className = 'hidden';
  osm.textContent = 'Search and street map data © OpenStreetMap contributors';
  const cesiumCredits = document.createElement('div');
  cesiumCredits.id = 'cesium-credits';
  const inline = document.createElement('div'); // the provider list, mirrored from Cesium's popup (see credits.ts)
  inline.id = 'credits-inline';
  const bnote = document.createElement('span');
  bnote.id = 'buildings-note';
  bnote.className = 'hidden';
  bnote.textContent = 'Buildings are approximate: most have no mapped height (drawn at 3 m per level), and trees, poles and wires are missing. Do not use for clearance.';
  credits.append(rehearsal, bnote, osm, cesiumCredits, inline);
  // the bar grows when a long credit (EOX) wraps: the bottom corners follow its real height instead of a fixed one
  new ResizeObserver(() => document.documentElement.style.setProperty('--credits-h', `${credits.offsetHeight}px`)).observe(credits);
  // notices and the selection panel live inside the corner columns, stacked with the other panels, so nothing can overlap
  const tl = make('region tl', 'tl');
  const notices = document.createElement('div');
  notices.id = 'notices';
  notices.className = 'notices';
  tl.append(notices);
  const tr = make('region tr', 'tr');
  const side = document.createElement('div');
  side.id = 'side';
  side.className = 'side hidden';
  tr.append(side);
  const br = make('region br', 'br');
  // the right-hand column (selected point, controls) stops above the bottom-right panels and scrolls if it must
  new ResizeObserver(() => document.documentElement.style.setProperty('--br-h', `${br.offsetHeight}px`)).observe(br);
  return { tl, tr, bl: make('region bl', 'bl'), br, side, notices, cesiumCredits };
}

const osmUse = new Set<string>();
/** Shows the OpenStreetMap credit while any OSM-derived data (search results, the streets layer) is on screen. */
export function useOsmCredit(reason: 'search' | 'streets', on: boolean): void {
  if (on) osmUse.add(reason);
  else osmUse.delete(reason);
  document.getElementById('osm-credit')?.classList.toggle('hidden', osmUse.size === 0);
}

/** Shows the buildings disclaimer in the always-visible bottom bar whenever 3D buildings are drawn (owner decision 2026-10-08). */
export function buildingsNote(on: boolean): void {
  document.getElementById('buildings-note')?.classList.toggle('hidden', !on);
}

/** A button that works with the dark panels. */
export function button(text: string, id: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.id = id;
  b.className = 'btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
