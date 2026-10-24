import { describe, expect, it, vi } from "vitest";
// The every-roster list is an internal address upstream and empty in a fork, so
// the test fixes its own lead rather than depending on either.
vi.mock("./every-roster", () => ({ EVERY_ROSTER_EMAILS: ["lead@example.test"] }));

import { ROSTERS, buildCheckIn, inRoster, lineFor, renderCheckIn, type RosterPerson } from "./check-in";
// The in-progress rule moved to the boards entity, which every reporting agent reads (U.2).
import { isInProgressLane } from "@/entities/boards/client";
import type { WorkboardCard, WorkboardLane } from "@/entities/boards";

// The composer is where the workflow's promises live: what counts as activity,
// who is chased, who is never chased, and the fact that a person with no cards
// is named rather than dropped (/workflows/daily-check-in-agent/).

const NOW = new Date("2026-09-09T02:30:00Z");
const SINCE = NOW.getTime() - 24 * 60 * 60 * 1000;
const LANES: WorkboardLane[] = [
  { id: "To do", name: "To do", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Doing", name: "Doing", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Waiting", name: "Waiting", isDone: false, isNotDoing: false, wipLimit: null },
  { id: "Done", name: "Done", isDone: true, isNotDoing: false, wipLimit: null },
];

// `last_moved_at` falls back to the card's creation time in the real read, so
// it says nothing about whether a card actually moved; `last_column_move_at` is
// null until there is a move row and is the field the composer trusts. The
// fixture carries both, defaulting to "never moved, never finished", because
// that is the state a freshly created card is really in.
function card(over: Partial<WorkboardCard> & { id: string; assignee_id: string | null }): WorkboardCard {
  return {
    title: `card ${over.id}`,
    status: "open",
    laneId: "Doing",
    last_moved_at: "2026-09-01T00:00:00Z",
    last_column_move_at: null,
    completed_at: null,
    comments: [],
    blockers: [],
    subtasks: [],
    ...over,
  } as unknown as WorkboardCard;
}

const person = (over: Partial<RosterPerson> = {}): RosterPerson => ({
  personId: "p1",
  email: "alice@example.test",
  name: "Alice",
  department: "Product Development",
  offReason: null,
  ...over,
});

describe("lineFor", () => {
  it("counts a card moved inside the window as activity, and a done card as done", () => {
    const line = lineFor(
      person(),
      [
        card({
          id: "a",
          assignee_id: "p1",
          laneId: "Done",
          status: "done",
          last_column_move_at: "2026-09-09T01:00:00Z",
        }),
      ],
      LANES,
      SINCE,
    );
    expect(line.quiet).toBe(false);
    expect(line.done).toEqual([{ title: "card a", url: null, client: null }]);
    expect(line.doing).toEqual([]);
  });

  it("reports a card finished where it sat, with no column move to show for it", () => {
    // A card completed in place has no move row, so last_column_move_at stays
    // null. Asking only about movement dropped this work out of the report.
    const line = lineFor(
      person(),
      [card({ id: "a", assignee_id: "p1", status: "done", completed_at: "2026-09-09T01:00:00Z" })],
      LANES,
      SINCE,
    );
    expect(line.done).toEqual([{ title: "card a", url: null, client: null }]);
    expect(line.quiet).toBe(false);
  });

  it("leaves a card finished before the window out of Done", () => {
    const line = lineFor(
      person(),
      [card({ id: "a", assignee_id: "p1", laneId: "Done", status: "done", completed_at: "2026-09-01T00:00:00Z" })],
      LANES,
      SINCE,
    );
    expect(line.done).toEqual([]);
    expect(line.quiet).toBe(true);
  });

  it("counts a comment as activity even when the card never moved", () => {
    const line = lineFor(
      person(),
      [card({ id: "b", assignee_id: "p1", comments: [{ id: "c", author: "Bo", body: "note", createdAt: "2026-09-09T01:00:00Z" }] })],
      LANES,
      SINCE,
    );
    expect(line.quiet).toBe(false);
  });

  it("marks a person quiet when nothing moved or was said in 24 hours", () => {
    const line = lineFor(person(), [card({ id: "c", assignee_id: "p1" })], LANES, SINCE);
    expect(line.quiet).toBe(true);
    expect(line.doing).toEqual([{ title: "card c", url: null, client: null }]);
  });

  it("still chases a person who filed cards today and moved none of them", () => {
    // last_moved_at falls back to created_at, so a card created inside the
    // window used to read as activity and took its owner off the Pending line.
    const line = lineFor(
      person(),
      [card({ id: "fresh", assignee_id: "p1", last_moved_at: "2026-09-09T01:00:00Z" })],
      LANES,
      SINCE,
    );
    expect(line.quiet).toBe(true);
  });

  it("shows only the Doing lane, not To do or Waiting", () => {
    const line = lineFor(
      person(),
      [
        card({ id: "todo", assignee_id: "p1", laneId: "To do" }),
        card({ id: "doing", assignee_id: "p1", laneId: "Doing" }),
        card({ id: "waiting", assignee_id: "p1", laneId: "Waiting" }),
      ],
      LANES,
      SINCE,
    );
    expect(line.doing).toEqual([{ title: "card doing", url: null, client: null }]);
  });

  it("reads a board whose in-progress column is not spelled Doing", () => {
    // The test used to be name === "doing", so this board reported every person
    // as having nothing in progress and said nothing about it.
    const lanes: WorkboardLane[] = [
      { id: "To do", name: "To do", isDone: false, isNotDoing: false, wipLimit: null },
      { id: "In progress", name: "In progress", isDone: false, isNotDoing: false, wipLimit: null },
      { id: "Done", name: "Done", isDone: true, isNotDoing: false, wipLimit: null },
    ];
    const line = lineFor(person(), [card({ id: "wip", assignee_id: "p1", laneId: "In progress" })], lanes, SINCE);
    expect(line.doing).toEqual([{ title: "card wip", url: null, client: null }]);
  });

  it("does not mistake a done lane for the in-progress one", () => {
    expect(isInProgressLane("Doing")).toBe(true);
    expect(isInProgressLane(" in progress ")).toBe(true);
    expect(isInProgressLane("In-Progress")).toBe(true);
    expect(isInProgressLane("Done")).toBe(false);
    expect(isInProgressLane("Waiting")).toBe(false);
    expect(isInProgressLane("Not doing")).toBe(false);
  });

  it("names unresolved blockers and ignores resolved ones", () => {
    const line = lineFor(
      person(),
      [
        card({
          id: "d",
          assignee_id: "p1",
          blockers: [
            { id: "1", body: "waiting on API key", assignee_id: null, assignee_name: null, resolved: false, blocked_by: null },
            { id: "2", body: "old", assignee_id: null, assignee_name: null, resolved: true, blocked_by: null },
          ],
        }),
      ],
      LANES,
      SINCE,
    );
    expect(line.blockers).toEqual([{ card: "card d", body: "waiting on API key", url: null, client: null }]);
  });

  it("flags a person with no cards instead of dropping them", () => {
    const line = lineFor(person(), [card({ id: "e", assignee_id: "someone-else" })], LANES, SINCE);
    expect(line.noCards).toBe(true);
  });
});

describe("renderCheckIn", () => {
  const roster = ROSTERS[0];
  const all = (messages: ReturnType<typeof renderCheckIn>) => JSON.stringify(messages);

  it("lists the off person under Off and never under Pending", () => {
    const people = [person({ personId: "p1", name: "Alice" }), person({ personId: "p2", name: "Bob", offReason: "annual leave" })];
    const text = all(renderCheckIn(buildCheckIn(roster, people, [card({ id: "a", assignee_id: "p1" })], LANES, NOW), "Tue 9 Sep"));
    expect(text).toContain("**Off:** Bob (annual leave)");
    expect(text).toContain("**Pending:** Alice");
    expect(text).not.toContain("**Pending:** Alice, Bob");
  });

  it("says so plainly when the roster is empty", () => {
    const text = all(renderCheckIn(buildCheckIn(roster, [], [], LANES, NOW), "Tue 9 Sep"));
    expect(text).toContain("Nobody on this roster today.");
  });

  it("puts Doing and Blockers above Done, so the wall of finished cards is last", () => {
    const cards = [
      card({ id: "open", assignee_id: "p1", laneId: "Doing" }),
      card({ id: "shipped", assignee_id: "p1", laneId: "Done", status: "done", completed_at: "2026-09-09T01:00:00Z" }),
    ];
    const text = all(renderCheckIn(buildCheckIn(roster, [person()], cards, LANES, NOW), "Tue 9 Sep"));
    expect(text.indexOf("**Doing**")).toBeLessThan(text.indexOf("**Blockers**"));
    expect(text.indexOf("**Blockers**")).toBeLessThan(text.indexOf("**Done**"));
    // Reordering must not drop anything: both cards are still named.
    expect(text).toContain("card open");
    expect(text).toContain("card shipped");
  });

  it("names every card instead of stopping at three", () => {
    const cards = ["a", "b", "c", "d", "e"].map((id) => card({ id, assignee_id: "p1" }));
    const text = all(renderCheckIn(buildCheckIn(roster, [person()], cards, LANES, NOW), "Tue 9 Sep"));
    for (const id of ["a", "b", "c", "d", "e"]) expect(text).toContain(`card ${id}`);
    expect(text).not.toContain("more");
  });

  it("names each card as Client - [title](link), and strips brackets from the link text", () => {
    const ref = (c: WorkboardCard) => ({ url: `https://app.example.test/team/boards/b?card=${c.id}`, client: "Acme" });
    const cards = [card({ id: "a", assignee_id: "p1", title: "Fix [the] login" })];
    const text = all(renderCheckIn(buildCheckIn(roster, [person()], cards, LANES, NOW, ref), "Tue 9 Sep"));
    expect(text).toContain("Acme - [Fix the login](https://app.example.test/team/boards/b?card=a)");
  });

  it("names a card on a board with no client as Internal", () => {
    const text = all(renderCheckIn(buildCheckIn(roster, [person()], [card({ id: "a", assignee_id: "p1" })], LANES, NOW), "Tue 9 Sep"));
    expect(text).toContain("Internal - card a");
  });

  it("posts as a Lark card with the roster and date in the header", () => {
    const [message] = renderCheckIn(buildCheckIn(roster, [person()], [], LANES, NOW), "Tue 9 Sep");
    const header = (message.card as { header: { title: { content: string } } }).header;
    expect(header.title.content).toBe("Check-in · Product Team · Tue 9 Sep");
  });

  it("splits a report too long for one Lark card, keeping everyone", () => {
    const people = Array.from({ length: 12 }, (_, i) => person({ personId: `p${i}`, name: `Person ${i}` }));
    const cards = people.flatMap((p) =>
      Array.from({ length: 40 }, (_, k) => card({ id: `${p.personId}-${k}`, assignee_id: p.personId, title: `A long enough card title number ${k} for ${p.name}` })),
    );
    const messages = renderCheckIn(buildCheckIn(roster, people, cards, LANES, NOW), "Tue 9 Sep");
    expect(messages.length).toBeGreaterThan(1);
    for (const m of messages) expect(JSON.stringify(m).length).toBeLessThan(30_000);
    const text = all(messages);
    for (const p of people) expect(text).toContain(`**${p.name}**`);
  });
});

describe("inRoster", () => {
  const [product, eo, ops] = ["product", "eo", "ops"].map((k) => ROSTERS.find((r) => r.key === k)!);

  it("places each department in its own roster only", () => {
    const opsPerson = person({ department: "Operations", email: "ops@example.test" });
    expect(inRoster(ops, opsPerson)).toBe(true);
    expect(inRoster(product, opsPerson)).toBe(false);
    expect(inRoster(eo, opsPerson)).toBe(false);
  });

  it("puts the lead in every roster whatever their department, with the same line in each", () => {
    const dave = person({ personId: "dave", name: "Dave", email: "Lead@example.test", department: "Product Development" });
    for (const r of [product, eo, ops]) expect(inRoster(r, dave)).toBe(true);
    const cards = [card({ id: "x", assignee_id: "dave" })];
    const lines = [product, eo, ops].map((r) => buildCheckIn(r, [dave], cards, LANES, NOW).lines[0]);
    expect(lines[1]).toEqual(lines[0]);
    expect(lines[2]).toEqual(lines[0]);
  });

  it("leaves out a department that belongs to no roster", () => {
    const other = person({ department: "On Target", email: "someone@example.test" });
    for (const r of [product, eo, ops]) expect(inRoster(r, other)).toBe(false);
  });
});
