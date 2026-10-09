import { describe, expect, it } from 'vitest';
import { jpegHeader, withExif } from '../../e2e/jpeg-fixtures.mjs';
import { readJpeg } from './exif';
import { byDistance, loadPhotos } from './local';

const buf = (u: Uint8Array): ArrayBuffer => u.slice().buffer;
const file = (name: string, bytes: Uint8Array | string): File => new File([typeof bytes === 'string' ? bytes : buf(bytes)], name);
const PUSHKAR = { lat: 26.4897, lon: 74.5511 };

describe('readJpeg: size, GPS, direction and time from a JPEG', () => {
  it('reads a north/east position, the compass direction and the capture time', () => {
    const info = readJpeg(buf(withExif(jpegHeader(4096, 2048), { ...PUSHKAR, heading: 123.4, taken: '2024:03:14 09:30:00' })));
    expect(info).toMatchObject({ width: 4096, height: 2048, heading: 123.4, capturedAt: Date.UTC(2024, 2, 14, 9, 30) });
    expect(info!.lat).toBeCloseTo(26.4897, 6);
    expect(info!.lon).toBeCloseTo(74.5511, 6);
  });
  it('south and west come out negative', () => {
    const info = readJpeg(buf(withExif(jpegHeader(4096, 2048), { lat: -33.8568, lon: -151.2153 })));
    expect(info!.lat).toBeCloseTo(-33.8568, 6);
    expect(info!.lon).toBeCloseTo(-151.2153, 6);
  });
  it('a JPEG without EXIF has a size but no position; something else is not a JPEG', () => {
    expect(readJpeg(buf(jpegHeader(800, 400)))).toEqual({ width: 800, height: 400 });
    expect(readJpeg(buf(new TextEncoder().encode('not a picture')))).toBeUndefined();
  });
});

describe('loadPhotos: a picked folder', () => {
  it('keeps usable 360 photos (EXIF or JSON sidecar) and names the problem of every other file', async () => {
    const files = [
      file('a.jpg', withExif(jpegHeader(4096, 2048), { lat: 26.4899, lon: 74.5511, heading: 90 })),
      file('b.jpg', jpegHeader(4096, 2048)),
      file('b.json', JSON.stringify({ lat: 26.4905, lon: 74.5511, heading: 10 })),
      file('c.jpg', jpegHeader(4096, 2048)),
      file('d.jpg', 'garbage, not a JPEG'),
      file('e.jpg', jpegHeader(20000, 10000)),
      file('f.jpg', jpegHeader(4000, 3000)),
      file('notes.txt', 'ignored'),
    ];
    const { photos, problems } = await loadPhotos(files, 16384);
    expect(photos.map((p) => [p.id, p.heading])).toEqual([['a.jpg', 90], ['b.jpg', 10]]);
    expect(problems).toEqual([
      { name: 'c.jpg', problem: 'no-gps' },
      { name: 'd.jpg', problem: 'unreadable' },
      { name: 'e.jpg', problem: 'too-large' },
      { name: 'f.jpg', problem: 'not-360' },
    ]);
    const near = byDistance(photos, PUSHKAR.lat, PUSHKAR.lon);
    expect(near.map((f) => f.pano.id)).toEqual(['a.jpg', 'b.jpg']);
    expect(near[0].distance).toBeCloseTo(22, 0);
  });
});
