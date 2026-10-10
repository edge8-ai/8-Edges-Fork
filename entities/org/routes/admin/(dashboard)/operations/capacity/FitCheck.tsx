"use client";

import { useState } from "react";
import { formatHours } from "@/kernel/ui/format";
import { fitCheck, type FitResult } from "@/entities/org/lib/capacity-model";
import type { CapacityCommitment, CapacityRole } from "@/entities/org/lib/capacity";
import { weekLabel } from "./labels";

// "Can we take this deal?" — a role, the hours a week it would need and the
// dates, answered as it is typed. The answer comes from the same rows the grid
// below was drawn from, computed in the browser by the pure model, so there is
// no round trip and no second place the arithmetic lives.
//
// It answers for a role, never for a person: whether somebody in particular is
// busy is not a question this screen asks.

type Props = { roles: CapacityRole[]; commitments: CapacityCommitment[]; currentMonday: string; today: string };

export function FitCheck({ roles, commitments, currentMonday, today }: Props) {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [hours, setHours] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");

  const hoursPerWeek = Number(hours);
  const ready = roleId !== "" && hours.trim() !== "" && Number.isFinite(hoursPerWeek) && hoursPerWeek > 0 && startsOn !== "";
  const backwards = endsOn !== "" && endsOn < startsOn;
  const result: FitResult | null =
    ready && !backwards
      ? fitCheck({ roleId, hoursPerWeek, startsOn, endsOn: endsOn || null }, roles, commitments, currentMonday)
      : null;
  const roleName = roles.find((r) => r.id === roleId)?.name ?? "This role";

  if (roles.length === 0) {
    return <p className="admin-cell-muted u-mb-0">Add a capacity role below, then check work against it here.</p>;
  }

  return (
    <div className="admin-form">
      <div className="admin-form-row">
        <div className="admin-field">
          <label className="admin-label" htmlFor="fit-role">Role</label>
          <select id="fit-role" className="admin-select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="fit-hours">Hours per week</label>
          <input
            id="fit-hours"
            className="admin-input"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="fit-start">Starts</label>
          <input id="fit-start" className="admin-input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="fit-end">Ends (blank if open-ended)</label>
          <input id="fit-end" className="admin-input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
      </div>

      <div aria-live="polite">
        {backwards && <div className="admin-alert admin-alert--err">The end date is before the start.</div>}
        {!backwards && !result && (
          <p className="admin-cell-muted u-mb-0">Enter the hours a week the work needs to see whether it fits.</p>
        )}
        {result?.fits && (
          <div className="admin-alert admin-alert--ok">
            Fits. {roleName} has {formatHours(hoursPerWeek)} h/week free in every week {endsOn ? "of those dates" : "of the next 12 from the start"}.
          </div>
        )}
        {result && !result.fits && (
          <div className="admin-alert admin-alert--err">
            Short by {formatHours(result.shortBy)} h/week at worst, in {result.shortWeeks.length === 1 ? "the week of" : "the weeks of"}{" "}
            {result.shortWeeks.map(weekLabel).join(", ")}.
          </div>
        )}
      </div>
      <p className="admin-cell-muted u-mt-2 u-mb-0">
        Weeks run Monday to Sunday, and a week counts if the dates touch it. Weeks before this one are not checked.
      </p>
    </div>
  );
}
