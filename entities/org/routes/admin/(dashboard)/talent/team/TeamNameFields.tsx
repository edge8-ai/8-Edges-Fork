"use client";

import { useState } from "react";
import { goesByProblem, NAME_PART_REQUIRED, type GoesByFix, type GoesByProblem } from "@/entities/org/lib/name-parts";
import { EditableText } from "./EditableText";

type NameKey = "first_name" | "last_name" | "preferred_name";

// The Team drawer's name rows (S.23.5): the three parts the shown name is
// built from, then the shown name itself. Before this the drawer's only name
// field was Goes by, and whole names typed into it never reached the shown
// name. A value the shown name cannot use is refused here, before anything is
// saved, with the reason under its field and, where the value can be read, a
// button that saves what was meant. Rendered inside the drawer's <dl>.
export function TeamNameFields({
  values,
  shownName,
  onSave,
  onSaveAll,
}: {
  values: Record<NameKey, string>;
  shownName: string;
  // Update the control and persist the one field; resolves once saved.
  onSave: (key: NameKey, value: string) => Promise<void>;
  // Persist several parts in one write; resolves true once saved.
  onSaveAll: (patch: GoesByFix["patch"]) => Promise<boolean>;
}) {
  const [refused, setRefused] = useState<{ key: NameKey; problem: GoesByProblem } | null>(null);
  const parts = { given: values.first_name, family: values.last_name };

  const saveNamePart = (k: "first_name" | "last_name") => (v: string) => {
    if (!v.trim()) {
      setRefused({ key: k, problem: { message: NAME_PART_REQUIRED[k], fix: null } });
      return;
    }
    setRefused(null);
    void onSave(k, v.trim());
  };
  const saveGoesBy = (v: string) => {
    const problem = goesByProblem(v, parts);
    if (problem) {
      setRefused({ key: "preferred_name", problem });
      return;
    }
    setRefused(null);
    void onSave("preferred_name", v.trim());
  };
  // A fix's parts are saved in one write. Saved one at a time, the shown name
  // was wrong between them, and a refused part left the rest half applied. The
  // server checks every part before writing any, so the fix lands whole or not
  // at all; when it does not, its note stays up with the button to try again.
  const applyFix = async (fix: GoesByFix) => {
    if (await onSaveAll(fix.patch)) setRefused(null);
  };

  // A Goes by already stored that the shown name ignores is said once, in place.
  const storedProblem = refused?.key === "preferred_name" ? null : goesByProblem(values.preferred_name, parts);
  const noteFor = (k: NameKey) => {
    if (refused?.key === k) return { tone: "err", lead: "Not saved.", problem: refused.problem };
    if (k === "preferred_name" && storedProblem) return { tone: "warn", lead: "Not used in the shown name.", problem: storedProblem };
    return null;
  };
  const note = (k: NameKey) => {
    const n = noteFor(k);
    if (!n) return null;
    const fix = n.problem.fix;
    return (
      <div className={`admin-alert admin-alert--${n.tone} u-mt-1`} role={n.tone === "err" ? "alert" : undefined}>
        {n.lead} {n.problem.message}
        {fix && (
          <div className="u-mt-1">
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => void applyFix(fix)}>
              {fix.label}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <dt>Given name</dt>
      <dd>
        <EditableText value={values.first_name} onSave={saveNamePart("first_name")} placeholder="Add given name…" />
        {note("first_name")}
      </dd>
      <dt>Family name</dt>
      <dd>
        <EditableText value={values.last_name} onSave={saveNamePart("last_name")} placeholder="Add family name…" />
        {note("last_name")}
      </dd>
      <dt>Goes by</dt>
      <dd>
        <EditableText
          value={values.preferred_name}
          onSave={saveGoesBy}
          placeholder="Add a nickname…"
          hint="One word, the name people call them. Leave blank if none."
        />
        {note("preferred_name")}
      </dd>
      <dt>Shown as</dt>
      <dd className="admin-kv-readonly">
        {shownName}
        <div className="admin-hint">Given name, family name, then goes by in brackets</div>
      </dd>
    </>
  );
}
