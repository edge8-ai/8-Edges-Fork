import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunStatusBadge } from "./RunBits";

// Since Y.6 a run row exists from the moment the run starts, so Settings ->
// Agents sees runs in progress (running), parked on an approval or a delayed
// send (waiting), and killed before they could close (died, set by the
// routine reaper). Each must read as itself, and died as a failure.

describe("RunStatusBadge", () => {
  it.each([
    ["ok", "Ran", "ok"],
    ["skipped", "Skipped", "warn"],
    ["error", "Failed", "err"],
    ["running", "Running", "info"],
    ["waiting", "Waiting", "info"],
    ["died", "Died", "err"],
  ] as const)("renders %s as %s", (status, text, tone) => {
    const html = renderToStaticMarkup(<RunStatusBadge status={status} />);
    expect(html).toContain(`>${text}<`);
    expect(html).toContain(`admin-badge--${tone}`);
  });

  it("renders a routine with no run as never run", () => {
    expect(renderToStaticMarkup(<RunStatusBadge status={null} />)).toContain("Never run");
  });
});
