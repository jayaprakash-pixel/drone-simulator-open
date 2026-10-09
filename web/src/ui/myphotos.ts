import { PROBLEM_TEXT, byDistance, createLocalProvider, loadPhotos } from '../panorama/local';
import type { LocalPhoto } from '../panorama/local';
import type { PanoramaUi } from './panorama';
import { button } from './layout';

const metres = (m: number): string => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** The widest image this graphics card can hold as one texture: a 360 photo wider than this cannot be shown. */
function maxTextureWidth(): number {
  const gl = document.createElement('canvas').getContext('webgl');
  const n = gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 4096;
  gl?.getExtension('WEBGL_lose_context')?.loseContext(); // give the context straight back
  return n;
}

/**
 * "My photos": pick a folder of your own 360 photos (data/panoramas/ by convention). They are read in this browser
 * only and listed nearest first from the selected point; each opens in the same full-screen view as Mapillary images.
 * Files that cannot be used are listed with their reason. The chosen folder lasts for this page view.
 */
export function mountMyPhotos(pano: PanoramaUi): (lat: number, lon: number, out: HTMLElement) => void {
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'myphotos-input';
  input.multiple = true;
  input.accept = '.jpg,.jpeg,.json';
  input.webkitdirectory = true;
  input.hidden = true;
  document.body.append(input);
  let photos: LocalPhoto[] | undefined;
  let problems: { name: string; problem: keyof typeof PROBLEM_TEXT }[] = [];
  let at: { lat: number; lon: number; out: HTMLElement } = { lat: 0, lon: 0, out: document.createElement('div') };

  const render = (): void => {
    const { lat, lon, out } = at;
    const box = document.createElement('div');
    box.id = 'myphotos';
    const head = document.createElement('p');
    head.textContent = photos?.length ? `My photos, nearest first (${photos.length}, read from this computer only):` : 'No usable 360 photos in that folder.';
    const list = document.createElement('ul');
    list.className = 'list';
    if (photos?.length) {
      const provider = createLocalProvider(photos);
      byDistance(photos, lat, lon).forEach((found, i) => {
        const li = document.createElement('li');
        li.append(button(`${found.pano.id} · ${metres(found.distance)}`, `myphoto-open-${i}`, () => void pano.openFrom(provider, found, lat, lon)));
        list.append(li);
      });
    }
    for (const p of problems) {
      const li = document.createElement('li');
      li.className = `muted myphotos-problem-${p.problem}`;
      li.textContent = `${p.name}: ${PROBLEM_TEXT[p.problem]}`;
      list.append(li);
    }
    box.append(head, list, button('Choose another folder', 'myphotos-choose', () => input.click()));
    out.replaceChildren(box);
  };

  input.addEventListener('change', async () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    at.out.replaceChildren('Reading your photos…');
    ({ photos, problems } = await loadPhotos(files, maxTextureWidth()));
    render();
  });

  return (lat, lon, out) => {
    at = { lat, lon, out };
    if (photos) render();
    else input.click();
  };
}
