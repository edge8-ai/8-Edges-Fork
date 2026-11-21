import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClaimStages } from "./ClaimStages";

// Everyone reads three steps, Submitted, Approved and Paid (RB.22; the checker
// too since 2026-10-12, Dave: there is no Checked phase).
const labels = (html: string) => [...html.matchAll(/admin-rb-stage-label">([^<]+)</g)].map((m) => m[1]);
// The label of the step marked current, read step by step.
const current = (html: string) => {
  const step = html.split("<li").find((li) => li.includes("is-current"));
  return step?.match(/admin-rb-stage-label">([^<]+)</)?.[1] ?? null;
};
const render = (status: Parameters<typeof ClaimStages>[0]["status"]) =>
  renderToStaticMarkup(<ClaimStages status={status} events={[]} nextRun="2026-10-15" />);

describe("ClaimStages", () => {
  it("draws three steps, with no Checked step", () => {
    expect(labels(render("submitted"))).toEqual(["Submitted", "Approved", "Paid"]);
  });

  it("reads a checked claim as waiting for approval", () => {
    const html = render("checked");
    expect(current(html)).toBe("Approved");
    expect(html).toContain("Waiting");
  });

  it("reads a claim in a run as waiting to be paid", () => {
    expect(current(render("in_run"))).toBe("Paid");
  });
});
