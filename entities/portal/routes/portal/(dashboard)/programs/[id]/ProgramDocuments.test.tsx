import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// S.16.21. The client-facing document list printed the uploader's stored email
// whenever no name had been resolved. It prints a name or nothing.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ downloadDocumentAction: vi.fn() }));
vi.mock("../../documents/actions", () => ({ deleteOwnDocumentAction: vi.fn() }));

import { ProgramDocuments } from "./ProgramDocuments";

const doc = (uploaderName: string | null, isMine = false) => ({
  id: "d1",
  filename: "roadmap.pdf",
  sizeBytes: 2048,
  uploaderName,
  isMine,
  createdAt: "2026-09-20T00:00:00Z",
});

describe("the portal document list", () => {
  it("shows no address for an unnamed uploader, and no 'uploaded by' at all", () => {
    const html = renderToStaticMarkup(<ProgramDocuments documents={[doc(null)]} />);
    expect(html).toContain("roadmap.pdf");
    expect(html).not.toContain("@");
    expect(html).not.toContain("uploaded by");
  });

  it("shows the uploader's label when there is one", () => {
    const html = renderToStaticMarkup(<ProgramDocuments documents={[doc("Edge8")]} />);
    expect(html).toContain("uploaded by Edge8");
    expect(html).not.toContain("@");
  });

  it("offers Delete only on the viewer's own upload", () => {
    expect(renderToStaticMarkup(<ProgramDocuments documents={[doc("Sam Lee", true)]} />)).toContain("Delete");
    expect(renderToStaticMarkup(<ProgramDocuments documents={[doc("Sam Lee", false)]} />)).not.toContain("Delete");
  });
});
