import type { Lane } from "./steps";

// The shadow comparison (Z.9, spec section 10): per application, the lane the
// chain proposed in shadow against what a person actually did. Counted, never
// judged by the chain: an application still open has no answer yet, so it
// counts in neither the agreements nor the decided. The exit to live asks for
// at least 80% agreement over at least 15 decided applications (decision 8).
// Pure and browser-safe, so the page and the tests share one rule.

export type HumanOutcome = "advanced" | "rejected" | "open";

export type ShadowRow = {
  applicationId: string;
  name: string;
  lane: Lane;
  human: HumanOutcome;
  /** "match", "differs", or "open" while nobody has decided. */
  match: "match" | "differs" | "open";
  message: string | null;
};

export function laneMatches(lane: Lane, human: HumanOutcome): boolean {
  return (lane === "advance" && human === "advanced") || (lane === "decline" && human === "rejected");
}

export function compareShadow(rows: Omit<ShadowRow, "match">[]): { rows: ShadowRow[]; agreed: number; decided: number } {
  const out = rows.map((r) => ({ ...r, match: r.human === "open" ? ("open" as const) : laneMatches(r.lane, r.human) ? ("match" as const) : ("differs" as const) }));
  const decided = out.filter((r) => r.match !== "open").length;
  const agreed = out.filter((r) => r.match === "match").length;
  return { rows: out, agreed, decided };
}

/** The spec's exit counts for agreement: at least 15 decided, at least 80% of them agreeing. */
export const EXIT_DECIDED = 15;
export const EXIT_AGREEMENT = 0.8;
