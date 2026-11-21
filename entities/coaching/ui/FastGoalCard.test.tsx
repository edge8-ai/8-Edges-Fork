import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MyGoalRow } from "@/entities/coaching/lib/my-goal-row";

// The card's four letters must mean what the goal form's checks say they mean
// (lib/fast-checks.ts): A is the stretch — "what would doubling it look like?" —
// and T is the company goal everyone can see it lifts. Production, 2026-10-06:
// the card drew the company goal under A, so three different goals all read
// "Lifts Maintain client CSAT above 4.5/5" as their ambition, and the stretch
// a member wrote appeared nowhere.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/entities/coaching/lib/my-actions", () => ({
  updateMyGoalProgress: vi.fn(),
  writeMyGoalLetter: vi.fn(),
  endMyGoal: vi.fn(),
}));
vi.mock("@/entities/coaching/lib/goal-actions", () => ({ commentOnGoal: vi.fn() }));

const { FastGoalCard } = await import("./FastGoalCard");

const goal = (over: Partial<MyGoalRow> = {}): MyGoalRow => ({
  id: "g-1",
  title: "Cut onboarding time support 3 hours to 2 hours 31 Oct",
  descriptionMarkdown: null,
  stretchMarkdown: null,
  status: "active",
  quarterLabel: "2026-Q4",
  hasLetter: false,
  letterSealedOn: null,
  metricUnit: "hours",
  startValue: 3,
  targetValue: 2,
  currentValue: 2,
  dueDate: "2026-10-31",
  ladderLabel: "Maintain client CSAT above 4.5/5",
  ladderValue: "key_result:kr-1",
  canDelete: true,
  comments: [],
  bumps: 1,
  lastBumpAt: null,
  alignMeasure: "4.2 of 4.5 score",
  outcomeNote: null,
  extendedFrom: null,
  ...over,
});

const html = (g: MyGoalRow) =>
  renderToStaticMarkup(
    <FastGoalCard goal={g} coachName={null} todayISO="2026-10-06" may={{ "coaching.mine": true }} busy={false}
      onEdit={() => {}} onDelete={async () => ({ ok: true })} onDeleted={() => {}} />,
  );

// The text of one letter's row, from its word to the next row.
function row(markup: string, word: string): string {
  const at = markup.indexOf(`>${word}<`);
  if (at < 0) throw new Error(`no ${word} row`);
  const next = markup.indexOf("coach-fast-row", at);
  return markup.slice(at, next < 0 ? undefined : next).replace(/<[^>]+>/g, " ");
}

describe("the FAST card's letters", () => {
  it("puts the stretch under Ambitious, not the company goal", () => {
    const a = row(html(goal({ stretchMarkdown: "Onboarding in 1 hour, self-serve" })), "Ambitious");
    expect(a).toContain("Onboarding in 1 hour, self-serve");
    expect(a).not.toContain("Maintain client CSAT");
  });
  it("asks for a stretch when there is none", () => {
    expect(row(html(goal()), "Ambitious")).toContain("What would doubling it look like?");
  });
  it("puts the company goal it lifts, with its number, under Transparent", () => {
    const t = row(html(goal()), "Transparent");
    expect(t).toContain("Lifts Maintain client CSAT above 4.5/5");
    expect(t).toContain("4.2 of 4.5 score");
    expect(t).toContain("Your coach and your team can see it");
  });
  it("reads a cut as heading down, and the S line says where it started (K.78)", () => {
    const markup = html(goal({ currentValue: 3 }));
    const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("3 hours, down to 2");
    expect(text).not.toContain("of 2 hours");
    expect(row(markup, "Specific")).toContain("target 2 hours, down from 3");
  });
  it("offers to add a target, not to update a number, on a goal with no target (K.78)", () => {
    const markup = html(goal({ metricUnit: null, startValue: null, targetValue: null, currentValue: 3 }));
    expect(markup).not.toContain("Update my number");
    expect(markup).toContain("No target yet");
    expect(markup).toContain("Add a target");
  });
  it("says so under Transparent when the goal lifts no company goal", () => {
    expect(row(html(goal({ ladderLabel: null, ladderValue: "" })), "Transparent")).toContain(
      "Not linked to a company goal yet",
    );
  });
});

// K.83: a goal past its date asks "did it land?" where "Update my number" was,
// and a goal that already has an ending no longer offers a number to update.
describe("a FAST goal's ending (K.83)", () => {
  const ended = { status: "active" as const, dueDate: "2026-09-30" };

  it("asks an ended goal how it went, in place of the number update", () => {
    const out = html(goal(ended));
    expect(out).toContain("Ended 30 Sep · did it land?");
    expect(out).toContain("Its date was 30 Sep. Did it land?");
    for (const answer of [">Landed<", ">Missed<", ">Extend<"]) expect(out).toContain(answer);
    expect(out).not.toContain("Update my number");
  });

  it("leaves a goal still running alone, and says when it was extended", () => {
    const running = html(goal({ dueDate: "2026-10-31", extendedFrom: "2026-09-30" }));
    expect(running).not.toContain("did it land?");
    expect(running).toContain("extended from 30 Sep");
  });

  it("shows a missed goal's line, and offers no number to update on a finished goal", () => {
    const missed = html(goal({ ...ended, status: "missed", outcomeNote: "Launch slipped to November" }));
    expect(missed).toContain("Launch slipped to November");
    expect(missed).not.toContain("did it land?");
    expect(missed).not.toContain("Update my number");
    const landed = html(goal({ ...ended, status: "achieved" }));
    expect(landed).not.toContain("Update my number");
    expect(landed).not.toContain("did it land?");
  });
});
