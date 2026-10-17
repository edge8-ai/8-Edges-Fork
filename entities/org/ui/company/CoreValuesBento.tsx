import Link from "next/link";
import type { LiHTMLAttributes, ReactNode } from "react";
import { markTone, ordinal, tileSpan, type ValueMarkKey, type ValueRow } from "@/entities/org/lib/core-values";
import { InterviewIllustration, NoticedIllustration, ValueMark } from "./ValueMark";

// The Core Values page, direction B ("illustrated bento", approved 2026-10-08):
// a dark hero in the sidebar's ink with the values' marks, then one tinted tile
// per value in a three-column bento, then where the values show up in the
// product. The pieces have no state, so /team/values renders them on the
// server and the admin editor composes the very same tiles with its controls
// on top: what an editor sees is what the team reads.

const SPAN_CLASS = { wide: " is-wide", tall: " is-tall", full: " is-full", "": "" } as const;
const toneClass = (mark: ValueMarkKey) => `admin-cv-tone-${markTone(mark)}`;
export const valueAnchor = (id: string) => `value-${id}`;

/** `fontClass` is the route's `heroFont.variable` (kernel/ui/hero-font), which only a route may import. */
export function CoreValuesFrame({ children, fontClass, className = "" }: { children: ReactNode; fontClass: string; className?: string }) {
  return <div className={`admin-cv ${fontClass}${className ? ` ${className}` : ""}`}>{children}</div>;
}

export function CoreValuesHero({ values, marks }: { values: ValueRow[]; marks: Map<string, ValueMarkKey> }) {
  return (
    <header className="admin-cv-hero">
      <div>
        <span className="admin-cv-chip">Company</span>
        <h1 className="admin-cv-h1">Core Values</h1>
        <p className="admin-cv-sub">
          How we work, <em>whatever</em> we&apos;re working on.
        </p>
      </div>
      {values.length > 0 && (
        <ul className="admin-cv-stars" aria-label="Jump to a value">
          {values.slice(0, 6).map((v) => {
            const mark = marks.get(v.id) ?? "spark";
            return (
              <li key={v.id}>
                <a className={`admin-cv-star ${toneClass(mark)}`} href={`#${valueAnchor(v.id)}`} aria-label={`Jump to ${v.title}`}>
                  <ValueMark mark={mark} />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </header>
  );
}

/**
 * One value's tile. `children` sit above the text (the editor's toolbar);
 * `body` replaces the text (the edit form); `liProps` lets the editor make the
 * whole tile a drop target.
 */
export function ValueTile({
  value,
  index,
  count,
  mark,
  className = "",
  children,
  body,
  liProps,
}: {
  value: ValueRow;
  index: number;
  count: number;
  mark: ValueMarkKey;
  className?: string;
  children?: ReactNode;
  body?: ReactNode;
  liProps?: LiHTMLAttributes<HTMLLIElement>;
}) {
  return (
    <li {...liProps} id={valueAnchor(value.id)} className={`admin-cv-tile ${toneClass(mark)}${SPAN_CLASS[tileSpan(index, count)]}${className ? ` ${className}` : ""}`}>
      {children}
      {body ?? (
        <>
          <ValueMark mark={mark} />
          <div className="admin-cv-text">
            <span className="admin-cv-kicker">Value {ordinal(index + 1)}</span>
            <h2 className="admin-cv-title">{value.title}</h2>
            <p className="admin-cv-desc">{value.description}</p>
          </div>
        </>
      )}
    </li>
  );
}

export function CoreValuesMeet({ coachHref }: { coachHref?: string }) {
  return (
    <section aria-labelledby="admin-cv-meet">
      <h2 id="admin-cv-meet" className="admin-cv-meet-head">
        Where you&apos;ll meet them
      </h2>
      <div className="admin-cv-meet">
        <div className="admin-cv-meet-card">
          <div className="admin-cv-meet-ill">
            <NoticedIllustration />
          </div>
          <div>
            <h3>In Noticed notes</h3>
            <p>When your coach notices a piece of work, they can name the value it showed. You will find those notes on My Coach.</p>
            {coachHref && <Link href={coachHref}>Open My Coach</Link>}
          </div>
        </div>
        <div className="admin-cv-meet-card">
          <div className="admin-cv-meet-ill">
            <InterviewIllustration />
          </div>
          <div>
            <h3>In interviews</h3>
            <p>The AI interview panelist reads these values when it scores each round, so they shape who joins the team next.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CoreValuesState({ title, children, alert }: { title: string; children: ReactNode; alert?: boolean }) {
  return (
    <div className="admin-cv-state" role={alert ? "alert" : undefined}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
