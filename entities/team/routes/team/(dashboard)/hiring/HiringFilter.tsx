"use client";

import { useState, type ReactNode } from "react";

// The Hiring page's hero and its chips (TH.18): what is open and what waits on
// the reader, then one part of the page at a time when a chip is pressed. The
// parts arrive rendered from the server; this only chooses which to show.

type Part = "all" | "roles" | "interviews" | "closed";

function Art() {
  return (
    <svg className="hr-hero-art" viewBox="0 0 250 130" fill="none" aria-hidden="true" focusable="false">
      <circle className="hr-art-seat" cx="70" cy="48" r="16" strokeWidth="2" />
      <path className="hr-art-seat" d="M40 108a30 30 0 0 1 60 0" strokeWidth="2" strokeLinecap="round" />
      <circle className="hr-art-open" cx="135" cy="48" r="16" strokeWidth="2" strokeDasharray="4 5" />
      <path className="hr-art-open" d="M105 108a30 30 0 0 1 60 0" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
      <circle className="hr-art-far" cx="200" cy="48" r="16" strokeWidth="2" strokeDasharray="4 5" />
      <path className="hr-art-far" d="M170 108a30 30 0 0 1 60 0" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
      <circle className="hr-art-spark" cx="236" cy="14" r="4" />
      <circle className="hr-art-dot" cx="18" cy="30" r="3" />
    </svg>
  );
}

export function HiringFilter({
  headline,
  sub,
  counts,
  interviews,
  roles,
  closed,
  rail,
}: {
  headline: string;
  sub: string;
  counts: { roles: number; interviews: number; closed: number };
  interviews: ReactNode;
  roles: ReactNode;
  closed: ReactNode;
  rail: ReactNode;
}) {
  const [part, setPart] = useState<Part>("all");
  const chips: { key: Part; label: string; n: number }[] = [
    { key: "all", label: "Everything", n: counts.roles + counts.interviews },
    { key: "roles", label: "Open roles", n: counts.roles },
    { key: "interviews", label: "Your interviews", n: counts.interviews },
    { key: "closed", label: "Closed", n: counts.closed },
  ];
  const shows = (p: Part) => part === "all" || part === p;
  return (
    <div className="hr">
      <section className="hr-hero" aria-labelledby="hr-head">
        <Art />
        <p className="hr-k">Hiring</p>
        <h1 className="hr-head" id="hr-head">
          {headline}
        </h1>
        <p className="hr-sub">{sub}</p>
        <ul className="hr-chips" aria-label="Show">
          {chips.map((c) => (
            <li key={c.key}>
              <button type="button" className="hr-chip-f" aria-pressed={part === c.key} onClick={() => setPart(c.key)}>
                {c.label} <b>{c.n}</b>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="hr-grid">
        <div className="hr-col">
          {shows("interviews") && interviews}
          {shows("roles") && roles}
          {shows("closed") && closed}
          {part === "interviews" && !interviews && <p className="hr-note">No interviews are waiting on you.</p>}
        </div>
        <aside className="hr-rail" aria-label="About hiring">
          {rail}
        </aside>
      </div>
    </div>
  );
}
