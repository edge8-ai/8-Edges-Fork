import { crc32, deflateSync, inflateSync } from "node:zlib";

// A small PNG codec, and the brand colour pass it was written for.
//
// decodePng and encodePng are what the code still uses: the carousel PDF reads
// the drawn slides with them, and the renderers' tests read their output. No
// image library: PNG is decoded and encoded with node:zlib, 8-bit RGB and RGBA,
// non-interlaced, which is what next/og writes.
//
// brandGrade mapped a painted picture's pixels onto a look's colour ramp by
// brightness, because the image model drifted from the brand's colours. Since
// R3.350 no picture is painted by a model (the sets and the hero are drawn in
// the brand's own colours), so it has no caller outside its own test.

type Rgb = [number, number, number];
type Image = { width: number; height: number; rgb: Buffer };

const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const rgbToHex = ([r, g, b]: Rgb) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export function decodePng(png: Buffer): Image {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG.");
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const name = png.toString("ascii", pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (name === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    if (name === "IDAT") idat.push(data);
    if (name === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 2 && type !== 6)) throw new Error(`Unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace}).`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(height * stride);
  for (let y = 0, p = 0; y < height; y++) {
    const filter = raw[p++], row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y > 0 ? px[prev + x] : 0;
      const c = x >= bpp && y > 0 ? px[prev + x - bpp] : 0;
      let v = raw[p + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255;
    }
    p += stride;
  }
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) { rgb[i * 3] = px[j]; rgb[i * 3 + 1] = px[j + 1]; rgb[i * 3 + 2] = px[j + 2]; }
  return { width, height, rgb };
}

export function encodePng({ width, height, rgb }: Image): Buffer {
  const stride = width * 3, raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (name: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(name, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function percentile(values: number[], p: number): number {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

function medianHex(img: Image, keep: (x: number, y: number, i: number) => boolean): string {
  const ch: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 3;
    if (keep(x, y, i)) for (let k = 0; k < 3; k++) ch[k].push(img.rgb[i + k]);
  }
  return rgbToHex(ch.map((c) => c.sort((a, b) => a - b)[c.length >> 1] ?? 0) as Rgb);
}

export type GradeResult = {
  png: Buffer;
  stops: { ground: number; accent: number; highlight: number };
  before: { ground: string; accent: string };
  after: { ground: string; accent: string };
};

export function brandGrade(
  png: Buffer,
  colours: { ground: string; accent: string; highlight: string },
  // Share of the height, from the top, that the look keeps for its words; and
  // the logo corner, as shares of width and height.
  reserved: { top: number; logo: { width: number; height: number } },
): GradeResult {
  const img = decodePng(png);
  const { width, height, rgb } = img;
  const G = hexToRgb(colours.ground), A = hexToRgb(colours.accent), H = hexToRgb(colours.highlight);
  const L = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) L[i] = lum(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);

  // The reserved band sets the ground level; the accent level comes from the
  // strongly blue pixels in the lower right, where the look puts its accent.
  const inBand = (_x: number, y: number) => y < reserved.top * height;
  const isAccent = (x: number, y: number, i: number) => x > 0.5 * width && y > 0.65 * height && rgb[i + 2] - rgb[i] > 60;
  const bandL: number[] = [], accentL: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (inBand(x, y)) bandL.push(L[i]);
    if (isAccent(x, y, i * 3)) accentL.push(L[i]);
  }
  const ground = percentile(bandL, 0.95);
  let accent = accentL.length ? percentile(accentL, 0.5) : ground + 0.25;
  if (accent <= ground + 0.05) accent = ground + 0.2;
  let highlight = percentile(Array.from(L), 0.995);
  if (highlight <= accent + 0.05) highlight = Math.min(1, accent + 0.3);

  const before = { ground: medianHex(img, (x, y) => inBand(x, y)), accent: medianHex(img, isAccent) };

  const out = Buffer.alloc(rgb.length);
  const mix = (a: Rgb, b: Rgb, t: number) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
  for (let i = 0; i < width * height; i++) {
    const l = L[i];
    const c = l <= ground ? G : l <= accent ? mix(G, A, (l - ground) / (accent - ground)) : l <= highlight ? mix(A, H, (l - accent) / (highlight - accent)) : H;
    out[i * 3] = Math.round(c[0]); out[i * 3 + 1] = Math.round(c[1]); out[i * 3 + 2] = Math.round(c[2]);
  }
  const paint = (w: number, h: number) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * width + x) * 3; out[i] = G[0]; out[i + 1] = G[1]; out[i + 2] = G[2]; }
  };
  paint(width, Math.round(reserved.top * height));
  paint(Math.round(reserved.logo.width * width), Math.round(reserved.logo.height * height));

  const graded = { width, height, rgb: out };
  return {
    png: encodePng(graded),
    stops: { ground, accent, highlight },
    before,
    // The same pixels as "before", classified on the original art.
    after: { ground: medianHex(graded, (x, y) => inBand(x, y)), accent: medianHex(graded, (x, y, i) => isAccent(x, y, i) && rgb[i + 2] - rgb[i] > 60) },
  };
}
