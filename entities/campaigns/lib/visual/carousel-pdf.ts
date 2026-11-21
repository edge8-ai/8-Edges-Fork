import { deflateSync } from "node:zlib";
import { decodePng } from "./brand-grade";

// A LinkedIn carousel: the slides of one image set as one PDF, a page per
// slide, which LinkedIn shows as a swipeable document post (Marketing, 19 Nov:
// made with the images, no button of its own). Written here rather than with
// a PDF library: a page is one RGB image drawn full-bleed, which is a few
// objects of plain PDF 1.4, and the app gains no dependency.
//
// Each page is the slide's own pixel size in points (1080 x 1350 for
// LinkedIn), so the PDF keeps the slides' exact shape. Cards are opaque, so
// any alpha the renderer wrote is dropped.

export function carouselPdf(slides: Buffer[]): Buffer {
  if (!slides.length) throw new Error("A carousel needs at least one slide.");
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    parts.push(buf);
    length += buf.length;
  };
  // Object n's byte offset, for the cross-reference table.
  const open = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  // 1: catalog, 2: page tree; then per slide: page, contents, image.
  const pageIds = slides.map((_, i) => 3 + i * 3);
  open(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  open(2);
  push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${slides.length} >>\nendobj\n`);

  slides.forEach((png, i) => {
    const { width, height, rgb } = decodePng(png);
    const [page, contents, image] = [pageIds[i], pageIds[i] + 1, pageIds[i] + 2];
    const draw = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    const pixels = deflateSync(rgb);

    open(page);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${contents} 0 R >>\nendobj\n`);
    open(contents);
    push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`);
    open(image);
    push(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`);
    push(pixels);
    push("\nendstream\nendobj\n");
  });

  const count = 3 + slides.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}
