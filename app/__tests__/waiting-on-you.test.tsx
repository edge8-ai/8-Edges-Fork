// The admin home's "Waiting on you" (S.5, RB.3) against the registry this
// deployment ships. The card lists an approval only when its link reaches a
// page the viewer may open, and an href no page declares is refused (ADR
// 0013, closed by default). So the link it builds for each kind of approval
// and the page that kind is decided on must agree, and only the real
// app/permissions.ts can show that: a fixture registry would declare whatever
// the link happened to say. That is why this sits in app/, the one place that
// sees both the company-os card and the reimbursements pages.
//
// The access is stubbed and the approvals rows are scripted on the kernel's
// fake database; the approvals read (waitingOn, with its own-claim rule) and
// the link check (mayOpen and the registry) are real. Each viewer holds
// exactly the atoms its roles hold by default (the registry's `holders`), as
// in app/search.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const persona = vi.hoisted(() => ({ roles: [] as string[] }));

vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmail: async () => "person-finance" }));
vi.mock("@/kernel/identity/access-request", async () => {
  const { PERMISSIONS } = await import("@/app/permissions");
  const held = () =>
    Object.entries(PERMISSIONS.atoms)
      .filter(([, a]) => a.holders.some((h) => persona.roles.includes(h.role)))
      .map(([atom]) => atom);
  return {
    getAccess: async () => ({
      roles: persona.roles,
      permissions: held,
      may: (atom: string) => held().includes(atom),
      personId: "person-finance",
      user: { id: "u1", email: "finance@edge8.test" },
    }),
  };
});

const DEPLOYMENT = process.env.EDGE8_DEPLOYMENT ?? "edge8";
const describeEdge8 = DEPLOYMENT === "edge8" ? describe : describe.skip;

import { PERMISSIONS } from "@/app/permissions";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import { permissionForPath } from "@/kernel/identity/permission-lookup";
import { WaitingOnYou } from "@/entities/company-os/routes/admin/(dashboard)/WaitingOnYou";

registerPermissionRegistry(PERMISSIONS);

const CLAIM = "11111111-1111-4111-8111-111111111111";
// One pending company_os.approvals row, as the database answers it.
type Row = { id: string; subject_type: string; subject_id: string; requested_by: string | null; metadata: Record<string, unknown>; created_at: string };
const approval = (over: Partial<Row>): Row => ({
  id: "ap-1",
  subject_type: "reimbursement_check",
  subject_id: CLAIM,
  requested_by: "person-owner",
  created_at: "2026-10-06T00:00:00Z",
  metadata: { label: "Hanoi client visit" },
  ...over,
});

// The `or` filter the approvals read sent: every way a row may be addressed to the viewer.
const addressedTo = () =>
  calls
    .filter((c) => c.table === "approvals")
    .flatMap((c) => c.filters.filter((f) => f[0] === "or").map((f) => String(f[1])))
    .join(",");

async function cardFor(roles: string[], rows: Row[]): Promise<string> {
  persona.roles = roles;
  script("approvals", { data: rows });
  const card = await WaitingOnYou({ email: "finance@edge8.test" });
  return card ? renderToStaticMarkup(card) : "";
}

beforeEach(() => {
  resetFake();
  persona.roles = [];
});

describeEdge8("Waiting on you on the admin home (RB.3)", () => {
  it("lists a claim to check for a Finance admin, linked to Admin's page for that claim, so the checker stays in Admin", async () => {
    const html = await cardFor(["admin", "finance"], [approval({})]);
    // The card asked for what is addressed to the permission the claim's check is opened to.
    expect(addressedTo()).toContain('"reimbursements.check"');
    expect(html).toContain("Hanoi client visit");
    expect(html).toContain(`href="/admin/finance/reimbursements/${CLAIM}"`);
    // The page it links to is declared: Admin's view, which every admin holds.
    expect(permissionForPath(PERMISSIONS.routes, `/admin/finance/reimbursements/${CLAIM}`)).toBe("reimbursements.view");
  });

  it("falls back to the Team view's checker page for a checker Admin's claim page does not reach", async () => {
    // Finance without Admin's reimbursements.view: the checker's page declares the check itself.
    const html = await cardFor(["finance", "employer"], [approval({})]);
    expect(html).toContain(`href="/team/finance/claims/${CLAIM}"`);
    expect(permissionForPath(PERMISSIONS.routes, `/team/finance/claims/${CLAIM}`)).toBe("reimbursements.check");
  });

  it("never lists a Finance admin's own claim as waiting on them, which the To check list also leaves out", async () => {
    const html = await cardFor(["admin", "finance"], [approval({ id: "ap-own", requested_by: "person-finance", metadata: { label: "My taxi" } })]);
    expect(html).toBe("");
  });

  it("keeps it from an admin who does not check claims: the read never asks for what is addressed to checkers", async () => {
    // Admin's claim page is open to every admin (reimbursements.view), so the
    // link no longer hides the row; the approvals read is what keeps a check
    // from an admin who holds no reimbursements.check.
    await cardFor(["admin"], []);
    expect(addressedTo()).not.toContain("reimbursements.check");
    expect(addressedTo()).not.toContain("reimbursements.approve");
  });

  it("lists a checked claim for its approver, linked to Admin's page for that claim (RB.4)", async () => {
    const html = await cardFor(["admin", "reimbursement-approver"], [approval({ id: "ap-2", subject_type: "reimbursement_approval", metadata: { label: "Approve me" } })]);
    // Addressed to the approve permission the approval is opened to (claim-lifecycle's check).
    expect(addressedTo()).toContain('"reimbursements.approve"');
    expect(html).toContain("Approve me");
    expect(html).toContain(`href="/admin/finance/reimbursements/${CLAIM}"`);
  });

  it("links an approver Admin's claim page does not reach to the To approve list instead", async () => {
    const html = await cardFor(["reimbursement-approver"], [approval({ id: "ap-2", subject_type: "reimbursement_approval", metadata: { label: "Approve me" } })]);
    expect(html).toContain('href="/admin/finance/reimbursements/to-approve"');
    expect(permissionForPath(PERMISSIONS.routes, "/admin/finance/reimbursements/to-approve")).toBe("reimbursements.approve");
  });
});
