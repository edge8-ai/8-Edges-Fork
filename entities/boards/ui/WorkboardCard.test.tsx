import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardCard as Row } from "@/entities/boards/lib/workboard";
import { WorkboardCard } from "./WorkboardCard";
import { faceDate, facePrLabel } from "./card-face";
import type { Card } from "./board-view-types";

// W.160: the card face as the approved canvas draws it ("Card faces on the
// board"). A static render is the face at rest, which is what a lane is read
// by. The clock is pinned, because overdue and aging are judged against today.

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T03:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const epic = { id: "e1", board_id: "b1", name: "Workboard UX", description: null, color: "blue", status: "active", sort_order: 0 } as unknown as EpicRow;

const card = (over: Partial<Row> = {}): Card =>
  ({
    id: "c1",
    title: "Redesign the work card drawer",
    description: null,
    board_id: "b1",
    board_column_id: "col1",
    sprint_id: null,
    epic_id: "e1",
    position: 0,
    assignee_id: "p1",
    created_by: null,
    status: "open",
    priority: "p2",
    due_date: "2026-10-10",
    human_tokens: 1.3,
    completed_at: null,
    internal: false,
    subject_type: null,
    subject_id: null,
    parent_task_id: null,
    metadata: {},
    archived_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    assignee_name: "Ada Rivers",
    subject_label: null,
    agent: false,
    subtasks: [],
    blockers: [],
    comments: [{ id: "m1", author: "Ada Rivers", body: "On it.", createdAt: "2026-10-02T00:00:00Z" }],
    blocks: 1,
    last_moved_at: "2026-10-04T00:00:00Z",
    laneId: "Doing",
    ...over,
  }) as unknown as Card;

function face(c: Card, opts: { epics?: EpicRow[]; quick?: boolean; viewer?: string | null; client?: string } = {}) {
  const epics = opts.epics ?? [epic];
  return renderToStaticMarkup(
    <WorkboardCard
      card={c}
      board={opts.client ? ({ id: "b1", name: "Acme board", client_name: opts.client, client_color: 2 } as never) : undefined}
      showBoard={Boolean(opts.client)}
      viewerPersonId={opts.viewer ?? null}
      sprintFilter=""
      sprintName={new Map()}
      epicById={new Map(epics.map((e) => [e.id, e]))}
      quick={
        opts.quick
          ? ({ people: [], saving: false, onAssignee: () => {}, onDueDate: () => {}, onToggleSubtask: () => {} } as never)
          : undefined
      }
    />,
  );
}

describe("the card face's words", () => {
  it("dates a due card, a late one and a finished one as the canvas does", () => {
    const open = { status: "open", completed_at: null };
    expect(faceDate({ ...open, due_date: "2026-10-10" }, false)).toEqual({ text: "Sat 10 Oct", kind: "due" });
    expect(faceDate({ ...open, due_date: "2026-10-02" }, true)).toEqual({ text: "Overdue · 2 Oct", kind: "overdue" });
    // 20:00 UTC on the 2nd is the 3rd in Saigon: the business day, not the UTC one.
    expect(faceDate({ status: "done", due_date: "2026-09-30", completed_at: "2026-10-02T20:00:00Z" }, false)).toEqual({
      text: "Done 3 Oct",
      kind: "done",
    });
    expect(faceDate({ ...open, due_date: null }, false)).toBeNull();
  });

  it("names the PR by number, and its state once something has stamped it", () => {
    expect(facePrLabel("https://github.com/edge8-ai/edge8-web/pull/1781", null)).toBe("PR #1781");
    expect(facePrLabel("https://github.com/edge8-ai/edge8-web/pull/1781", "merged")).toBe("PR #1781 merged");
  });
});

describe("the card face (W.160)", () => {
  it("leads with the epic's colour square and name, then the title", () => {
    const out = face(card());
    expect(out).toContain('class="wb-face-epic-mark" data-epic-color=');
    expect(out).toContain(">Workboard UX<");
    expect(out.indexOf("Workboard UX")).toBeLessThan(out.indexOf("Redesign the work card drawer"));
  });

  it("draws no epic line for a board without epics when another board's epics are in view (bug hunt U2)", () => {
    const elsewhere = { ...epic, id: "e9", board_id: "b2" } as EpicRow;
    expect(face(card({ epic_id: null }), { epics: [elsewhere] })).not.toContain("wb-face-epic");
  });

  it("keeps an undated card's facts at the left of its meta line (bug hunt U1)", () => {
    const out = face(card({ due_date: null }), { quick: true });
    expect(out).toContain("wb-quick-setdate");
    expect(out).not.toContain("u-ml-auto");
  });

  it("says No epic on a board that has epics, and draws no epic line on one that has none", () => {
    expect(face(card({ epic_id: null }))).toContain(">No epic<");
    expect(face(card({ epic_id: null }), { epics: [] })).not.toContain("wb-face-epic");
  });

  it("puts date, priority, Human Tokens and the avatar on one meta line, and nothing else", () => {
    const out = face(card());
    const meta = out.slice(out.indexOf('class="wb-face-meta"'));
    expect(meta).toContain(">Sat 10 Oct<");
    expect(meta).toContain(">P2<");
    expect(meta).toContain(">1.3 HT<");
    expect(meta).toContain('class="wb-face-avatar" aria-hidden="true">AR<');
    expect(meta).toContain("Assigned to Ada Rivers");
    // Comments, the cards waiting on this one and the build summary left the face.
    expect(out).not.toContain('title="Comments"');
    expect(out).not.toContain("waiting on this card");
    expect(out).not.toContain("wb-facts");
  });

  it("says Overdue in words, not in colour alone", () => {
    expect(face(card({ due_date: "2026-10-02" }))).toContain('class="wb-face-date is-overdue">Overdue · 2 Oct<');
  });

  it("mutes a finished card's title and dates its completion, with no priority or size", () => {
    const out = face(card({ status: "done", completed_at: "2026-10-03T02:00:00Z" }));
    expect(out).toContain("wb-face-title is-done");
    expect(out).toContain(">Done 3 Oct<");
    expect(out).not.toContain(">P2<");
    expect(out).not.toContain("1.3 HT");
  });

  // Bug hunt F14: only `done` was history, so a card set aside kept its old
  // due date as an ordinary date, its priority, its size and the date edit.
  it("reads a Not Doing card as history too: what happened, and no priority, size or date edit", () => {
    expect(faceDate({ status: "not_doing", due_date: "2026-10-02", completed_at: null }, true)).toEqual({
      text: "Not doing",
      kind: "not-doing",
    });
    const out = face(card({ status: "not_doing", due_date: "2026-10-02" }), { quick: true });
    expect(out).toContain("wb-face-title is-done");
    expect(out).toContain('class="wb-face-date is-not-doing">Not doing<');
    expect(out).not.toContain("Overdue");
    expect(out).not.toContain("2 Oct");
    expect(out).not.toContain(">P2<");
    expect(out).not.toContain("1.3 HT");
    expect(out).not.toContain("wb-quick-due-text");
    expect(out).not.toContain("wb-quick-setdate");
    // The people stay: who had it is still worth knowing.
    expect(out).toContain('aria-label="Assigned to Ada Rivers. Change"');
  });

  it("names the client once, at the far end of the meta line, on an all-boards view", () => {
    const out = face(card(), { client: "Acme Pty" });
    const end = out.slice(out.indexOf('class="wb-face-end"'));
    expect(end).toContain(">Acme Pty<");
    expect(end.indexOf("Acme Pty")).toBeLessThan(end.indexOf("wb-face-avatar"));
    expect(face(card())).not.toContain("wb-facts-client");
  });

  it("shows the paperclip and its number when the card has deliverables, and nothing otherwise (W.158)", () => {
    const out = face(card({ deliverable_count: 4 } as never));
    expect(out).toContain('title="4 deliverables"');
    expect(out.indexOf('title="4 deliverables"')).toBeLessThan(out.indexOf("wb-face-end"));
    expect(face(card({ deliverable_count: 0 } as never))).not.toContain("deliverable");
    // The portal's cards never carry the count, so they never draw it.
    expect(face(card())).not.toContain("deliverable");
  });

  it("drops Mine, because the avatar says it", () => {
    expect(face(card(), { viewer: "p1" })).not.toContain(">Mine<");
  });

  it("raises blocked and aging as chips that never fold", () => {
    const out = face(
      card({
        blockers: [{ id: "b1", resolved_at: null }, { id: "b2", resolved_at: null }] as never,
        last_moved_at: "2026-09-20T00:00:00Z",
      }),
    );
    expect(out).toContain("2 blockers");
    expect(out).toMatch(/title="In this column for \d+ days"/);
  });

  it("names the PR, and its state when known", () => {
    const pr = "https://github.com/edge8-ai/edge8-web/pull/1781";
    expect(face(card({ metadata: { pr_url: pr } }))).toContain("PR #1781</a>");
    const merged = face(card({ metadata: { pr_url: pr, pr_synced: { key: "edge8-web#1781", title: "Card drawer", state: "merged" } } }));
    expect(merged).toContain("wb-chip-link is-merged");
    expect(merged).toContain("PR #1781 merged</a>");
  });

  it("makes the date and the avatar the in-place edits on a board that allows them", () => {
    const out = face(card(), { quick: true });
    expect(out).toContain("wb-quick-due-text");
    expect(out).toContain(">Sat 10 Oct</button>");
    expect(out).toContain('aria-label="Assigned to Ada Rivers. Change"');
    expect(out).toContain("wb-face-quick");
  });
});
