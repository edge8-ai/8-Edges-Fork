"use client";

import { useMemo } from "react";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { WorkboardBoard, WorkboardData } from "@/entities/boards/lib/workboard";
import { chipScope } from "./workboard-chip-scope";

// The id → row maps every part of the board asks for, and the two chips that
// say nothing in the current scope.
//
// Each is a one-line `useMemo` and none of them is interesting; together they
// were six lines of noise at the top of Workboard.tsx, between the props and
// the state that file actually owns. Gathered here for the size gate when
// W.92 gave the board its fourth time view and its column-foot field, and
// because "what the board looks things up in" is a sentence — a caller reads
// one destructure instead of six memos.

export function useWorkboardLookups(data: WorkboardData, clientFilter: string[]) {
  const boardById = useMemo(() => new Map(data.boards.map((b) => [b.id, b] as const)), [data.boards]);
  const sprintName = useMemo(() => new Map(data.sprints.map((s) => [s.id, s.name] as const)), [data.sprints]);
  const epicById = useMemo(() => new Map(data.epics.map((e) => [e.id, e] as const)), [data.epics]);
  // Which chips say nothing here, and so are not drawn (workboard-chip-scope.ts).
  const { hideInternal, hideClient } = useMemo(() => chipScope(data, clientFilter), [data, clientFilter]);
  return { boardById, sprintName, epicById, hideInternal, hideClient } as {
    boardById: Map<string, WorkboardBoard>;
    sprintName: Map<string, string>;
    epicById: Map<string, EpicRow>;
    hideInternal: boolean;
    hideClient: boolean;
  };
}
