import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The employee's leave email names the client manager who decided. That name
// is whatever the manager stored, so it is escaped before it reaches the HTML
// (S.16.18).

type Sent = { to: string; subject: string; html: string };
const sent: Sent[] = [];
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://edge8.test" }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => {}) }));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: vi.fn(async (args: Sent) => {
    sent.push(args);
    return true;
  }),
}));
// AC.15: the email links to the member's Time Off page, so it goes only to
// someone who may open it. A test names the addresses that may not.
const cannotOpen = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpenByEmail: vi.fn(async (email: string) => (href: string) => Boolean(href) && !cannotOpen.has(email)),
}));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePortalPermission: vi.fn(async () => ({ displayName: "<b>Lan</b>", email: "lan@client.test" })),
}));
vi.mock("@/entities/time-off", () => ({ selectTimeOff: () => builderFor("time_off") }));
vi.mock("@/entities/portal/lib/time-off", () => ({
  decideAssignedTimeOff: vi.fn(async () => ({ ok: true })),
  confirmAssignedBalance: vi.fn(),
}));

import { decideMyTeamTimeOff } from "./actions";

beforeEach(() => {
  resetFake();
  sent.length = 0;
  cannotOpen.clear();
});

describe("the leave decision email", () => {
  it("escapes the name of the manager who decided", async () => {
    script("time_off", {
      data: { start_date: "2026-10-05", end_date: "2026-10-05", team_members: { people: { email: "hieu@edge8.test" } } },
    });
    await decideMyTeamTimeOff("req-1", "approved");
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].html).toContain("by &lt;b&gt;Lan&lt;/b&gt;.");
    expect(sent[0].html).not.toContain("<b>Lan</b>");
  });

  it("sends no email to a member who may not open the Time Off page it links to (AC.15)", async () => {
    script("time_off", {
      data: { start_date: "2026-10-05", end_date: "2026-10-05", team_members: { people: { email: "hieu@edge8.test" } } },
    });
    cannotOpen.add("hieu@edge8.test");
    await decideMyTeamTimeOff("req-1", "approved");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toHaveLength(0);
  });
});
