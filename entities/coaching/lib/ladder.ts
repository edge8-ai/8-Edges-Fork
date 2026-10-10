// How a goal's 8 Edges ladder is encoded for a <select>: "<kind>:<id>",
// or "" for no ladder.
//
// These two helpers live OUTSIDE components/coaching/LadderSelect.tsx on
// purpose. That file is "use client", and importing a function from a client
// module into a server component hands back a client-reference proxy, not the
// function — calling it throws "TypeError: o is not a function" at runtime,
// which is exactly what /team/goals did in production. Pure helpers shared
// across the boundary belong in a plain module like this one.

import type { EdgesLadder, LadderInput } from "./types";

export function ladderValue(ladder: EdgesLadder | null): string {
  if (!ladder) return "";
  return `${ladder.kind}:${ladder.id}`;
}

export function parseLadder(value: string): LadderInput {
  if (!value) return { kind: "none" };
  const [kind, id] = value.split(":");
  if ((kind === "objective" || kind === "key_result") && id) return { kind, id };
  return { kind: "none" };
}
