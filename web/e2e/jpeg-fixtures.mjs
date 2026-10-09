// Test photos for "My photos" (P1.9.4): adds an EXIF block (GPS position, compass direction, capture time) to a JPEG, and
// makes a header-only JPEG of any pixel size. Used by the unit tests and e2e/myphotos.mjs; nothing here ships in the app.

/** Returns a copy of `jpeg` (a Uint8Array starting FFD8) with an APP1 EXIF block right after the start marker. */
export function withExif(jpeg, { lat, lon, heading, taken } = {}) {
  const b = new DataView(new ArrayBuffer(198)); // little-endian TIFF, layout fixed below
  const u16 = (o, x) => b.setUint16(o, x, true);
  const u32 = (o, x) => b.setUint32(o, x, true);
  const entry = (o, tag, type, count, value) => { u16(o, tag); u16(o + 2, type); u32(o + 4, count); u32(o + 8, value); };
  b.setUint8(0, 0x49); b.setUint8(1, 0x49); u16(2, 42); u32(4, 8); // "II", 42, IFD0 at 8
  u16(8, 2); entry(10, 0x8769, 4, 1, 38); entry(22, 0x8825, 4, 1, 76); u32(34, 0); // IFD0: Exif IFD at 38, GPS IFD at 76
  u16(38, 1); entry(40, 0x9003, 2, 20, 56); u32(52, 0); // Exif IFD: DateTimeOriginal at 56
  const t = taken ?? '2024:03:14 09:30:00';
  for (let i = 0; i < 19; i++) b.setUint8(56 + i, t.charCodeAt(i));
  u16(76, 5); // GPS IFD
  entry(78, 0x0001, 2, 2, (lat ?? 0) < 0 ? 0x53 : 0x4e); // "N"/"S", inline
  entry(90, 0x0002, 5, 3, 142);
  entry(102, 0x0003, 2, 2, (lon ?? 0) < 0 ? 0x57 : 0x45); // "E"/"W", inline
  entry(114, 0x0004, 5, 3, 166);
  entry(126, 0x0011, 5, 1, 190);
  u32(138, 0);
  const dms = (o, x) => {
    const a = Math.abs(x); const d = Math.floor(a); const m = Math.floor((a - d) * 60); const s = Math.round(((a - d) * 60 - m) * 60 * 10000);
    [[d, 1], [m, 1], [s, 10000]].forEach(([n, den], i) => { u32(o + i * 8, n); u32(o + i * 8 + 4, den); });
  };
  dms(142, lat ?? 0);
  dms(166, lon ?? 0);
  u32(190, Math.round((heading ?? 0) * 100)); u32(194, 100);
  const tiff = new Uint8Array(b.buffer);
  const app1 = new Uint8Array(4 + 6 + tiff.length);
  app1.set([0xff, 0xe1, ((app1.length - 2) >> 8) & 0xff, (app1.length - 2) & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  app1.set(tiff, 10);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, 2));
  out.set(app1, 2);
  out.set(jpeg.subarray(2), 2 + app1.length);
  return out;
}

/** A JPEG header (start marker plus a start-of-frame segment) claiming `width` x `height` pixels, with no image data. */
export function jpegHeader(width, height) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}
