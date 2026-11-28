import { describe, expect, it } from "vitest";
import { clearedForecastInputs, forecastEditError, forecastInputsError, forecastLossError, type StageRow } from "./deal-stage";

// The forecast gate as a pure rule (RH-2). Proposal and every open stage after
// it need an amount and an expected close date; earlier stages and the two
// closed stages never do; what the same request writes counts as present.

const STAGES: StageRow[] = [
  { id: "new", name: "New", position: 0, is_won: false, is_lost: false },
  { id: "disc", name: "Discovery", position: 2, is_won: false, is_lost: false },
  { id: "prop", name: "Proposal", position: 3, is_won: false, is_lost: false },
  { id: "cs", name: "Contract Sent", position: 4, is_won: false, is_lost: false },
  { id: "won", name: "Won", position: 5, is_won: true, is_lost: false },
  { id: "lost", name: "Lost", position: 6, is_won: false, is_lost: true },
];
const EMPTY = { amount_cents: null, expected_close_date: null };
const FULL = { amount_cents: 500000, expected_close_date: "2026-10-01" };

describe("forecastInputsError", () => {
  it("lets a deal into Discovery with nothing filled", () => {
    expect(forecastInputsError(STAGES, "disc", EMPTY)).toBeNull();
  });

  it("refuses Proposal without both inputs and names what is missing", () => {
    expect(forecastInputsError(STAGES, "prop", EMPTY)).toBe(
      "Proposal needs an amount and an expected close date on the deal first, so the forecast can count it.",
    );
    expect(forecastInputsError(STAGES, "prop", { amount_cents: 100, expected_close_date: null })).toMatch(/needs an expected close date on/);
    expect(forecastInputsError(STAGES, "prop", { amount_cents: 0, expected_close_date: "2026-10-01" })).toMatch(/needs an amount on/);
  });

  it("applies the same gate to every open stage after Proposal", () => {
    expect(forecastInputsError(STAGES, "cs", EMPTY)).toMatch(/^Contract Sent needs/);
    expect(forecastInputsError(STAGES, "cs", FULL)).toBeNull();
  });

  it("never gates the closed stages: won carries its own amount rule, lost needs nothing", () => {
    expect(forecastInputsError(STAGES, "won", EMPTY)).toBeNull();
    expect(forecastInputsError(STAGES, "lost", EMPTY)).toBeNull();
  });

  it("counts what the same request is writing", () => {
    expect(forecastInputsError(STAGES, "prop", EMPTY, { amount_cents: 1000, expected_close_date: "2026-11-01" })).toBeNull();
    // An incoming null clears the field and is refused, even if the row had one.
    expect(forecastInputsError(STAGES, "prop", FULL, { expected_close_date: null })).toMatch(/expected close date/);
  });

  it("is inert on a pipeline without a Proposal stage or an unknown target", () => {
    const noGate = STAGES.filter((s) => s.name !== "Proposal");
    expect(forecastInputsError(noGate, "cs", EMPTY)).toBeNull();
    expect(forecastInputsError(STAGES, "nope", EMPTY)).toBeNull();
  });
});

// R.23: the gate's other door. A deal already at Proposal or later is judged
// when an edit clears an input, not only when it moves.
describe("forecastEditError", () => {
  it("refuses clearing the amount or the close date of a deal in a gated stage, and names what it keeps", () => {
    expect(forecastEditError(STAGES, "prop", { amount_cents: 0 })).toBe(
      "A deal in Proposal keeps an amount, so the forecast can count it.",
    );
    expect(forecastEditError(STAGES, "cs", { amount_cents: null, expected_close_date: null })).toBe(
      "A deal in Contract Sent keeps an amount and an expected close date, so the forecast can count it.",
    );
    expect(forecastEditError(STAGES, "cs", { expected_close_date: "" })).toMatch(/keeps an expected close date/);
  });

  it("lets the same edit through before Proposal and in the closed stages", () => {
    for (const stage of ["new", "disc", "won", "lost"]) {
      expect(forecastEditError(STAGES, stage, { amount_cents: 0, expected_close_date: null })).toBeNull();
    }
    expect(forecastEditError(STAGES, null, { amount_cents: 0 })).toBeNull();
  });

  it("judges only what the edit clears, so a deal missing one input from before the gate can be given the other", () => {
    expect(forecastEditError(STAGES, "prop", { expected_close_date: "2026-11-01" })).toBeNull();
    expect(forecastEditError(STAGES, "prop", { amount_cents: 250000 })).toBeNull();
    expect(forecastEditError(STAGES, "prop", {})).toBeNull();
  });
});

// The assistant's SQL is judged by what it did, not what its text says: the
// deals before and after the statement, inside its transaction.
describe("forecastLossError", () => {
  const row = (id: string, stage_id: string, amount_cents: number | null, expected_close_date: string | null) => ({ id, stage_id, amount_cents, expected_close_date });

  it("refuses a write that took an input away from a deal in a gated stage", () => {
    expect(forecastLossError(STAGES, [row("d1", "prop", 500, "2026-11-01")], [row("d1", "prop", null, "2026-11-01")])).toBe(
      "A deal in Proposal keeps an amount, so the forecast can count it.",
    );
    expect(forecastLossError(STAGES, [row("d1", "cs", 500, "2026-11-01")], [row("d1", "cs", 500, null)])).toMatch(/keeps an expected close date/);
  });

  it("passes a write that changes an input to another value, or clears one before Proposal", () => {
    expect(forecastLossError(STAGES, [row("d1", "prop", 500, "2026-11-01")], [row("d1", "prop", 900, "2026-12-01")])).toBeNull();
    expect(forecastLossError(STAGES, [row("d1", "disc", 500, "2026-11-01")], [row("d1", "disc", null, null)])).toBeNull();
  });

  it("does not blame a write for an input the deal never had", () => {
    expect(forecastLossError(STAGES, [row("d1", "prop", 0, null)], [row("d1", "prop", null, "2026-11-01")])).toBeNull();
  });
});

describe("clearedForecastInputs", () => {
  it("lists the inputs an edit empties, and nothing it leaves alone or fills", () => {
    expect(clearedForecastInputs({})).toEqual([]);
    expect(clearedForecastInputs({ amount_cents: 1, expected_close_date: "2026-11-01" })).toEqual([]);
    expect(clearedForecastInputs({ amount_cents: 0, expected_close_date: null })).toEqual(["an amount", "an expected close date"]);
  });
});
