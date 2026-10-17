import { describe, expect, it } from "vitest";
import { assignedDraft, commentedDraft, dueTomorrowDraft, dueWhen, ideaSetAsideDraft, mentionedDraft } from "./work-kinds";
import { ALWAYS_ON_KINDS, NEEDS_YOU_KINDS, NOTIFICATION_KINDS, subjectOf } from "./kinds";
import { NOTIFICATION_GROUPS } from "../ui/inbox-groups";

// TH.2: what the inbox says when a person's work changes, and to whom.

const TASK = "11111111-2222-3333-4444-555555555555";
const IDEA = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const links = { adminHref: `/admin/boards/eight-edges?card=${TASK}`, teamHref: `/team/boards/eight-edges?card=${TASK}` };

describe("assignedDraft", () => {
  const assigned = { taskId: TASK, boardSlug: "eight-edges", title: "Ship it", note: "The list is on the card.", actorName: "Derek", assigneeId: "khoa", actorPersonId: "derek" };

  it("tells the new assignee who handed it over, with the handover note, about the card", () => {
    expect(assignedDraft(assigned, new Date("2026-10-10T09:30:00Z"))).toEqual({
      personId: "khoa",
      kind: "card.assigned",
      title: "Derek assigned you “Ship it”",
      body: "The list is on the card.",
      ...links,
      eventKey: `${TASK}:2026-10-10T09`,
      subject: `card:${TASK}`,
    });
  });

  it("says nothing to a person who took the card themselves", () => {
    expect(assignedDraft({ ...assigned, actorPersonId: "khoa" })).toBeNull();
  });

  it("lands a retried delivery once, and a later handover again", () => {
    const first = assignedDraft(assigned, new Date("2026-10-10T09:05:00Z"))?.eventKey;
    expect(assignedDraft(assigned, new Date("2026-10-10T09:55:00Z"))?.eventKey).toBe(first);
    expect(assignedDraft(assigned, new Date("2026-10-13T02:00:00Z"))?.eventKey).not.toBe(first);
  });
});

describe("mentionedDraft and commentedDraft", () => {
  const mention = { taskId: TASK, boardSlug: "eight-edges", commentId: "c1", body: "@Khoa which eval?", title: "Y.67", actorName: "Mai", assigneeId: "khoa", actorPersonId: "mai" };

  it("tells the person tagged, with the words, keyed on the comment", () => {
    expect(mentionedDraft(mention)).toMatchObject({ personId: "khoa", kind: "card.mentioned", title: "Mai mentioned you on “Y.67”", body: "@Khoa which eval?", eventKey: "c1", subject: `card:${TASK}` });
  });

  it("tells the card's owner about a comment, unless the comment already mentioned them", () => {
    const comment = { ...mention, body: "Looks good", mentionedIds: [] as string[] };
    expect(commentedDraft(comment)).toMatchObject({ personId: "khoa", kind: "card.commented", title: "Mai commented on “Y.67”" });
    expect(commentedDraft({ ...comment, mentionedIds: ["khoa"] })).toBeNull();
    expect(commentedDraft({ ...comment, actorPersonId: "khoa" })).toBeNull();
  });

  it("cuts a long comment to an inbox line", () => {
    const body = mentionedDraft({ ...mention, body: "x".repeat(400) })?.body ?? "";
    expect(body.length).toBe(160);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("dueTomorrowDraft", () => {
  const due = { taskId: TASK, boardSlug: "eight-edges", dueOn: "2026-10-13", title: "TH.2.1", assigneeId: "khoa" };

  it("says tomorrow when it is, and names the day when a Friday run reaches past it", () => {
    expect(dueWhen("2026-10-13", "2026-10-12")).toBe("tomorrow");
    expect(dueWhen("2026-10-12", "2026-10-09")).toBe("Mon 12 Oct");
    expect(dueTomorrowDraft(due, "2026-10-12")).toMatchObject({ personId: "khoa", title: "Due tomorrow: “TH.2.1”", eventKey: `${TASK}:2026-10-13` });
  });

  it("tells nobody about a card with no assignee", () => {
    expect(dueTomorrowDraft({ ...due, assigneeId: null }, "2026-10-12")).toBeNull();
  });
});

describe("ideaSetAsideDraft", () => {
  it("tells the spark's author it is open again, linking the spark, about the spark", () => {
    expect(ideaSetAsideDraft({ ideaId: IDEA, taskId: TASK, boardSlug: "eight-edges", title: "Office plants", assigneeId: "author", actorPersonId: "loi" })).toEqual({
      personId: "author",
      kind: "idea.set_aside",
      title: "The card picked up from “Office plants” was set aside",
      body: "Your spark is open again for anyone to pick up.",
      adminHref: null,
      teamHref: `/team/ideas/${IDEA}`,
      eventKey: TASK,
      subject: `idea:${IDEA}`,
    });
  });
});

describe("the TH.2 kind lists", () => {
  it("names a subject only for a uuid, lower-cased, so the column's check never refuses it", () => {
    expect(subjectOf("card", TASK.toUpperCase())).toBe(`card:${TASK}`);
    expect(subjectOf("card", "t1")).toBeNull();
    expect(subjectOf("idea", null)).toBeNull();
  });

  it("keeps every request kind and every always-on kind a real kind, and always-on a request", () => {
    for (const k of [...NEEDS_YOU_KINDS, ...ALWAYS_ON_KINDS]) expect(k in NOTIFICATION_KINDS).toBe(true);
    for (const k of ALWAYS_ON_KINDS) expect(NEEDS_YOU_KINDS).toContain(k);
  });

  it("puts every kind in exactly one settings group", () => {
    const grouped = NOTIFICATION_GROUPS.flatMap((g) => g.kinds);
    expect([...grouped].sort()).toEqual(Object.keys(NOTIFICATION_KINDS).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});
