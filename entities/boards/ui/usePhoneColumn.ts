"use client";

import { useState } from "react";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";

// Which column a phone is showing (W.64).
//
// Below the tablet breakpoint the board draws one column at a time and the
// picker chooses it; above it neither this state nor the class it writes has
// any effect, because the CSS that acts on them lives inside the media query.
// So the desktop board is byte-for-byte the board it was, and this hook is
// simply inert there.
//
// The one rule worth a file: the chosen column falls back to the first
// whenever it is no longer on the board — a filter, a regrouping, a board
// with different lanes — so the picker can never point at nothing.
//
// Split out of WorkboardKanban.tsx for the size gate when W.92 gave the
// columns a fold and the foot a field. That file decides what the board DOES;
// this answers one question about who is looking at it.
export function usePhoneColumn(columns: KanbanColumn[]): [string, (id: string) => void] {
  const [chosen, setChosen] = useState<string | null>(null);
  const active = columns.some((c) => c.id === chosen) ? (chosen as string) : (columns[0]?.id ?? "");
  return [active, setChosen];
}
