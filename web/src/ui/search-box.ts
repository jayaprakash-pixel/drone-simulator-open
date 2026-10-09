import { TOWN_RANGE } from '../globe/camera';
import { createSearch } from '../globe/search';
import type { Place } from '../globe/search';
import type { Globe } from '../globe/viewer';
import { button, useOsmCredit } from './layout';
import { clearNotice, showNotice } from './notices';
import { allPlaces, onPlaces, removeUserPlace } from './places';

/**
 * Top-left panel: search box (Enter searches the world) and a left-hand places drawer that opens with the Places button
 * or a click in the search box, scrolls, and narrows as you type. Every place has Fly drone: fly there and place the
 * simulator drone (`flyDrone`; progress in the drawer).
 */
export function mountSearchBox(tl: HTMLElement, globe: Globe, flyDrone?: (lat: number, lon: number, out: HTMLElement) => void): void {
  const search = createSearch();
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.id = 'search-panel';
  const row = document.createElement('div');
  row.className = 'row';
  const input = document.createElement('input');
  input.id = 'search';
  input.className = 'in';
  input.placeholder = 'Search a place, press Enter';
  input.autocomplete = 'off';
  const results = document.createElement('ul');
  results.id = 'search-results';
  results.className = 'list hidden';
  const drawer = document.createElement('div');
  drawer.id = 'places-drawer';
  drawer.className = 'panel hidden';
  const progress = document.createElement('div');
  progress.id = 'drawer-progress';
  progress.className = 'muted';
  const placesList = document.createElement('ul');
  placesList.id = 'places-list';
  placesList.className = 'list';
  drawer.append(progress, placesList);
  const open = (on: boolean): void => void drawer.classList.toggle('hidden', !on);
  row.append(input, button('Places', 'places-toggle', () => open(drawer.classList.contains('hidden'))));
  panel.append(row, results);
  tl.append(panel);
  document.getElementById('ui')!.append(drawer);
  input.addEventListener('focus', () => open(true));
  input.addEventListener('input', () => renderPlaces());

  const showResults = (places: Place[], q: string): void => {
    results.replaceChildren(
      ...places.map((p) => {
        const li = document.createElement('li');
        li.append(
          button(p.kind ? `${p.name} · ${p.kind}` : p.name, '', () => {
            results.classList.add('hidden');
            // a place node's box is a nominal square (about 35 km): frame it as a town; areas keep their bounding box
            void (p.point ? globe.flyToPlace(p.lat, p.lon, TOWN_RANGE) : globe.flyToBox(p.bbox));
          }),
        );
        return li;
      }),
    );
    results.classList.toggle('hidden', places.length === 0);
    useOsmCredit('search', places.length > 0);
    if (places.length === 0) showNotice('no-results', `No places found for "${q}". Try a different spelling or a bigger place nearby.`, 'info');
  };

  // search on Enter only: the public Nominatim server does not allow search-as-you-type
  input.addEventListener('keydown', async (ev) => {
    if (ev.key === 'Escape') return open(false);
    if (ev.key !== 'Enter' || !input.value.trim()) return;
    open(false); // the world results show under the box
    clearNotice('no-results');
    clearNotice('search-failed');
    try {
      const places = await search(input.value);
      if (places) showResults(places, input.value.trim());
    } catch {
      showNotice('search-failed', 'Place search failed (no internet, or the free service is busy). Try again in a moment.', 'error');
    }
  });

  const renderPlaces = (): void => {
    const items: HTMLElement[] = [];
    let group = '';
    const q = input.value.trim().toLowerCase();
    for (const p of allPlaces().filter((p) => !q || `${p.name} ${p.group ?? ''}`.toLowerCase().includes(q))) {
      const g = p.group ?? 'Your places';
      if (g !== group) {
        group = g;
        const h = document.createElement('li');
        h.className = 'muted places-group';
        h.textContent = g;
        items.push(h);
      }
      const li = document.createElement('li');
      li.className = 'row';
      li.append(button(p.name, '', () => void globe.flyToPlace(p.lat, p.lon, p.height)));
      if (flyDrone) li.append(button('Fly drone', '', () => flyDrone(p.lat, p.lon, progress)));
      if (p.user) li.append(button('×', '', () => removeUserPlace(p)));
      items.push(li);
    }
    if (!items.length) items.push(Object.assign(document.createElement('li'), { className: 'muted', textContent: 'No saved place matches. Press Enter to search the world.' }));
    placesList.replaceChildren(...items);
  };
  onPlaces(renderPlaces);
  renderPlaces();
}
