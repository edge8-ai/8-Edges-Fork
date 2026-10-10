import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoRow, clockTime, mayRefreshPreview } from "./DeliverableVideoRow";
import type { Deliverable } from "@/entities/boards/lib/deliverable-types";

// W.156: a video deliverable plays in the card. A static render is the row at
// rest: the tile that opens the player, and the words the canvas uses.

const video: Deliverable = {
  id: "v1",
  kind: "file",
  url: null,
  title: null,
  filename: "teaser-cut-v2.mp4",
  mimeType: "video/mp4",
  sizeBytes: 38 * 1024 * 1024,
  previewUrl: "https://s/teaser",
  addedBy: "Ada Rivers",
  createdAt: "2026-10-04T03:00:00Z",
};

describe("a video's length", () => {
  it("reads as a player shows it", () => {
    expect(clockTime(42.4)).toBe("0:42");
    expect(clockTime(725)).toBe("12:05");
    expect(clockTime(3729)).toBe("1:02:09");
  });
});

// Bug hunt B7/F21: an expired signed address fails like an undecodable file,
// and the row used to say "can't play here" at once. It now asks for a fresh
// address first, unless the address that failed was fetched moments ago.
describe("a video whose address fails", () => {
  it("asks for a fresh address the first time, and again only once the last one has aged", () => {
    expect(mayRefreshPreview(null, 1_000)).toBe(true);
    expect(mayRefreshPreview(1_000, 1_000 + 5_000)).toBe(false);
    expect(mayRefreshPreview(1_000, 1_000 + 60 * 60 * 1000)).toBe(true);
  });
});

describe("a video deliverable at rest (W.156)", () => {
  it("is a play tile and a row that says it plays in the card", () => {
    const out = renderToStaticMarkup(<VideoRow d={video} onOpen={() => {}} onRemove={() => {}} />);
    expect(out).toContain('aria-label="Play teaser-cut-v2.mp4"');
    expect(out).toContain("38.0 MB · Ada · 4 Oct · plays in the card");
    // Only the length is fetched until someone presses play.
    expect(out).toContain('preload="metadata"');
    expect(out).not.toContain("controls");
  });

  it("cannot be played without a signed address, and says nothing it cannot keep", () => {
    const out = renderToStaticMarkup(<VideoRow d={{ ...video, previewUrl: null }} onOpen={() => {}} onRemove={() => {}} />);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Play teaser-cut-v2.mp4"|aria-label="Play teaser-cut-v2.mp4"[^>]*disabled=""/);
    expect(out).not.toContain("<video");
  });
});
