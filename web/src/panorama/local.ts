// "My photos": your own 360 photos (2:1 equirectangular JPEGs, e.g. from data/panoramas/), read in the browser from a
// folder you pick. Nothing is uploaded anywhere. The position comes from the photo's EXIF GPS, or from a JSON sidecar
// with the same name ({ "lat": .., "lon": .., "heading": .. }). Photos open in Pannellum (MIT, 55 kB, loaded on first use).
import { readJpeg } from './exif';
import { PanoError, chooseNearest, distanceM } from './provider';
import type { Found, OnView, Pano, PanoramaProvider } from './provider';

export type PhotoProblem = 'unreadable' | 'no-gps' | 'too-large' | 'not-360';
export const PROBLEM_TEXT: Record<PhotoProblem, string> = {
  unreadable: 'not a readable JPEG',
  'no-gps': 'no GPS position in the photo and no JSON sidecar with lat and lon',
  'too-large': 'too large to show: wider than this graphics card can draw, or over 60 MB',
  'not-360': 'not a 360 photo: the picture is not twice as wide as it is high',
};
const MAX_BYTES = 60 * 1024 * 1024;

export interface LocalPhoto extends Pano {
  file: File;
}

/** Reads a picked folder: usable photos, and one problem per file that cannot be used. JSON files are only sidecars. */
export async function loadPhotos(files: File[], maxWidth: number): Promise<{ photos: LocalPhoto[]; problems: { name: string; problem: PhotoProblem }[] }> {
  const photos: LocalPhoto[] = [];
  const problems: { name: string; problem: PhotoProblem }[] = [];
  const sidecars = new Map(files.filter((f) => /\.json$/i.test(f.name)).map((f) => [f.name.replace(/\.json$/i, '').toLowerCase(), f]));
  for (const file of files.filter((f) => /\.jpe?g$/i.test(f.name))) {
    if (file.size > MAX_BYTES) {
      problems.push({ name: file.name, problem: 'too-large' });
      continue;
    }
    // the EXIF block and size marker sit near the start: 256 kB is plenty, and keeps big photos out of memory
    const info = readJpeg(await file.slice(0, 256 * 1024).arrayBuffer());
    if (!info || !info.width || !info.height) {
      problems.push({ name: file.name, problem: 'unreadable' });
      continue;
    }
    if (info.width > maxWidth) {
      problems.push({ name: file.name, problem: 'too-large' });
      continue;
    }
    if (Math.abs(info.width / info.height - 2) > 0.02) {
      problems.push({ name: file.name, problem: 'not-360' });
      continue;
    }
    let { lat, lon, heading } = info;
    const side = sidecars.get(file.name.replace(/\.jpe?g$/i, '').toLowerCase());
    if ((lat === undefined || lon === undefined) && side) {
      try {
        const j = JSON.parse(await side.text()) as { lat?: unknown; lon?: unknown; heading?: unknown };
        if (typeof j.lat === 'number' && typeof j.lon === 'number' && Math.abs(j.lat) <= 90 && Math.abs(j.lon) <= 180) {
          lat = j.lat;
          lon = j.lon;
          heading = typeof j.heading === 'number' ? j.heading : heading;
        }
      } catch {
        // a broken sidecar counts as no position
      }
    }
    if (lat === undefined || lon === undefined) {
      problems.push({ name: file.name, problem: 'no-gps' });
      continue;
    }
    photos.push({ id: file.name, lat, lon, heading, capturedAt: info.capturedAt ?? file.lastModified, is360: true, creator: 'you', file });
  }
  return { photos, problems };
}

/** The photos nearest first, with their distance from a point. */
export const byDistance = (photos: LocalPhoto[], lat: number, lon: number): Found[] =>
  photos.map((pano) => ({ pano, distance: distanceM(lat, lon, pano.lat, pano.lon) })).sort((a, b) => a.distance - b.distance);

type PannellumViewer = { on(ev: string, fn: (...a: unknown[]) => void): void; getYaw(): number; destroy(): void };

export function createLocalProvider(photos: LocalPhoto[]): PanoramaProvider {
  let viewer: PannellumViewer | undefined;
  let url = '';
  return {
    name: 'My photos (local)',
    attribution: 'Your own photo, read from this computer, never uploaded',
    async findNearest(lat, lon, radius) {
      return chooseNearest(photos, lat, lon, radius);
    },
    async open(container: HTMLElement, pano: Pano, onView: OnView) {
      const photo = photos.find((p) => p.id === pano.id);
      if (!photo) throw new PanoError('viewer', `no local photo ${pano.id}`);
      await import('pannellum/build/pannellum.js'); // sets window.pannellum
      await import('pannellum/build/pannellum.css');
      const lib = (window as unknown as { pannellum: { viewer(el: HTMLElement, cfg: object): PannellumViewer } }).pannellum;
      url = URL.createObjectURL(photo.file);
      container.replaceChildren();
      const heading = photo.heading ?? 0;
      await new Promise<void>((resolve, reject) => {
        viewer = lib.viewer(container, { type: 'equirectangular', panorama: url, autoLoad: true, compass: photo.heading !== undefined, northOffset: heading, showFullscreenCtrl: false, showZoomCtrl: false }); // the wheel zooms; the buttons would sit under our info bar
        viewer.on('load', () => resolve());
        viewer.on('error', (msg: unknown) => reject(new PanoError('viewer', `Pannellum: ${String(msg)}`)));
      });
      const report = (): void => onView(photo, (((heading + (viewer?.getYaw() ?? 0)) % 360) + 360) % 360);
      viewer?.on('animatefinished', report);
      viewer?.on('mouseup', report);
      report();
    },
    close() {
      viewer?.destroy();
      viewer = undefined;
      if (url) URL.revokeObjectURL(url);
      url = '';
    },
  };
}
