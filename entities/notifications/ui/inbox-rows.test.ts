import { describe, expect, it } from "vitest";
import { cardParam, dayLabel, happenedDays, inPlace, needsRows } from "./inbox-rows";
import type { InboxItem } from "@/entities/notifications/lib/inbox";

// TH.2: how the inbox lays its items out. Rows of one kind about one card show
// as one line; what happened groups by Saigon day.

const CARD = "card:11111111-2222-3333-4444-555555555555";
const item = (id: string, over: Partial<InboxItem> = {}): InboxItem => ({
  id,
  kind: "card.commented",
  title: `Comment ${id}`,
  body: `Words ${id}`,
  href: "/team/boards/b?card=t1",
  createdAt: "2026-10-10T03:00:00Z",
  readAt: null,
  subject: CARD,
  doneAt: null,
  actor: null,
  dueOn: null,
  ...over,
});

describe("needsRows", () => {
  it("shows several comments on one card as one row, the newest's words, every id kept", () => {
    const rows = needsRows([item("n3"), item("n2"), item("n1")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ids: ["n3", "n2", "n1"], title: "Comment n3", body: "Words n3", bundle: "3 comments on this card, newest shown", action: "Reply" });
  });

  it("keeps different kinds, different cards and rows without a subject apart", () => {
    const rows = needsRows([
      item("a", { kind: "card.assigned" }),
      item("b"),
      item("c", { subject: "card:99999999-2222-3333-4444-555555555555" }),
      item("d", { subject: null }),
      item("e", { subject: null }),
    ]);
    expect(rows.map((r) => r.ids)).toEqual([["a"], ["b"], ["c"], ["d"], ["e"]]);
    expect(rows[0].action).toBe("Open card");
  });

  it("is unread while any of its items is", () => {
    expect(needsRows([item("n2", { readAt: "2026-10-10T04:00:00Z" }), item("n1")])[0].unread).toBe(true);
    expect(needsRows([item("n1", { readAt: "2026-10-10T04:00:00Z" })])[0].unread).toBe(false);
  });
});

describe("happenedDays", () => {
  it("labels Saigon days: today, yesterday, earlier this week, earlier", () => {
    expect(dayLabel("2026-10-10", "2026-10-10")).toBe("Today");
    expect(dayLabel("2026-10-09", "2026-10-10")).toBe("Yesterday");
    expect(dayLabel("2026-10-05", "2026-10-10")).toBe("Earlier this week");
    expect(dayLabel("2026-10-01", "2026-10-10")).toBe("Earlier");
  });

  it("groups by the Saigon day, newest first, and dates a done request by when it was done", () => {
    const now = new Date("2026-10-10T08:00:00Z");
    const days = happenedDays(
      [
        item("old", { kind: "kudos.received", subject: null, createdAt: "2026-10-09T05:00:00Z" }),
        // 23:30 UTC on the 9th is the 10th in Saigon.
        item("late", { kind: "kudos.received", subject: null, createdAt: "2026-10-09T23:30:00Z" }),
        item("done", { kind: "card.assigned", createdAt: "2026-10-08T05:00:00Z", doneAt: "2026-10-10T02:00:00Z", readAt: "2026-10-10T02:00:00Z" }),
      ],
      now,
    );
    expect(days.map((d) => [d.label, d.rows.map((r) => r.ids[0])])).toEqual([
      ["Today", ["done", "late"]],
      ["Yesterday", ["old"]],
    ]);
    expect(days[0].rows[0].done).toBe(true);
  });
});

describe("faces (TH.2.8)", () => {
  it("draws the newest item's person, initials and photo, and keeps the icon when nobody acted", () => {
    const rows = needsRows([
      item("n2", { actor: { name: "Lan Anh", avatarUrl: null } }),
      item("n1", { actor: { name: "Hieu Nguyen", avatarUrl: "https://img.example/h.jpg" } }),
      item("d", { kind: "card.due_tomorrow", subject: null }),
    ]);
    expect(rows.map((r) => r.face)).toEqual([{ initials: "LA", avatarUrl: null }, null]);
  });
});

describe("inPlace and cardParam (TH.2.6)", () => {
  const TASK = "11111111-2222-3333-4444-555555555555";
  it("points a card's row at the page's own address, and leaves a spark and a linkless row alone", () => {
    const needs = needsRows([item("a")]);
    const days = happenedDays(
      [
        item("s", { kind: "idea.shipped", subject: "idea:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", href: "/team/ideas/x" }),
        item("n", { kind: "kudos.received", subject: null, href: null }),
      ],
      new Date("2026-10-10T08:00:00Z"),
    );
    const out = inPlace("/team/inbox/", needs, days);
    expect(out.needs[0].href).toBe(`/team/inbox/?card=${TASK}`);
    expect(out.days[0].rows.map((r) => r.href)).toEqual(["/team/ideas/x", null]);
  });

  it("reads only a card id the way inPlace writes it", () => {
    expect(cardParam({ card: TASK.toUpperCase() })).toBe(TASK);
    expect(cardParam({ card: "fix-login-030b0f26" })).toBeNull();
    expect(cardParam({ card: [TASK] })).toBeNull();
    expect(cardParam({})).toBeNull();
  });
});
