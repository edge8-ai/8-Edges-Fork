import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Deliverable } from "@/entities/boards/lib/deliverable-types";
import { FileRow, LinkRow, UploadRow } from "./DeliverableRows";

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
  it("says the thumbnail opens full size in a new tab", () => {
    const out = renderToStaticMarkup(<FileRow d={image} onOpen={() => {}} onRemove={() => {}} />);
    const thumb = out.slice(out.indexOf('class="wb-deliv-thumb"'), out.indexOf("</a>"));
    expect(thumb).toContain('target="_blank"');
    expect(thumb).toContain('<span class="u-sr-only">Open hero-shot.png full size, in a new tab</span>');
    // The name is the text, not an aria-label that would hide it.
    expect(thumb).not.toContain("aria-label");
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
