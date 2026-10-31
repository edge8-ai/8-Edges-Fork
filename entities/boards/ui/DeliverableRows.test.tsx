import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Deliverable } from "@/entities/boards/lib/deliverable-types";
import { FileRow, LinkRow, UploadRow } from "./DeliverableRows";
import { DeliverableImageGrid, isTileImage } from "./DeliverableImageGrid";

// Bug hunt K4: what the Deliverables rows tell a screen reader. A static
// render is the row as it is first announced.

const image: Deliverable = {
  id: "d1",
  kind: "file",
  url: null,
  title: null,
  filename: "hero-shot.png",
  mimeType: "image/png",
  sizeBytes: 412 * 1024,
  previewUrl: "https://s/hero",
  addedBy: "Ada Rivers",
  createdAt: "2026-10-04T03:00:00Z",
};

const upload = (phase: "sending" | "checking") =>
  ({ key: "u1", kind: "uploading", name: "teaser.mp4", size: 40 * 1024 * 1024, sent: 40 * 1024 * 1024, source: "file", phase }) as never;

describe("the Deliverables rows to a screen reader (bug hunt K4)", () => {
  it("says an image tile opens full size in a new tab, with what the tile leaves out", () => {
    const out = renderToStaticMarkup(<DeliverableImageGrid images={[image]} onRemove={() => {}} />);
    const tile = out.slice(out.indexOf('class="wb-deliv-image"'), out.indexOf("</a>"));
    expect(tile).toContain('target="_blank"');
    expect(tile).toContain('<span class="wb-deliv-image-name">hero-shot.png</span>');
    expect(tile).toContain('<span class="u-sr-only">, 412 KB · Ada · 4 Oct. Opens full size in a new tab</span>');
    // The name is the text, not an aria-label that would hide it.
    expect(tile).not.toContain("aria-label");
    expect(out).toContain('aria-label="Remove hero-shot.png"');
  });

  it("makes tiles of pictures with a preview and rows of everything else (W.159)", () => {
    const pdf = { ...image, id: "d2", filename: "spec.pdf", mimeType: "application/pdf", previewUrl: null } as Deliverable;
    const unsigned = { ...image, id: "d3", previewUrl: null } as Deliverable;
    const video = { ...image, id: "d4", filename: "teaser.mp4", mimeType: "video/mp4" } as Deliverable;
    expect([image, pdf, unsigned, video].map(isTileImage)).toEqual([true, false, false, false]);
    // An image whose preview could not be signed is a row, with its type.
    expect(renderToStaticMarkup(<FileRow d={unsigned} onOpen={() => {}} onRemove={() => {}} />)).toContain(">PNG<");
  });

  it("says a link opens in a new tab", () => {
    const link = { ...image, kind: "link", url: "https://example.com/brief", filename: null, mimeType: null, title: "Brief" } as Deliverable;
    const out = renderToStaticMarkup(<LinkRow d={link} onRemove={() => {}} />);
    expect(out).toContain('<span class="u-sr-only"> (opens in a new tab)</span></a>');
  });

  it("holds a polite status line that is silent while sending and speaks once the bytes are in", () => {
    const sending = renderToStaticMarkup(<UploadRow u={upload("sending")} onCancel={() => {}} />);
    expect(sending).toContain('<span class="u-sr-only" role="status" aria-live="polite"></span>');
    const checking = renderToStaticMarkup(<UploadRow u={upload("checking")} onCancel={() => {}} />);
    expect(checking).toContain('role="status" aria-live="polite">teaser.mp4 uploaded, checking it</span>');
  });
});
