import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordHistoryList, settledPage } from "./RecordHistory";
import type { AuditEntry } from "@/kernel/audit/history";

// The panel that shows a record's audit trail (S.4). It is the only screen the
// trail reaches, so the wording is the feature: "Updated · Dana Pham · Sep 1"
// is the whole point, and a row that loses the actor or the operation word is
// worse than no panel.

function entry(over: Partial<AuditEntry> & { id: string }): AuditEntry {
  return { at: "2026-09-01T10:00:00.000Z", operation: "update", actor: null, context: {}, ...over };
}

describe("RecordHistoryList", () => {
  it("reads an operation as a word and names the actor", () => {
    const html = renderToStaticMarkup(
      <RecordHistoryList entries={[entry({ id: "a1", operation: "archive", actor: "Dana Pham" })]} />,
    );

    expect(html).toContain("Archived");
    expect(html).toContain("Dana Pham");
    expect(html).toContain("Sep 1, 2026");
  });

  it("shows an operation it has no word for rather than dropping the row", () => {
    const html = renderToStaticMarkup(<RecordHistoryList entries={[entry({ id: "a1", operation: "handoff_decided" })]} />);

    expect(html).toContain("handoff decided");
  });

  it("says nothing about the actor when the row recorded none", () => {
    const html = renderToStaticMarkup(<RecordHistoryList entries={[entry({ id: "a1" })]} />);

    expect(html).toContain("Updated");
    expect(html).not.toContain("·");
  });

  it("shows the writer's own context under the row, scalars only", () => {
    const html = renderToStaticMarkup(
      <RecordHistoryList
        entries={[entry({ id: "a1", context: { stage: "won", amount_cents: 500, rows: [1, 2] } })]}
      />,
    );

    expect(html).toContain("stage won");
    expect(html).toContain("amount cents 500");
    expect(html).not.toContain("rows");
  });

  it("says the history is empty rather than rendering nothing", () => {
    const html = renderToStaticMarkup(<RecordHistoryList entries={[]} />);

    expect(html).toMatch(/nothing recorded|no history/i);
  });
});

describe("settledPage", () => {
  it("answers a load that throws as a failure, so the panel stops loading (S.19.14)", async () => {
    const load = async () => {
      throw new Error("Not authorised");
    };
    expect(await settledPage(load, 0, 20)).toEqual({ ok: false, error: "Not authorised" });
  });

  it("passes a load's own answer through", async () => {
    const page = { entries: [], hasMore: false };
    expect(await settledPage(async () => ({ ok: true, page }), 0, 20)).toEqual({ ok: true, page });
  });
});
