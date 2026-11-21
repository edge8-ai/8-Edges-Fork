import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The form's own draft is not "another" open advance. The first attach saves a draft, and
// the action's revalidatePath re-renders the page in the same response, so the page's prop
// turns true under the form's state. Holding that against the form left Send disabled for
// everyone who attached a file first, which is the only order the form allows.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/kernel/ui/upload", () => ({ resumableUploadToSignedPath: () => {} }));
vi.mock("../TripPicker", () => ({ TripPicker: () => null }));
vi.mock("./actions", () => ({
  cancelOwnEvidence: async () => ({ ok: true }),
  confirmOwnEvidence: async () => ({ ok: true }),
  moveOwnAdvance: async () => ({ ok: true }),
  removeOwnEvidence: async () => ({ ok: true }),
  saveOwnAdvance: async () => ({ ok: true, id: "advance-1" }),
  startOwnEvidence: async () => ({ ok: false, error: "unused" }),
}));

import { AdvanceForm } from "./AdvanceForm";

const ONE_AT_A_TIME = "one at a time";
const render = (advance: Parameters<typeof AdvanceForm>[0]["advance"], anotherOpen: boolean) =>
  renderToStaticMarkup(
    <AdvanceForm advance={advance} evidence={[]} trips={[]} holidays={[]} paidTo="Example Bank" buyerName={null} approver="Dana" anotherOpen={anotherOpen} may={{ "reimbursements.mine": true } as never} />,
  );
const draft = { id: "advance-1", purpose: "Venue", amountVnd: 8_000_000, spendEndsOn: "2026-12-01", tripEventId: null };

describe("AdvanceForm", () => {
  it("refuses a new request while another advance is open", () => {
    expect(render(null, true)).toContain(ONE_AT_A_TIME);
  });

  it("does not count the draft this form is editing as another advance", () => {
    expect(render(draft, true)).not.toContain(ONE_AT_A_TIME);
  });
});
