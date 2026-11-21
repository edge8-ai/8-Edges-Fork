import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.5.4: the email that tells the members their review is open. Every
// recipient is a team member, read from team_members: the app never contacts
// anyone at the client, so no other table is ever asked for an address. The
// message the owner copies says the same words as the app's email.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({ send: vi.fn(async (_m: { to: string; subject: string; html: string }) => ({ ok: true })) }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: h.send }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://app.example" }));
vi.mock("@/kernel/config/contacts", () => ({ EMAIL_SIGN_OFF: "" }));

import { emailMembersTheirClientReviewIsOpen, emailMembersTheirReviewIsWaiting, memberEmailMessage } from "./notices";

const CYCLE = { clientName: "Northwind <Health>", cycleName: "November 2026", dueDate: "2026-12-04" };

beforeEach(() => {
  resetFake();
  h.send.mockClear();
});

describe("emailMembersTheirClientReviewIsOpen", () => {
  it("mails each team member with an address, and asks no other table for one", async () => {
    script("team_members", {
      data: [
        { id: "tm-1", people: { email: "ana@example.com", first_name: "Ana", last_name: "Lee" } },
        { id: "tm-2", people: { email: null, first_name: "Bao", last_name: "Vo" } },
      ],
    });
    expect(await emailMembersTheirClientReviewIsOpen(["tm-1", "tm-2"], CYCLE)).toEqual({ sent: 1, addressed: 1 });
    expect(calls.map((c) => c.table)).toEqual(["team_members"]);
    expect(h.send.mock.calls.map(([m]) => m.to)).toEqual(["ana@example.com"]);
    const mail = h.send.mock.calls[0][0];
    expect(mail.subject).toBe("Your Northwind <Health> review is open");
    // The client's name is escaped in the body, which is HTML.
    expect(mail.html).toContain("Your performance review for Northwind &lt;Health&gt; · November 2026 is open. Please fill in your self-assessment in the team app by Fri 4 Dec.");
    expect(mail.html).toContain('href="https://app.example/team/reviews"');
  });

  it("sends nothing and reads nothing for no members", async () => {
    expect(await emailMembersTheirClientReviewIsOpen([], CYCLE)).toEqual({ sent: 0, addressed: 0 });
    expect(calls).toEqual([]);
    expect(h.send).not.toHaveBeenCalled();
  });

  // The scheduler tells "nobody had an address" (never retried) from "every send failed" (retried).
  it("says when no member had an address, apart from sends that failed", async () => {
    script("team_members", { data: [{ id: "tm-2", people: { email: null, first_name: "Bao", last_name: "Vo" } }] });
    expect(await emailMembersTheirClientReviewIsOpen(["tm-2"], CYCLE)).toEqual({ sent: 0, addressed: 0 });
    expect(h.send).not.toHaveBeenCalled();

    script("team_members", { data: [{ id: "tm-1", people: { email: "ana@example.com", first_name: "Ana", last_name: "Lee" } }] });
    h.send.mockResolvedValueOnce(null as unknown as { ok: boolean });
    expect(await emailMembersTheirClientReviewIsOpen(["tm-1"], CYCLE)).toEqual({ sent: 0, addressed: 1 });
  });

  it("does not know who had an address when the addresses could not be read", async () => {
    script("team_members", { error: { message: "connection reset" } });
    expect(await emailMembersTheirClientReviewIsOpen(["tm-1"], CYCLE)).toEqual({ sent: 0, addressed: null });
  });
});

// CR.5.5: the due-date reminder names the cycle and its due date, and goes
// only to team members, read from team_members like every email here.
describe("emailMembersTheirReviewIsWaiting", () => {
  it("reminds each team member with an address of the due date, and asks no other table for one", async () => {
    script("team_members", { data: [{ id: "tm-1", people: { email: "ana@example.com", first_name: "Ana", last_name: "Lee" } }] });
    expect(await emailMembersTheirReviewIsWaiting(["tm-1"], CYCLE)).toEqual({ sent: 1, addressed: 1 });
    expect(calls.map((c) => c.table)).toEqual(["team_members"]);
    const mail = h.send.mock.calls[0][0];
    expect(mail.to).toBe("ana@example.com");
    expect(mail.subject).toBe("Reminder: your Northwind <Health> review is due Fri 4 Dec");
    expect(mail.html).toContain("Your self-assessment for Northwind &lt;Health&gt; · November 2026 is still waiting. Please send it in the team app by Fri 4 Dec.");
  });
});

describe("memberEmailMessage", () => {
  it("is the same email as plain text, to every member at once", () => {
    expect(memberEmailMessage({ ...CYCLE, clientName: "Northwind" }, "https://app.example")).toBe(
      "Subject: Your Northwind review is open\n\nHi all,\n\nYour performance review for Northwind · November 2026 is open. Please fill in your self-assessment in the team app by Fri 4 Dec:\nhttps://app.example/team/reviews\n\nThank you.",
    );
  });

  it("leaves the due date out when the cycle has none", () => {
    expect(memberEmailMessage({ clientName: null, cycleName: "November 2026", dueDate: null }, "https://app.example")).toContain(
      "Your performance review for November 2026 is open. Please fill in your self-assessment in the team app:\n",
    );
  });
});
