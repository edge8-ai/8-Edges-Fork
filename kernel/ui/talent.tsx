import type { ReactNode } from "react";
import { initials } from "@/kernel/ui/format";

// The small pieces the Talent screens share (app/styles/talent-ats.css): a
// section heading, a person cell, the pair of ratings and a datapoint. They
// started in the hiring entity for the ATS and moved here when the People
// screens (org, onboarding, training, quests) took the same design, since an
// entity may not reach into another's ui. They hold no state, so server pages
// and client tables both render them.

/** A small uppercase label over a real heading, with an optional right side. */
export function AtsSectionHead({ k, title, aside }: { k: string; title: string; aside?: ReactNode }) {
  return (
    <div className="ats-sec-head">
      <div>
        <p className="ats-sec-k">{k}</p>
        <h2 className="ats-sec-h">{title}</h2>
      </div>
      {aside && <div className="ats-sec-aside">{aside}</div>}
    </div>
  );
}

/**
 * A person in a list: initials, the name at body size, one line of context. A
 * nickname in brackets is left out of the monogram, which otherwise read "T(".
 */
export function AtsPerson({ name, meta, children }: { name: string | null; meta?: ReactNode; children?: ReactNode }) {
  return (
    <span className="ats-person">
      <span className="ats-av" aria-hidden="true">{name ? initials(name.replace(/\s*\([^)]*\)/g, " ")) : "?"}</span>
      <span className="u-min-0">
        <span className="ats-person-name">
          {name || "No name"}
          {children}
        </span>
        {meta && <span className="ats-person-meta">{meta}</span>}
      </span>
    </span>
  );
}

/**
 * The AI screen's rating and HR's own, side by side. They are two reads of the
 * same candidate by two readers, so a list shows both and says so when HR has
 * not rated yet rather than leaving a dash.
 */
export function AtsRatings({ ai, hr }: { ai: number | null; hr: number | null }) {
  return (
    <span className="ats-ratings">
      <span className={`ats-rate${ai == null ? " is-none" : ""}`}>
        <i>AI screen</i>
        {ai != null ? <span>{ai.toFixed(1)}<small> /5</small></span> : <span>Not screened</span>}
      </span>
      <span className={`ats-rate${hr == null ? " is-none" : ""}`}>
        <i>HR</i>
        {hr != null ? <span>{hr}<small> /5</small></span> : <span>Not rated</span>}
      </span>
    </span>
  );
}

/** One datapoint under a headline: the figure, then what it counts. */
export function AtsStat({ value, label, tone }: { value: ReactNode; label: string; tone?: "bad" }) {
  return (
    <li className={`ats-stat${tone === "bad" ? " ats-stat--bad" : ""}`}>
      <b>{value}</b>
      {label}
    </li>
  );
}
