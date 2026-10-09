// Just enough JPEG/EXIF reading for "My photos": pixel size (SOF marker), GPS position, compass direction and capture
// time (EXIF). Big- and little-endian TIFF both occur in camera files. Returns undefined fields rather than throwing on
// odd files; a buffer that is not a JPEG at all gives undefined.

export interface JpegInfo {
  width?: number;
  height?: number;
  lat?: number;
  lon?: number;
  /** GPSImgDirection: compass direction of the image centre, degrees */
  heading?: number;
  /** DateTimeOriginal as milliseconds since 1970, read as UTC (EXIF stores no time zone) */
  capturedAt?: number;
}

export function readJpeg(buf: ArrayBuffer): JpegInfo | undefined {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return undefined; // no JPEG start-of-image marker
  const info: JpegInfo = {};
  let p = 2;
  while (p + 4 <= v.byteLength && v.getUint8(p) === 0xff) {
    const marker = v.getUint8(p + 1);
    const len = v.getUint16(p + 2);
    if (marker === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) readExif(v, p + 10, info); // "Exif"
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && p + 9 <= v.byteLength) {
      info.height = v.getUint16(p + 5);
      info.width = v.getUint16(p + 7);
      break; // start of frame: the size is all that is needed from the image data
    }
    if (marker === 0xda || len < 2) break; // image data starts, or a broken segment
    p += 2 + len;
  }
  return info;
}

function readExif(v: DataView, tiff: number, info: JpegInfo): void {
  try {
    const le = v.getUint16(tiff) === 0x4949; // "II" little-endian, "MM" big-endian
    const u16 = (o: number): number => v.getUint16(tiff + o, le);
    const u32 = (o: number): number => v.getUint32(tiff + o, le);
    const rational = (o: number): number => u32(o) / (u32(o + 4) || 1);
    const ascii = (o: number, n: number): string => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(tiff + o + i))).replace(/\0.*$/, '');
    // entries of an IFD as tag -> [type, count, value-or-offset position]
    const ifd = (o: number): Map<number, [number, number, number]> => {
      const m = new Map<number, [number, number, number]>();
      const n = u16(o);
      for (let i = 0; i < n; i++) {
        const e = o + 2 + i * 12;
        const type = u16(e + 2);
        const count = u32(e + 4);
        const size = ([0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] ?? 1) * count;
        m.set(u16(e), [type, count, size > 4 ? u32(e + 8) : e + 8]);
      }
      return m;
    };
    const ifd0 = ifd(u32(4));
    const exifAt = ifd0.get(0x8769);
    if (exifAt) {
      const dto = ifd(u32(exifAt[2])).get(0x9003); // DateTimeOriginal "YYYY:MM:DD HH:MM:SS"
      const m = dto && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(ascii(dto[2], dto[1]));
      if (m) info.capturedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    }
    const gpsAt = ifd0.get(0x8825);
    if (!gpsAt) return;
    const g = ifd(u32(gpsAt[2]));
    const dms = (tag: number): number | undefined => {
      const e = g.get(tag);
      return e && e[1] >= 3 ? rational(e[2]) + rational(e[2] + 8) / 60 + rational(e[2] + 16) / 3600 : undefined;
    };
    const ref = (tag: number): string => {
      const e = g.get(tag);
      return e ? String.fromCharCode(v.getUint8(tiff + e[2])) : '';
    };
    const lat = dms(0x0002);
    const lon = dms(0x0004);
    if (lat !== undefined && lon !== undefined && (lat !== 0 || lon !== 0)) {
      info.lat = ref(0x0001) === 'S' ? -lat : lat;
      info.lon = ref(0x0003) === 'W' ? -lon : lon;
    }
    const dir = g.get(0x0011);
    if (dir) info.heading = rational(dir[2]);
  } catch {
    // a broken EXIF block: keep whatever was read
  }
}
