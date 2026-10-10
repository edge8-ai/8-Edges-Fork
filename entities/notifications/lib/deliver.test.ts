import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// S.3. The subscribers write one row per recipient, never one for a muted kind,
// and dedupe on person, kind and event. What they resolve beyond the payload
// comes from kernel tables only, and a failed read raises so the bus audits it.
// A recipient is told only what they may open (AC.15, ADR 0013): their access is
// resolved through the kernel and asked of the pages each kind links to, by
// those pages' declared permissions.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

const recipients = vi.hoisted(() => new Map<string, string[]>());
vi.mock("@/kernel/identity/access-of-person", () => ({
  accessOf: vi.fn(async (personId: string) => {
    const held = recipients.get(personId);
    return held ? { roles: [], permissions: () => held, may: (p: string) => held.includes(p) } : null;
  }),
}));

import { ReadFailure } from "@/kernel/data/read";
import { accessOf } from "@/kernel/identity/access-of-person";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import { onCardCompleted, onCardLanded, onDealWon, onInvoicePaid, onLeaveApproved, onLeaveWithdrawn } from "./deliver";

// The pages the kinds below link to, as the registry keys them.
registerPermissionRegistry({
  atoms: {},
  routes: {
    "/admin/boards/[slug]": "boards.open",
    "/team/boards/[slug]": "surface.team",
    "/admin/operations/time-off/requests": "time-off.manage",
    "/team/time-off": "time-off.mine",
    "/admin/revenue/deals/[id]": "crm.pipeline",
    "/team/revenue/deals/[id]": "crm.pipeline",
    "/admin/revenue/invoices": "company-os.commerce",
    "/team/revenue/invoices": "company-os.commerce",
  },
  actions: {},
  implies: {},
  roles: {},
});

const written = () => calls.filter((c) => c.table === "notifications").flatMap((c) => c.payloads);

beforeEach(() => {
  resetFake();
  recipients.clear();
  // Rowan is a team member granted Revenue, so every link below opens for them.
  recipients.set("rowan", ["surface.team", "time-off.mine", "crm.pipeline", "company-os.commerce"]);
  vi.mocked(accessOf).mockClear();
});

describe("the inbox subscribers", () => {
  it("resolves a leave requester through team_members and writes their row, deduped on the request", async () => {
    script("team_members", { data: { person_id: "rowan" } });
    script("notification_prefs", { data: null });
    script("notifications", { error: null });
    await onLeaveApproved({ requestId: "lv-1", teamMemberId: "tm-1", startDate: "2026-10-01", endDate: "2026-10-01", leaveType: "sick" });
    expect(written()).toEqual([
      expect.objectContaining({ person_id: "rowan", kind: "leave.approved", event_key: "lv-1", team_href: "/team/time-off" }),
    ]);
    const upsert = calls.find((c) => c.table === "notifications");
    expect(upsert?.options[0]).toEqual({ onConflict: "person_id,kind,event_key", ignoreDuplicates: true });
  });

  it("writes withdrawn leave in its own kind, so the approval's row for the same request does not swallow it", async () => {
    script("team_members", { data: { person_id: "rowan" } });
    script("notification_prefs", { data: null });
    script("notifications", { error: null });
    await onLeaveWithdrawn({ requestId: "lv-1", teamMemberId: "tm-1", startDate: "2026-10-01", endDate: "2026-10-02", leaveType: "annual", became: "cancelled", actorPersonId: "juno" });
    expect(written()).toEqual([expect.objectContaining({ person_id: "rowan", kind: "leave.withdrawn", event_key: "lv-1" })]);
  });

  it("writes nothing for a kind the person muted", async () => {
    script("companies", { data: { owner_id: "rowan" } });
    script("notification_prefs", { data: { muted: true } });
    await onInvoicePaid({ invoiceId: "i-1", companyId: "c-1", dealId: null, amountCents: 100, currency: "USD", paidOn: "2026-09-25" });
    expect(written()).toEqual([]);
  });

  it("reads the company's owner only when the deal names no owner", async () => {
    script("notification_prefs", { data: null });
    script("notifications", { error: null });
    await onDealWon({ dealId: "d-1", companyId: "c-1", personId: null, amountUsdCents: null, closedAt: "2026-09-25", ownerId: "rowan" });
    expect(calls.some((c) => c.table === "companies")).toBe(false);
    expect(written()).toEqual([expect.objectContaining({ person_id: "rowan", kind: "deal.won" })]);
  });

  it("ignores a landing that is not a card set aside", async () => {
    await onCardLanded({ taskId: "t-1", boardSlug: "b", status: "done", subjectType: null, subjectId: null, assigneeId: "rowan", actorPersonId: "juno" });
    expect(calls).toHaveLength(0);
  });

  it("raises a failed recipient read, so the bus audits it instead of the fact vanishing", async () => {
    script("team_members", { error: { message: "db down" } });
    await expect(
      onLeaveApproved({ requestId: "lv-1", teamMemberId: "tm-1", startDate: "2026-10-01", endDate: "2026-10-01", leaveType: "sick" }),
    ).rejects.toBeInstanceOf(ReadFailure);
  });

  describe("withholds what the recipient may not open (AC.15)", () => {
    it("writes no row for a deal won to an owner who may not open the deal, on either surface", async () => {
      recipients.set("rowan", ["surface.team", "time-off.mine"]);
      script("notification_prefs", { data: null });
      await onDealWon({ dealId: "d-1", companyId: "c-1", personId: null, amountUsdCents: null, closedAt: "2026-09-25", ownerId: "rowan" });
      expect(written()).toEqual([]);
      expect(calls.some((c) => c.table === "notifications")).toBe(false);
    });

    it("keeps only the link the recipient may open: a team member is told of their card on the team surface, not the admin one", async () => {
      recipients.set("rowan", ["surface.team"]);
      script("notification_prefs", { data: null });
      script("notifications", { error: null });
      await onCardCompleted({ taskId: "t-1", boardSlug: "eight-edges", subjectType: null, subjectId: null, title: "Ship it", assigneeId: "rowan", actorPersonId: "juno" });
      expect(written()).toEqual([
        expect.objectContaining({ person_id: "rowan", kind: "card.completed", admin_href: null, team_href: "/team/boards/eight-edges?card=t-1" }),
      ]);
    });

    it("is closed by default: a recipient the registers do not know is told nothing", async () => {
      script("notification_prefs", { data: null });
      await onCardCompleted({ taskId: "t-1", boardSlug: "eight-edges", subjectType: null, subjectId: null, title: "Ship it", assigneeId: "stranger", actorPersonId: "juno" });
      expect(written()).toEqual([]);
    });

    it("resolves the recipient's access once per notification, and not at all for a muted kind", async () => {
      script("notification_prefs", { data: null });
      script("notifications", { error: null });
      await onCardCompleted({ taskId: "t-1", boardSlug: "eight-edges", subjectType: null, subjectId: null, title: "Ship it", assigneeId: "rowan", actorPersonId: "juno" });
      expect(accessOf).toHaveBeenCalledTimes(1);
      vi.mocked(accessOf).mockClear();
      script("notification_prefs", { data: { muted: true } });
      await onCardCompleted({ taskId: "t-2", boardSlug: "eight-edges", subjectType: null, subjectId: null, title: "Ship it", assigneeId: "rowan", actorPersonId: "juno" });
      expect(accessOf).not.toHaveBeenCalled();
    });
  });
});
