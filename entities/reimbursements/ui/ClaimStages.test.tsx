import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClaimStages } from "./ClaimStages";

// RB.22 (Dave): whoever does not check reads three steps, Submitted, Approved
// and Paid; a checker keeps the Checked step.
const labels = (html: string) => [...html.matchAll(/admin-rb-stage-label">([^<]+)</g)].map((m) => m[1]);
// The label of the step marked current, read step by step.
const current = (html: string) => {
  const step = html.split("<li").find((li) => li.includes("is-current"));
  return step?.match(/admin-rb-stage-label">([^<]+)</)?.[1] ?? null;
};
const render = (status: Parameters<typeof ClaimStages>[0]["status"], withCheck?: boolean) =>
  renderToStaticMarkup(<ClaimStages status={status} events={[]} nextRun="2026-10-15" withCheck={withCheck} />);

describe("ClaimStages", () => {
  it("draws four steps for a checker", () => {
    expect(labels(render("submitted"))).toEqual(["Submitted", "Checked", "Approved", "Paid"]);
  });

  it("draws three steps for whoever does not check", () => {
    expect(labels(render("submitted", false))).toEqual(["Submitted", "Approved", "Paid"]);
  });

  it("reads a checked claim as waiting for approval when the check is not shown", () => {
    const html = render("checked", false);
    expect(current(html)).toBe("Approved");
    expect(html).toContain("Waiting");
  });

  it("reads a claim in a run as waiting to be paid when the check is not shown", () => {
    expect(current(render("in_run", false))).toBe("Paid");
  });
});
