import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TH.8.3. The asks that used to reach a person only by email, Lark or another
// page now each write one inbox row for the person asked, and nobody else: an
// approval waiting on them (by name or through a permission they hold), a
// reply to their comment, a blocker tagged to them, their 1-1 booked, moved or
// its prep ready, and their part of a review. Closing the thing settles the
// ask for everyone it went to.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

const recipients = vi.hoisted(() => new Map<string, string[]>());
vi.mock("@/kernel/identity/access-of-person", () => ({
  accessOf: vi.fn(async (personId: string) => {
    const held = recipients.get(personId);
    return held ? { roles: [], permissions: () => held, may: (p: string) => held.includes(p) } : null;
  }),
}));

import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import {
  onApprovalClosed,
  onApprovalRequested,
  onBlockerHanded,
  onCommentReplied,
  onOneOnOneChanged,
  onReviewPartRequested,
  onReviewPartSubmitted,
} from "./deliver";

registerPermissionRegistry({
  atoms: {},
  routes: {
    "/team/boards/[slug]": "surface.team",
    "/admin/boards/[slug]": "boards.open",
    "/team/approvals": "surface.team",
    "/admin/operations/time-off/requests": "time-off.manage",
    "/team/finance/claims/[id]": "reimbursements.check",
    "/admin/finance/reimbursements/[id]": "reimbursements.check",
    "/team/agreements/[id]": "surface.team",
    "/portal/agreements/[id]": "surface.portal",
    "/team/my-coaching": "coaching.mine",
    "/team/coaching/[id]": "coaching.roster",
    // The survey runner is declared public (portal/permissions.ts): it checks
    // the rater itself, so the inbox may link a review part to it.
    "/surveys/[slug]": "public",
  },
  actions: {},
  implies: {},
  roles: {},
});

const CARD = "11111111-2222-3333-4444-555555555555";
const written = () => calls.filter((c) => c.table === "notifications" && c.ops.includes("upsert")).flatMap((c) => c.payloads);

beforeEach(() => {
  resetFake();
  recipients.clear();
  recipients.set("rowan", ["surface.team", "reimbursements.check", "coaching.mine", "coaching.roster"]);
  recipients.set("mai", ["surface.team", "reimbursements.check"]);
});

const approval = {
  approvalId: "ap-1",
  subjectType: "time_off",
  subjectId: "lv-1",
  label: "Juno · Annual · 20–21 Oct",
  requestedBy: "juno",
  approverPersonId: "rowan",
  approverPermission: null,
  metadata: {},
};

describe("the asks reach the inbox", () => {
  it("tells the approver an approval waits, keyed on the approval, with the asker's face", async () => {
    script("notifications", { error: null });
    await onApprovalRequested(approval);
    expect(written()).toEqual([
      expect.objectContaining({ person_id: "rowan", kind: "approval.waiting", event_key: "ap-1", team_href: "/team/approvals", actor_id: "juno" }),
    ]);
    // Always on: no preference is read for a request made by name.
    expect(calls.some((c) => c.table === "notification_prefs")).toBe(false);
  });

  it("tells each holder of the permission a claim waits on, one row each", async () => {
    script("access_role_permissions", { data: [{ role_id: "r1" }] });
    script("access_roles", { data: [{ id: "r1" }] });
    script("access_role_assignments", { data: [{ person_id: "rowan" }, { person_id: "mai" }] });
    script("notifications", { error: null }, { error: null });
    await onApprovalRequested({
      ...approval,
      subjectType: "reimbursement_check",
      subjectId: "c-1",
      label: "Check claim: Taxi",
      requestedBy: "juno",
      approverPersonId: null,
      approverPermission: "reimbursements.check",
    });
    expect(written()).toEqual([
      expect.objectContaining({ person_id: "rowan", kind: "approval.waiting", title: "Check claim: Taxi", team_href: "/team/finance/claims/c-1" }),
      expect.objectContaining({ person_id: "mai", kind: "approval.waiting", team_href: "/team/finance/claims/c-1" }),
    ]);
  });

  // Boundary review, 2026-10-19: a client signer holds only the portal, and the
  // inbox is read on Admin and Team, so their signature ask writes no row.
  it("writes no row for a client asked to sign an agreement", async () => {
    recipients.set("client-1", ["surface.portal"]);
    await onApprovalRequested({ ...approval, subjectType: "agreement_client_signature", subjectId: "ag-1", label: "Lan to sign the MSA", approverPersonId: "client-1" });
    expect(written()).toEqual([]);
  });

  it("asks nobody about an agent's draft or a request that names no one", async () => {
    await onApprovalRequested({ ...approval, subjectType: "campaign_publish" });
    await onApprovalRequested({ ...approval, approverPersonId: null });
    expect(written()).toEqual([]);
  });

  it("settles every ask about an approval once it closes, keeping one already done", async () => {
    script("notifications", { data: [{ id: "n1", person_id: "rowan" }, { id: "n2", person_id: "mai" }] });
    script("notification_reads", { data: [{ notification_id: "n2" }] }, { error: null });
    await onApprovalClosed({ approvalId: "ap-1", subjectType: "reimbursement_check", subjectId: "c-1", state: "approved" });
    const upsert = calls.find((c) => c.table === "notification_reads" && c.ops.includes("upsert"));
    expect(upsert?.payloads).toEqual([[expect.objectContaining({ notification_id: "n1", person_id: "rowan", done_at: expect.any(String) })]]);
  });

  it("tells a comment's author of a reply, keyed on the reply", async () => {
    script("notifications", { error: null });
    await onCommentReplied({
      taskId: CARD,
      boardSlug: "eight-edges",
      commentId: "cm-2",
      parentCommentId: "cm-1",
      body: "Done, see the PR.",
      title: "Ship it",
      actorName: "Juno",
      assigneeId: "rowan",
      actorPersonId: "juno",
    });
    expect(written()).toEqual([
      expect.objectContaining({ person_id: "rowan", kind: "card.replied", event_key: "cm-2", subject: `card:${CARD}`, title: "Juno replied to your comment on “Ship it”" }),
    ]);
  });

  it("tells the person a blocker is tagged to, linking the card it blocks", async () => {
    script("notifications", { error: null });
    await onBlockerHanded({ blockerId: "bl-1", taskId: CARD, boardSlug: "eight-edges", body: "Waiting on the API key", title: "Ship it", actorName: "Juno", assigneeId: "rowan", actorPersonId: "juno" });
    expect(written()).toEqual([
      expect.objectContaining({ person_id: "rowan", kind: "blocker.handed", event_key: "bl-1:rowan", team_href: `/team/boards/eight-edges?card=${CARD}` }),
    ]);
  });

  // The boundary review's ask: a client contact tagged on a blocker holds no
  // Team or Admin access, so neither of the row's links opens for them and no
  // row is written, though boards still states the fact.
  it("writes no row for a client contact tagged on a blocker", async () => {
    recipients.set("contact-1", ["surface.portal"]);
    await onBlockerHanded({ blockerId: "bl-2", taskId: CARD, boardSlug: "eight-edges", body: "Waiting on the client", title: "Ship it", actorName: "Juno", assigneeId: "contact-1", actorPersonId: "juno" });
    expect(written()).toEqual([]);
  });

  it("tells each side of a 1-1 it was asked to, leaving out whoever acted", async () => {
    script("notification_prefs", { data: null }, { data: null });
    script("notifications", { error: null }, { error: null });
    const oneOnOne = {
      meetingId: "m-1",
      profileId: "pr-1",
      change: "moved" as const,
      heldOn: "2026-10-22",
      movedFrom: "2026-10-20",
      coachPersonId: "rowan",
      coacheePersonId: "mai",
      coachName: "Rowan",
      coacheeName: "Mai",
      tell: ["coach" as const, "coachee" as const],
    };
    recipients.set("mai", ["surface.team", "coaching.mine"]);
    await onOneOnOneChanged(oneOnOne);
    expect(written()).toEqual([
      expect.objectContaining({ person_id: "rowan", kind: "coaching.one_on_one", event_key: "m-1:moved:2026-10-22", team_href: "/team/coaching/pr-1" }),
      expect.objectContaining({ person_id: "mai", kind: "coaching.one_on_one", event_key: "m-1:moved:2026-10-22", team_href: "/team/my-coaching" }),
    ]);
    resetFake();
    script("notification_prefs", { data: null });
    script("notifications", { error: null });
    await onOneOnOneChanged({ ...oneOnOne, change: "booked", actorPersonId: "rowan" });
    expect(written()).toEqual([expect.objectContaining({ person_id: "mai", event_key: "m-1:booked" })]);
  });

  it("asks a rater for their review part, linking the form, and settles it once submitted", async () => {
    script("notification_prefs", { data: null });
    script("notifications", { error: null });
    await onReviewPartRequested({ reviewId: "rv-1", raterPersonId: "rowan", raterKind: "manager", reviewName: "Probation review", subjectName: "Mai", formPath: "/surveys/perf-review-manager?review=rv-1" });
    expect(written()).toEqual([
      expect.objectContaining({ person_id: "rowan", kind: "review.needs_you", event_key: "rv-1", title: "Probation review to complete for Mai", team_href: "/surveys/perf-review-manager?review=rv-1" }),
    ]);
    resetFake();
    script("notifications", { data: [{ id: "n9", person_id: "rowan" }] });
    script("notification_reads", { data: [] }, { error: null });
    await onReviewPartSubmitted({ reviewId: "rv-1" });
    expect(calls.find((c) => c.table === "notification_reads" && c.ops.includes("upsert"))?.payloads).toEqual([
      [expect.objectContaining({ notification_id: "n9", done_at: expect.any(String) })],
    ]);
  });
});
