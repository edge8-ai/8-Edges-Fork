import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MyDocument, MyItem } from "@/entities/reimbursements/lib/my-claims";

// RB.20, the owner's half: a receipt in another currency offers its bank
// deduction as a document, and once the deduction is on it, the receipt reads
// as the original. A dong receipt is its own value, so it is offered none.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("../actions", () => ({
  cancelOwnUpload: vi.fn(),
  confirmOwnUpload: vi.fn(),
  markOwnFileReplaced: vi.fn(),
  openOwnFile: vi.fn(),
  removeOwnFile: vi.fn(),
  startOwnUpload: vi.fn(),
}));

import { ItemDocuments } from "./ItemDocuments";

const doc = (kind: MyDocument["kind"], filename: string): MyDocument => ({ id: filename, kind, filename, mimeType: "image/jpeg", sizeBytes: 1000, replacedAt: null });
const item = (over: Partial<MyItem>): MyItem => ({ id: "item-1", currency: "usd", boughtInVietnam: false, category: "software", documents: [], ...over }) as MyItem;
const render = (it: MyItem) => renderToStaticMarkup(<ItemDocuments claimId="claim-1" item={it} removal="delete" />);

describe("ItemDocuments (RB.20)", () => {
  it("offers a bank deduction on a receipt paid in another currency, and labels the receipt the original beside it", () => {
    const html = render(item({ documents: [doc("receipt", "Receipt-2044.pdf"), doc("bank_deduction", "IMG_5854.jpeg")] }));
    expect(html).toContain('<option value="bank_deduction">Bank deduction (screenshot or PDF)</option>');
    expect(html).toContain("Original receipt</span> · Receipt-2044.pdf");
    expect(html).toContain("Bank deduction</span> · IMG_5854.jpeg");
  });

  it("keeps a lone receipt a receipt, and offers a dong receipt no bank deduction", () => {
    expect(render(item({ documents: [doc("receipt", "a.jpg")] }))).toContain("Receipt</span> · a.jpg");
    expect(render(item({ currency: "vnd", boughtInVietnam: true }))).not.toContain("bank_deduction");
  });
});
