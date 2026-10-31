import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateInterview, GridCell } from "@/entities/team/lib/hiring";

// TH.18 moved the Hiring page's chips into their own file and restyled them.
// What they say must not change, and above all a round stays blind to a
// panelist who has not scored it yet.

vi.mock("@/entities/hiring", () => ({
  RECOMMENDATIONS: [
    { key: "advance", label: "Advance", tone: "ok" },
    { key: "reject", label: "Reject", tone: "err" },
  ],
}));

import { GridCellNode, InterviewOutcomeChip } from "./hiring-chips";

const iv = (over: Partial<CandidateInterview>): CandidateInterview =>
  ({ interviewId: "i1", label: "Technical", scheduledAt: "2026-10-01T03:00:00Z", humanSeats: 2, submitted: 2, recommendations: ["advance", "advance"], avgScore: 8, revealed: true, ...over }) as CandidateInterview;
const text = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/<[^>]+>/g, "");

describe("InterviewOutcomeChip", () => {
  it("keeps the outcome blind to a panelist who has not scored the round", () => {
    const html = renderToStaticMarkup(<InterviewOutcomeChip iv={iv({ revealed: false })} />);
    expect(html.replace(/<[^>]+>/g, "")).toBe("Technical · score it");
    expect(html).not.toMatch(/Advance|8/);
  });

  it("names the panel's call and average once everyone scored, or Split when they disagree", () => {
    expect(text(<InterviewOutcomeChip iv={iv({})} />)).toBe("Technical · Advance 8");
    expect(text(<InterviewOutcomeChip iv={iv({ recommendations: ["advance", "reject"], avgScore: null })} />)).toBe("Technical · Split");
    expect(text(<InterviewOutcomeChip iv={iv({ submitted: 1, recommendations: ["advance"] })} />)).toBe("Technical · 1/2 scored");
  });

  it("says a future round is booked and links every chip to its kit", () => {
    const html = renderToStaticMarkup(<InterviewOutcomeChip iv={iv({ scheduledAt: "2999-01-01T00:00:00Z" })} />);
    expect(html.replace(/<[^>]+>/g, "")).toBe("Technical · booked");
    expect(html).toContain('href="/team/hiring/i1"');
  });
});

describe("GridCellNode", () => {
  it("names the step on every cell so a chip reads on its own", () => {
    const cell = (c: Partial<GridCell>) => ({ status: "open", label: "", interviewId: null, ...c }) as GridCell;
    expect(text(<GridCellNode cell={cell({ status: "done" })} step="Screen call" />)).toBe("Screen call · done");
    expect(text(<GridCellNode cell={cell({ status: "action" })} step="Culture" />)).toBe("Culture · nothing booked");
    expect(text(<GridCellNode cell={cell({ status: "pending", label: "1/2" })} step="Technical" />)).toBe("Technical · 1/2 scored");
  });
});
