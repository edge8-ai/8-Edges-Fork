import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JobReqRow } from "./JobReqsTable";

// Since the 11 Nov card redesign (TR.22) an open job is drawn as a card, and
// the only way from the card to closing it was "Edit req", with the close
// control at the foot of the drawer. HR could not find it, and a filled job
// stayed live on the careers page. These pin that every open-job card offers
// to close itself, that a card whose every seat is hired says so and names the
// hire, and that the close control opened from that line starts on Filled.
// Since TR.23 the control asks in words (three radios), not in a select beside
// a Cancel button that read like the Cancelled outcome.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("./actions", () => ({
  closeJobReq: async () => ({ ok: true }),
  reopenJobReq: async () => ({ ok: true }),
}));
const { OpenRoleCards } = await import("./OpenRoleCards");
const { CloseReqPanel } = await import("./CloseReq");

function role(over: Partial<JobReqRow>): JobReqRow {
  return {
    id: "req-1",
    title: "Data engineer",
    companyName: null,
    status: "open",
    employmentType: "full_time",
    location: null,
    remotePolicy: null,
    salaryMinCents: null,
    salaryMaxCents: null,
    currency: "usd",
    openedAt: "2026-10-29T00:00:00.000Z",
    closedAt: null,
    description: null,
    isPublic: true,
    slug: null,
    applicationCount: 0,
    hiringManagerId: null,
    hiringManagerName: null,
    clientCompanyId: null,
    recruiterId: null,
    createdAt: "2026-10-29T00:00:00.000Z",
    headcount: 1,
    stageCounts: {},
    candidates: [],
    ...over,
  };
}

const ATS = { "hiring.ats": true };
const draw = (rows: JobReqRow[], may: Record<string, boolean> = ATS) =>
  renderToStaticMarkup(<OpenRoleCards rows={rows} onEdit={() => {}} shows={() => true} may={may} />);

const FILLED_LIVE = "Every seat is hired, so this job is filled. Its ad is still on the careers page.";
const FILLED_OPEN = "Every seat is hired, so this job is filled. It is still open.";

describe("open-job cards close their job", () => {
  it("offers Close job on every open-job card", () => {
    const html = draw([role({ id: "a" }), role({ id: "b", title: "Designer" })]);
    expect(html.match(/>Close job…</g)).toHaveLength(2);
  });

  it("says when every seat is hired and offers to close as filled", () => {
    const html = draw([role({ headcount: 1, stageCounts: { Hired: 1 } })]);
    expect(html).toContain(FILLED_LIVE);
    expect(html).toContain("Close as filled…");
    expect(html).toContain("1/1");
    expect(html).toContain('class="ats-seats is-filled"');
  });

  it("names the hire, and gives the filled line the card's only primary button", () => {
    const hire = { id: "h", name: "Thu Nguyen", headline: null, stageName: "Hired", status: "hired", rating: null, aiRating: null, appliedAt: null, archived: false };
    const html = draw([role({ headcount: 1, stageCounts: { Hired: 1 }, candidates: [hire] })]);
    expect(html).toContain("Thu Nguyen was hired, so this job is filled.");
    expect(html.match(/admin-btn--primary/g)).toHaveLength(1);
  });

  it("counts rejected candidates apart from the funnel, and only when there are some", () => {
    expect(draw([role({ stageCounts: { Screen: 2, Rejected: 3 } })])).toMatch(/class="ats-stage is-out"><b>3<\/b>Rejected/);
    expect(draw([role({ stageCounts: { Screen: 2 } })])).not.toContain("is-out");
  });

  it("says the job is still open when it is not on the careers page", () => {
    const html = draw([role({ headcount: 2, stageCounts: { Hired: 2 }, isPublic: false })]);
    expect(html).toContain(FILLED_OPEN);
    expect(html).not.toContain(FILLED_LIVE);
  });

  it("stays quiet while a seat is still open, or when the job does not say how many it hires", () => {
    const html = draw([
      role({ id: "a", headcount: 2, stageCounts: { Hired: 1 } }),
      role({ id: "b", headcount: null, stageCounts: { Hired: 3 } }),
      role({ id: "c", headcount: 0, stageCounts: {} }),
    ]);
    expect(html).not.toContain("so this job is filled");
    expect(html).not.toContain("Close as filled…");
  });

  it("offers neither to someone without hiring.ats, whom the action would refuse", () => {
    const html = draw([role({ headcount: 1, stageCounts: { Hired: 1 } })], {});
    expect(html).not.toContain("Close job…");
    expect(html).not.toContain("Close as filled…");
    expect(html).toContain("Open hiring board");
  });
});

describe("the shared close control", () => {
  const panel = (initialOutcome: "" | "filled") =>
    renderToStaticMarkup(
      <CloseReqPanel close={async () => ({ ok: true })} initialOutcome={initialOutcome} onCancel={() => {}} onClosed={() => {}} />,
    );

  it("starts on Filled when opened from the seats-filled line, and says so on its button", () => {
    const html = panel("filled");
    // React writes the attributes in its own order, so each is looked for on its own.
    expect(html).toMatch(/<input(?=[^>]*value="filled")(?=[^>]*checked="")[^>]*>/);
    expect(html).toMatch(/<button[^>]*>Close as filled</);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Close as filled</);
  });

  it("asks how the job ended before it will close", () => {
    const html = panel("");
    expect(html).toContain("How did this job end?");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Close job</);
    expect(html).not.toMatch(/checked=""/);
  });

  it("offers each outcome in words, and Keep open rather than a Cancel beside Cancelled", () => {
    const html = panel("");
    for (const label of ["Filled", "Closed without a hire", "Cancelled"]) expect(html).toContain(`<b>${label}</b>`);
    expect(html).toContain(">Keep open<");
    expect(html).not.toContain(">Cancel<");
  });

  it("names the careers page in words, not by its route", () => {
    const html = panel("");
    expect(html).toContain("off the careers page");
    expect(html).not.toContain("/careers");
  });
});
