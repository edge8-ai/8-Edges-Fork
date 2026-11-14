import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";

// The receipt form's "How you paid" field (AD.15): every way the column allows,
// the empty choice for nobody having said, and a saved answer shown back, so
// that saving a receipt again never wipes what its owner said.
vi.mock("../actions", () => ({ addOwnItem: vi.fn(), updateOwnItem: vi.fn() }));

import { ItemForm } from "./ItemForm";

const render = (item?: Partial<MyItem>) =>
  renderToStaticMarkup(<ItemForm claimId="claim-1" item={item as MyItem | undefined} companies={[]} onDone={() => {}} />);
const field = (html: string) => html.slice(html.indexOf("How you paid"), html.indexOf("</select>", html.indexOf("How you paid")));

describe("ItemForm: how you paid", () => {
  it("offers each way, and starts on nobody having said", () => {
    const html = field(render());
    for (const words of ["Not said", "Bank transfer", "Card", "Cash"]) expect(html).toContain(words);
    expect(html).toContain('<option value="" selected="">Not said</option>');
  });

  it("shows back what was saved", () => {
    expect(field(render({ id: "item-1", amount: 126000, currency: "vnd", paidHow: "card" }))).toContain('<option value="card" selected="">Card</option>');
  });
});
