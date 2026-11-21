import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MyDocument, MyItem } from "@/entities/reimbursements/lib/my-claims";

// RB.26, the owner's half: a receipt's files are listed, each opened by its
// name, with no picker and no per-file buttons: files go in through the one
// drop zone. A bank deduction on its own asks to be joined; Edit holds the
// amounts, the files with Unjoin, and Remove apart from Save.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("../actions", () => ({
  joinOwnRow: vi.fn(),
  markOwnItemRemoved: vi.fn(),
  openOwnFile: vi.fn(),
  refileOwnDocument: vi.fn(),
  removeOwnItem: vi.fn(),
  unjoinOwnDocument: vi.fn(),
  updateOwnItemAmounts: vi.fn(),
}));

import { AmountsForm } from "./AmountsForm";
import { ItemDocuments } from "./ItemDocuments";
import { JoinToReceipt } from "./JoinToReceipt";

const doc = (kind: MyDocument["kind"], filename: string): MyDocument => ({ id: filename, kind, filename, mimeType: "image/jpeg", sizeBytes: 1000, replacedAt: null });
const item = (over: Partial<MyItem>): MyItem =>
  ({ id: "item-1", label: "Anthropic, PBC · Nov 5, 2026", currency: "usd", amount: 11111, amountVnd: 2867194, chargedVnd: null, boughtInVietnam: false, category: "software", documents: [], ...over }) as MyItem;
const MAY = { "reimbursements.mine": true };

describe("ItemDocuments", () => {
  it("names each file by what it is, opens it by its name, and offers no picker", () => {
    const html = renderToStaticMarkup(<ItemDocuments item={item({ documents: [doc("receipt", "Receipt-2811.pdf"), doc("bank_deduction", "IMG_B695.jpeg")] })} />);
    expect(html).toContain("Original receipt</span>");
    expect(html).toContain('class="admin-link-btn">Receipt-2811.pdf</button>');
    expect(html).toContain('class="admin-link-btn">IMG_B695.jpeg</button>');
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Unjoin");
  });

  it("offers Unjoin beside a joined bank deduction or red invoice only when Edit asks for it", () => {
    const joined = item({ documents: [doc("receipt", "r.pdf"), doc("bank_deduction", "d.jpeg")] });
    expect(renderToStaticMarkup(<ItemDocuments item={joined} onUnjoin={() => {}} />).match(/Unjoin/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<ItemDocuments item={joined} />)).not.toContain("Unjoin");
    const invoiced = item({ currency: "vnd", documents: [doc("receipt", "grab.jpg"), doc("red_invoice", "hd.pdf")] });
    expect(renderToStaticMarkup(<ItemDocuments item={invoiced} onUnjoin={() => {}} />).match(/Unjoin/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<ItemDocuments item={item({ documents: [doc("bank_deduction", "d.jpeg")] })} onUnjoin={() => {}} />)).not.toContain("Unjoin");
  });
});

// RB.26.6: in Edit, what each file is reads as a picker set to the AI's read,
// which its owner can change; a photo is never a red invoice.
describe("ItemDocuments in Edit", () => {
  it("shows each current file's kind as a picker, with Red invoice offered only for a PDF", () => {
    const photo = renderToStaticMarkup(<ItemDocuments item={item({ documents: [doc("receipt", "IMG.jpeg")] })} onKind={() => {}} />);
    expect(photo).toContain('aria-label="What IMG.jpeg is"');
    expect(photo).toContain('<option value="receipt" selected="">Receipt</option>');
    expect(photo).toContain('<option value="red_invoice" disabled="">Red invoice (PDF only)</option>');
    expect(photo).toContain('<option value="bank_deduction">Bank deduction</option>');
    const pdf = renderToStaticMarkup(<ItemDocuments item={item({ documents: [{ ...doc("receipt", "hd.pdf"), mimeType: "application/pdf" }] })} onKind={() => {}} />);
    expect(pdf).toContain('<option value="red_invoice">Red invoice</option>');
  });

  it("shows the kind Edit holds while it is being changed", () => {
    const html = renderToStaticMarkup(<ItemDocuments item={item({ documents: [doc("receipt", "IMG.jpeg")] })} kinds={{ "IMG.jpeg": "bank_deduction" }} onKind={() => {}} />);
    expect(html).toContain('<option value="bank_deduction" selected="">Bank deduction</option>');
  });

  it("says what the AI read a single file as, and that it can be changed", () => {
    const photoRow = item({ currency: "vnd", amount: 2937648, amountVnd: 2937648, documents: [doc("receipt", "IMG.jpeg")] });
    const html = renderToStaticMarkup(<AmountsForm claimId="claim-1" item={photoRow} removal="delete" may={MAY} onDone={() => {}} />);
    expect(html).toContain("The amounts, and what each file is, are yours to correct.");
    expect(html).toContain("The AI read this file as a receipt. If it is something else, change it here.");
  });
});

describe("JoinToReceipt", () => {
  const lone = item({ id: "lone", label: "ANTHROPIC* CLAUDE SUB · Nov 6, 2026", currency: "vnd", documents: [doc("bank_deduction", "d.jpeg")] });

  it("asks which receipt a bank deduction paid for, with the nearest one picked, and joins on a press", () => {
    const html = renderToStaticMarkup(<JoinToReceipt claimId="claim-1" item={lone} kind="bank_deduction" targets={[item({ documents: [doc("receipt", "r.pdf")] })]} may={MAY} />);
    expect(html).toContain("Paid for");
    expect(html).toMatch(/<option value="item-1" selected="">Anthropic, PBC · Nov 5, 2026 · /);
    expect(html).toContain(">Join</button>");
  });

  it("asks which receipt a red invoice is for", () => {
    const invoice = item({ id: "hd", currency: "vnd", documents: [doc("red_invoice", "hd.pdf")] });
    const grab = item({ id: "grab", label: "Grab · Nov 5, 2026", currency: "vnd", amount: 126000, documents: [doc("receipt", "grab.jpg")] });
    expect(renderToStaticMarkup(<JoinToReceipt claimId="claim-1" item={invoice} kind="red_invoice" targets={[grab]} may={MAY} />)).toContain("Red invoice for");
  });

  it("says what to drop for a deduction with nothing to join, and nothing for a red invoice, which can stand alone", () => {
    expect(renderToStaticMarkup(<JoinToReceipt claimId="claim-1" item={lone} kind="bank_deduction" targets={[]} may={MAY} />)).toContain("Drop the receipt this paid for, then join them here.");
    expect(renderToStaticMarkup(<JoinToReceipt claimId="claim-1" item={lone} kind="red_invoice" targets={[]} may={MAY} />)).toBe("");
  });
});

describe("AmountsForm", () => {
  it("holds the amounts, the files with Unjoin, Save and Cancel, and Remove receipt apart", () => {
    const joined = item({ chargedVnd: 2937648, amountVnd: 2937648, documents: [doc("receipt", "r.pdf"), doc("bank_deduction", "d.jpeg")] });
    const html = renderToStaticMarkup(<AmountsForm claimId="claim-1" item={joined} removal="delete" may={MAY} onDone={() => {}} />);
    expect(html).toContain("Amount on the receipt");
    expect(html).toContain("Paid to you (₫)");
    expect(html).toContain("From your bank deduction. This is what you are paid.");
    expect(html).toContain("Unjoin");
    expect(html).toContain(">Save</button>");
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain('class="admin-btn admin-btn--danger"');
    expect(html).toContain("Remove receipt");
    // Seller, date and category are read from the files, never typed here.
    expect(html).not.toMatch(/Seller|Category|What it was/);
  });

  it("asks a lone bank deduction for its dong amount alone", () => {
    const lone = item({ currency: "vnd", amount: 2937648, amountVnd: 2937648, documents: [doc("bank_deduction", "d.jpeg")] });
    const html = renderToStaticMarkup(<AmountsForm claimId="claim-1" item={lone} removal="delete" may={MAY} onDone={() => {}} />);
    expect(html).not.toContain("Amount on the receipt");
    expect(html).toContain("Paid to you (₫)");
    expect(html).toContain("Remove bank deduction");
  });

  it("shows a dong receipt its amount alone: a dong receipt is what is paid", () => {
    const dong = item({ currency: "vnd", amount: 126000, amountVnd: 126000, boughtInVietnam: true, documents: [doc("receipt", "grab.jpg")] });
    const html = renderToStaticMarkup(<AmountsForm claimId="claim-1" item={dong} removal={null} may={MAY} onDone={() => {}} />);
    expect(html).toContain("Amount on the receipt");
    expect(html).not.toContain("Paid to you");
    expect(html).not.toContain("Remove");
  });
});
