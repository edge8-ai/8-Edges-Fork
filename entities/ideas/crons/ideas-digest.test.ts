import { describe, expect, it, vi } from "vitest";

// The weekly Spark round-up is encouragement, never a register (TH.7.1). These
// cases hold the copy to that: it credits what people chose to share, says
// what moved, ends with an open invitation, and has nothing that names or
// counts someone who did not post.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {}, supabase: {} }));
vi.mock("@/entities/boards", () => ({ cardsForIdeas: vi.fn() }));

import { composeDigest, movedThisWeek, submitter } from "./ideas-digest";

type Row = Parameters<typeof submitter>[0];
const row = (people: Row["people"]) => ({ people }) as Row;
const spark = (kind: string, title: string, name: string, takeaway: string | null = null) =>
  ({ id: title, kind, title, takeaway, created_at: "2026-10-08T00:00:00Z", person_id: name, people: { display_name: name, email: `${name}@x.test` } }) as Row;
const ideasUrl = "https://os.example/team/ideas";
const quiet = { builds: [], learnings: [], pickedUp: [], shipped: [], ideasUrl };

// Words that turn a round-up into a register. None may appear in any week's copy.
const PRESSURE = [/did not submit/i, /didn.t/i, /pending/i, /nudge/i, /top contributor/i, /leaderboard/i, /nothing from you/i];
function expectNoPressure(text: string) {
  for (const word of PRESSURE) expect(text).not.toMatch(word);
}

describe("the digest's submitter", () => {
  it("is the display name", () => {
    expect(submitter(row({ display_name: "Hiếu Nguyễn", full_name: "Nguyễn Văn Hiếu", email: "h@x.test" }))).toBe("Hiếu Nguyễn");
  });

  it("is the email for a submitter with no name", () => {
    expect(submitter(row({ display_name: null, preferred_name: null, full_name: null, email: "h@x.test" }))).toBe("h@x.test");
  });

  it("is \"Someone\" when the submitter is missing", () => {
    expect(submitter(row(null))).toBe("Someone");
  });
});

describe("a week with sparks", () => {
  const week = {
    builds: [spark("build", "Auto-tag invoices", "Ada"), spark("build", "One-click standup", "Ben")],
    learnings: [spark("learning", "Short prompts held up", "Cy", "Two lines beat a page")],
    pickedUp: [{ title: "Auto-tag invoices", who: "Dee" }],
    shipped: [{ title: "Leave calendar export", who: null }],
    ideasUrl,
  };
  const { subject, html, lark } = composeDigest(week);

  it("says what was shared in the subject, with no pending count", () => {
    expect(subject).toBe("This week in Spark: 2 ideas, 1 learning, 1 shipped");
  });

  it("credits each spark by title beside the person who shared it", () => {
    expect(html).toContain("<strong>Auto-tag invoices</strong>, shared by Ada");
    expect(html).toContain("<strong>Short prompts held up</strong>, shared by Cy<br/>Two lines beat a page");
    expect(lark).toContain("- Idea: One-click standup (Ben)");
  });

  it("says what moved", () => {
    expect(html).toContain("<h3>Shipped</h3><ul><li><strong>Leave calendar export</strong></li></ul>");
    expect(html).toContain("<strong>Auto-tag invoices</strong>, picked up by Dee");
    expect(lark).toContain("- Picked up: Auto-tag invoices (Dee)");
  });

  it("ends with an open invitation to /team/ideas, in the email and the Lark post", () => {
    expect(html.endsWith(`<a href="${ideasUrl}">share a spark</a>.</p>`)).toBe(true);
    expect(lark.split("\n").at(-1)).toBe(`Share a spark: ${ideasUrl}`);
  });

  it("has no non-submitter section and no pressure", () => {
    expectNoPressure(subject);
    expectNoPressure(html);
    expectNoPressure(lark);
  });

  it("escapes what people wrote", () => {
    expect(composeDigest({ ...quiet, builds: [spark("build", "<b>x</b>", "Ada")] }).html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("a quiet week", () => {
  const { subject, html, lark } = composeDigest(quiet);

  it("has a warm subject, never a count of what is missing", () => {
    expect(subject).toBe("A quiet week in Spark — the sky is waiting for your next one");
  });

  it("is warm and still links to /team/ideas", () => {
    expect(html).toContain("It was a quiet week in Spark. That is fine: good ideas turn up when they are ready.");
    expect(html).toContain(`<a href="${ideasUrl}">share a spark</a>`);
    expect(lark).toContain(ideasUrl);
    expectNoPressure(subject + html + lark);
  });

  it("says earlier sparks kept moving when nothing new was shared but something shipped", () => {
    const moved = composeDigest({ ...quiet, shipped: [{ title: "Leave calendar export", who: "Dee" }] });
    expect(moved.subject).toBe("This week in Spark: 1 shipped");
    expect(moved.html).toContain("No new sparks this week, and earlier ones kept moving.");
  });
});

describe("what moved this week", () => {
  const since = "2026-10-02T00:00:00Z";
  const titles = new Map([["i1", "Auto-tag"], ["i2", "Standup"], ["i3", "Export"], ["i4", "Old"]]);
  const card = (ideaId: string, status: string, createdAt: string, completedAt: string | null = null) =>
    ({ ideaId, taskId: ideaId, title: "", status, boardSlug: "b", boardName: "B", columnName: null, assigneeId: "p", assigneeName: "Dee", createdAt, completedAt });

  it("counts a card done in the window as shipped, and one opened in the window as picked up", () => {
    const moved = movedThisWeek(
      [
        card("i1", "doing", "2026-10-05T00:00:00Z"),
        card("i2", "done", "2026-09-01T00:00:00Z", "2026-10-06T00:00:00Z"),
        card("i3", "not_doing", "2026-10-05T00:00:00Z"),
        card("i4", "doing", "2026-09-01T00:00:00Z"),
        card("unknown", "doing", "2026-10-05T00:00:00Z"),
      ],
      titles,
      since,
    );
    expect(moved).toEqual({ pickedUp: [{ title: "Auto-tag", who: "Dee" }], shipped: [{ title: "Standup", who: "Dee" }] });
  });
});
