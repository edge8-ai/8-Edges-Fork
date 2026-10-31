"use client";

// The 8 Edges ladder picker: which company key result a goal hangs off. Shared
// by the coach page (CoachProfileView) and the member's own page (/team/goals)
// so both offer the same company goals, in the same shape. Objectives are only
// grouping headers here; a goal ladders to a key result.
//
// The value encoding (ladderValue / parseLadder) lives in lib/coaching/ladder
// so server components can use it: importing it from this client module hands
// back a client reference, not a function.

import type { EdgesOptions } from "@/entities/coaching/lib/types";

export function LadderSelect({
  edges,
  value,
  onChange,
  disabled,
  id,
  emptyLabel = "No ladder",
  required,
}: {
  edges: EdgesOptions;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
  emptyLabel?: string;
  // Native required: the "" placeholder option blocks submit until a pick.
  required?: boolean;
}) {
  // The codes come from the loader (O2, KR2.4), so the picker names a key result
  // exactly as Company Goals does. Uncoded key results (a past year's, a dropped
  // objective's) are not offered, except the one already chosen: a select whose
  // value has no option shows the empty label, and saving would quietly unladder
  // the goal.
  const current = edges.keyResults.find((k) => value === `key_result:${k.id}` && !k.code);
  const loose = edges.keyResults.filter((k) => !k.objectiveId);
  return (
    <select
      id={id}
      className="admin-input"
      value={value}
      disabled={disabled}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Ladders to (8 Edges)"
    >
      <option value="">{emptyLabel}</option>
      {edges.objectives
        .filter((o) => o.code)
        .map((o) => (
          <optgroup key={o.id} label={`${o.code}: ${o.label}`}>
            {edges.keyResults
              .filter((k) => k.objectiveId === o.id && k.code)
              .map((k) => (
                <option key={k.id} value={`key_result:${k.id}`}>
                  {`${k.code}: ${k.label}`}
                </option>
              ))}
          </optgroup>
        ))}
      {loose.length > 0 && (
        <optgroup label="Other key results">
          {loose.map((k) => (
            <option key={k.id} value={`key_result:${k.id}`}>
              {k.label}
            </option>
          ))}
        </optgroup>
      )}
      {current && current.objectiveId && (
        <optgroup label="Current ladder (no longer a company goal)">
          <option value={`key_result:${current.id}`}>{current.label}</option>
        </optgroup>
      )}
    </select>
  );
}
