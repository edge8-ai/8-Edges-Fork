import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// CR.5.4: the "Email the members" card as the server renders it. Each state
// says one thing and offers its own buttons; a cycle opened before the owner chose
// how members are emailed never says nobody was told; a closed cycle, or a
// viewer who may not manage reviews, is offered no button that changes it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("./email-actions", () => ({
  chooseMemberEmailAction: async () => ({ ok: true, outcome: "saved" }),
  clearMemberEmailAction: async () => ({ ok: true, outcome: "saved" }),
  markMemberEmailSentAction: async () => ({ ok: true, outcome: "saved" }),
}));

import type { MemberEmailView } from "@/entities/org/lib/client-reviews/member-email-view";
import { EmailMembersCard } from "./EmailMembersCard";

const VIEW: MemberEmailView = {
  state: "none",
  expected: { mode: null, scheduledAt: null },
  doneDay: null,
  scheduledLabel: null,
  scheduledLocal: null,
  reminderLine: null,
  dueDate: "2026-12-04",
  recipients: 7,
  members: 8,
  sentTheirs: 1,
  lastSent: { name: "Bình Trần", day: "Nov 17" },
  client: { name: "Northwind", timeZone: "America/New_York", zoneLabel: "Eastern", startMinute: 540, companyId: "co-1" },
  message: "Subject: Your Northwind review is open",
};
const MAY = { "org.reviews": true } as never;
const html = (view: Partial<MemberEmailView>, opts: { closed?: boolean; may?: never } = {}) =>
  renderToStaticMarkup(<EmailMembersCard may={opts.may ?? MAY} cycleId="cycle-1" closed={opts.closed ?? false} view={{ ...VIEW, ...view }} />);

describe("EmailMembersCard", () => {
  it("says nobody has been emailed, with one main button, and how many sent theirs", () => {
    const out = html({});
    expect(out).toContain("Not emailed yet");
    expect(out).toContain("Nobody has been emailed.");
    expect(out).toContain("Email the members…");
    expect(out).toContain("1 of 8 sent theirs");
    expect(out).toContain("Bình Trần, Nov 17");
  });

  it("never says nobody was told for a cycle that emailed its members when it opened", () => {
    const out = html({ state: "legacy" });
    expect(out).toContain("Emailed when it opened");
    expect(out).not.toContain("Nobody has been emailed");
    expect(out).not.toContain("Email the members…");
  });

  it("shows a scheduled email with its time, its reminder, and the way to change or stop it", () => {
    const out = html({
      state: "scheduled",
      scheduledLabel: "Wed 18 Nov, 9:00 am Eastern (9:00 pm in Saigon)",
      reminderLine: "Reminder Tue 1 Dec to anyone who has not sent theirs. Due Fri 4 Dec.",
    });
    expect(out).toContain("Email scheduled");
    expect(out).toContain("Wed 18 Nov, 9:00 am Eastern (9:00 pm in Saigon).");
    expect(out).toContain("Reminder Tue 1 Dec");
    expect(out).toContain("Change…");
    expect(out).toContain("Don&#x27;t send it");
  });

  it("offers the message and Mark as sent while the owner emails them by hand, and only the message after", () => {
    expect(html({ state: "manual" })).toContain("Mark as sent");
    const after = html({ state: "manual_sent", doneDay: "Nov 19" });
    expect(after).toContain("You marked it sent, Nov 19. The app sent nothing.");
    expect(after).toContain("Copy the message");
    expect(after).not.toContain("Mark as sent");
  });

  it("offers nothing that changes the plan on a closed cycle or without the reviews permission", () => {
    expect(html({}, { closed: true })).not.toContain("Email the members…");
    expect(html({ state: "scheduled", scheduledLabel: "Wed 18 Nov" }, { may: {} as never })).not.toContain("Change…");
  });
});
