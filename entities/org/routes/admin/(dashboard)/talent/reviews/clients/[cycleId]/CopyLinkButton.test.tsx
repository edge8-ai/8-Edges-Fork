import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// CR.5.8 and CR.5.7: one copy button for a client manager's one link to the
// cycle, on the member page and on the overview's links card. The per-part
// links it once copied are gone (CR.5.7), so it records every copy against
// the cycle and the manager. What is pinned: the words before a copy, the
// screen reader's name for the link, and the permission gate.
const h = vi.hoisted(() => ({
  manager: vi.fn(async (_: { cycleId: string; clientManagerPersonId: string }) => ({ ok: true as const, at: "2026-11-18T02:00:00Z" })),
}));
vi.mock("./manager-link-actions", () => ({ managerLinkCopiedAction: h.manager }));

import { CopyLinkButton } from "./CopyLinkButton";

beforeEach(() => h.manager.mockClear());

describe("CopyLinkButton", () => {
  const may = { "org.reviews": true };
  const manager = { cycleId: "c-1", clientManagerPersonId: "p-1" };

  it("reads as not copied, and says copying sends nothing", () => {
    const html = renderToStaticMarkup(
      <CopyLinkButton may={may} manager={manager} link="https://x.example/l" copiedAt={null} subject="Rosa Vega's link for all their members" idleNote="Not copied yet. Copying sends nothing." />,
    );
    expect(html).toContain("Copy link");
    expect(html).toContain("Not copied yet. Copying sends nothing.");
    expect(html).toContain("Copy Rosa Vega&#x27;s link for all their members");
  });

  it("says Not copied yet by default, and Copy again once copied", () => {
    expect(renderToStaticMarkup(<CopyLinkButton may={may} manager={manager} link="https://x.example/l" copiedAt={null} subject="the link" />)).toContain("Not copied yet");
    expect(renderToStaticMarkup(<CopyLinkButton may={may} manager={manager} link="https://x.example/l" copiedAt="2026-11-17T02:00:00Z" subject="the link" />)).toContain(
      "Copy again",
    );
  });

  it("shows nothing to a viewer without the reviews permission", () => {
    expect(renderToStaticMarkup(<CopyLinkButton may={{ "org.reviews": false }} manager={manager} link="https://x.example/l" copiedAt={null} subject="the link" />)).toBe("");
  });
});
