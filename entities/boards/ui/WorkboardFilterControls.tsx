"use client";

import { Fragment } from "react";
import { MultiSelect } from "@/kernel/ui/MultiSelect";
import { controlName, type FilterControlDef } from "./workboard-filter-controls";

// The filter set, painted as controls (W.89, replacing W.26's rail).
//
// One row, one control per filter, each one a named trigger that opens its
// options. A picker costs a fixed ~90px of the toolbar whatever is inside it,
// so seven of them still leave the board its full width — where the rail spent
// a third of the viewport printing every option of every filter at all times,
// which is a lot of screen for a list nobody reads until they want to narrow
// something.
//
// `stacked` is the same controls down a column, for the slide-over the toolbar
// folds into on a narrow viewport. It is a layout prop and nothing else: both
// render the same defs from workboard-filter-controls.ts.
export function WorkboardFilterControls({ defs, stacked = false }: { defs: FilterControlDef[]; stacked?: boolean }) {
  return (
    <>
      {defs.map((def) => {
        const control =
          def.kind === "multi" ? (
            <MultiSelect label={def.label} noun={def.noun} name={controlName(def)} options={def.options} value={def.value} onChange={def.onChange} />
          ) : def.named ? (
            // The default reads as no choice, so the button carries no count
            // until a week is picked; picking the default again clears it.
            <MultiSelect
              single
              label={def.label}
              noun="weeks"
              name={controlName(def)}
              options={def.options}
              value={def.value === def.defaultValue ? [] : [def.value]}
              onChange={(next) => def.onChange(next[0] ?? def.defaultValue)}
            />
          ) : (
            <select
              className={`admin-select admin-input--w-sm${def.value !== def.defaultValue ? " is-filtering" : ""}`}
              value={def.value}
              onChange={(e) => def.onChange(e.target.value)}
              aria-label={def.label}
            >
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        // Stacked, each control gains the visible label the row leaves to the
        // trigger: in a panel there is room to say it, and a column of bare
        // controls reads as a list of widgets rather than of questions.
        return stacked ? (
          <div key={def.key} className="admin-field">
            <span className="admin-label">{controlName(def)}</span>
            {control}
          </div>
        ) : (
          <Fragment key={def.key}>{control}</Fragment>
        );
      })}
    </>
  );
}
