import { describe, expect, it } from "vitest";
import type { InboxCardFact } from "@/kernel/shell/page-slots";
import type { InboxItem } from "@/entities/notifications/lib/inbox";
import type { NotificationKind } from "@/entities/notifications/lib/kinds";
import { dueDates, greeting, remindedCards, teamInbox } from "./team-inbox";

// TH.8. The team Inbox sorts what arrived into asks from teammates, the
// routine's reminders and what happened, and the rules below are the ones the
// approved canvas draws: asks never mix with reminders, a reminder about a
// finished card is left out, subtasks sit under their card, every reminder is
// listed, and cleared reminders are not news.

let seq = 0;
function item(kind: NotificationKind, over: Partial<InboxItem> = {}): InboxItem {
  seq += 1;
  return {
    id: `n${seq}`,
    kind,
    title: `row ${seq}`,
    body: null,
    href: null,
    createdAt: "2026-10-14T01:00:00Z",
    readAt: null,
    subject: null,
    doneAt: null,
    actor: null,
    dueOn: null,
    ...over,
  };
}
const due = (card: string, dueOn: string, over: Partial<InboxItem> = {}) =>
  item("card.due_tomorrow", { subject: `card:${card}`, dueOn, title: `Was due: “${card}”`, href: `/team/boards/x?card=${card}`, ...over });
const fact = (id: string, title: string, open = true, parent: { id: string; title: string } | null = null): [string, InboxCardFact] => [id, { id, title, open, parent }];
const asIs = (i: InboxItem) => i.href;

describe("dueDates", () => {
  it("groups reminders by the date they announced, newest date first, with every reminder listed", () => {
    const { dates } = dueDates([due("a", "2026-10-13"), due("b", "2026-10-16"), due("c", "2026-10-13")], null, asIs);
    expect(dates.map((d) => [d.day, d.label, d.dow, d.dd, d.ids.length])).toEqual([
      ["2026-10-16", "Fri 16 Oct", "FRI", "16", 1],
      ["2026-10-13", "Tue 13 Oct", "TUE", "13", 2],
    ]);
  });

  it("puts a subtask under its card: the card heads the group when it is due too, and is a label when it is not", () => {
    const facts = new Map([
      fact("r5", "R.5 People import"),
      fact("r53", "R.5.3 Admin grants", true, { id: "r5", title: "R.5 People import" }),
      fact("tr4", "TR.4 Inbox", true, { id: "w123", title: "W.123 Plan training tracking" }),
      fact("tr6", "TR.6 Outcomes", true, { id: "w123", title: "W.123 Plan training tracking" }),
    ]);
    const { dates } = dueDates([due("r5", "2026-10-16"), due("r53", "2026-10-16"), due("tr4", "2026-10-16"), due("tr6", "2026-10-16")], facts, asIs);
    const [r5, w123] = dates[0].clusters;
    expect(r5).toMatchObject({ key: "r5", title: "R.5 People import", head: { title: "R.5 People import" } });
    expect(r5.kids.map((k) => k.title)).toEqual(["R.5.3 Admin grants"]);
    expect(w123).toMatchObject({ key: "w123", title: "W.123 Plan training tracking", head: null });
    expect(w123.kids.map((k) => k.title)).toEqual(["TR.4 Inbox", "TR.6 Outcomes"]);
    expect(dates[0].ids).toHaveLength(4);
  });

  it("leaves out a reminder whose card is finished, set aside or gone, and says which", () => {
    const facts = new Map([fact("open", "D.4 Sign-in"), fact("done", "R.1 Scaffold", false)]);
    const { dates, cleared } = dueDates([due("open", "2026-10-13"), due("done", "2026-10-14"), due("gone", "2026-10-13")], facts, asIs);
    expect(dates.flatMap((d) => d.clusters.map((c) => c.title))).toEqual(["D.4 Sign-in"]);
    expect(cleared).toEqual(["R.1 Scaffold", "Was due: “gone”"]);
  });

  it("shows every reminder flat, and hides none, when boards could not say what the cards are", () => {
    const { dates, cleared } = dueDates([due("a", "2026-10-13"), due("b", "2026-10-13")], null, asIs);
    expect(cleared).toEqual([]);
    expect(dates[0].clusters.map((c) => [c.title, c.head?.title, c.kids.length])).toEqual([
      ["Was due: “a”", "Was due: “a”", 0],
      ["Was due: “b”", "Was due: “b”", 0],
    ]);
  });

  it("keeps one reminder per card, under its newest date, and clears all of its rows together", () => {
    const { dates } = dueDates([due("a", "2026-10-16"), due("a", "2026-10-13")], null, asIs);
    expect(dates).toHaveLength(1);
    expect(dates[0].day).toBe("2026-10-16");
    expect(dates[0].ids).toHaveLength(2);
  });
});

describe("teamInbox", () => {
  const open = <R>(row: R) => row;

  it("leads with asks from teammates only: the routine's reminders never join them", () => {
    const inbox = {
      needs: [item("card.mentioned", { subject: "card:m" }), due("a", "2026-10-13"), item("card.assigned", { subject: "card:s" })],
      happened: [],
    };
    const model = teamInbox(inbox, null, open);
    expect(model.asks.map((r) => r.kind)).toEqual(["card.mentioned", "card.assigned"]);
    expect(model.dueIds).toHaveLength(1);
    expect(remindedCards(inbox)).toEqual(["a"]);
  });

  it("keeps cleared reminders out of what happened, which is news, and counts the unread updates", () => {
    const now = new Date("2026-10-18T08:00:00Z");
    const happened = [
      item("card.completed", { createdAt: "2026-10-18T02:00:00Z" }),
      item("kudos.received", { createdAt: "2026-10-18T03:00:00Z", readAt: "2026-10-18T04:00:00Z" }),
      due("a", "2026-10-13", { doneAt: "2026-10-18T05:00:00Z" }),
    ];
    const model = teamInbox({ needs: [], happened }, null, open, now);
    expect(model.days.flatMap((d) => d.rows.map((r) => r.kind))).toEqual(["kudos.received", "card.completed"]);
    expect(model.unreadUpdates).toBe(1);
  });
});

describe("teamInbox and decisions (TH.11)", () => {
  it("never lists an approval as an ask or an update: the Decisions section owns it", () => {
    const now = new Date("2026-10-18T08:00:00Z");
    const inbox = {
      needs: [item("approval.waiting", { subject: null }), item("card.mentioned", { subject: "card:m" })],
      happened: [item("approval.waiting", { doneAt: "2026-10-18T05:00:00Z", createdAt: "2026-10-18T02:00:00Z" })],
    };
    const model = teamInbox(inbox, null, <R>(row: R) => row, now);
    expect(model.asks.map((r) => r.kind)).toEqual(["card.mentioned"]);
    expect(model.days.flatMap((d) => d.rows.map((r) => r.kind))).toEqual([]);
  });
});

describe("greeting", () => {
  it("greets by the Saigon clock", () => {
    expect(greeting(new Date("2026-10-18T01:00:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-18T07:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-18T13:00:00Z"))).toBe("Good evening");
  });
});
