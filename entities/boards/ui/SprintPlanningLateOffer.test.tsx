import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// W.112. The offer after committing a card already late for the sprint: what
// it says and what it offers. The click writes through updateCard, which the
// actions tests cover; here only the drawing is proved.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/entities/boards/lib/actions", () => ({ updateCard: vi.fn() }));

import { SprintPlanningLateOffer } from "./SprintPlanningLateOffer";

const sprint = { name: "Sprint 12", starts_on: "2026-09-30", ends_on: "2026-10-06" };
const late = (id: string, title: string) => ({ id, title, due_date: "2026-09-22" });
const render = (cards: ReturnType<typeof late>[], s: typeof sprint | { name: string; starts_on: string | null; ends_on: string | null } = sprint) =>
  renderToStaticMarkup(<SprintPlanningLateOffer cards={cards} sprint={s} boardSlug="b" onClose={() => undefined} />);

describe("the late-card offer", () => {
  it("names one late card and offers the sprint's first day, its last, or keeping the date", () => {
    const html = render([late("c1", "Ship the report")]);
    expect(html).toContain("Ship the report");
    expect(html).toContain("before Sprint 12 starts");
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain("Keep the date");
  });

  it("counts several late cards rather than listing them", () => {
    const html = render([late("c1", "One"), late("c2", "Two")]);
    expect(html).toContain("2 cards just committed are due before Sprint 12 starts");
    expect(html).toContain("Keep the dates");
  });

  it("offers one date when the sprint has no end, and nothing when it has no start", () => {
    expect(render([late("c1", "One")], { ...sprint, ends_on: null }).match(/<button/g)).toHaveLength(2);
    expect(render([late("c1", "One")], { ...sprint, starts_on: null })).toBe("");
    expect(render([])).toBe("");
  });
});
