import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import type { ReactNode } from "react";
import { formatValue, type ValueFormat } from "./ticks";
import { DownloadRows } from "./DownloadRows";
import type { CsvRow } from "./csv";

// The change against the prior window of equal length, and the target the
// period is measured against. Both are optional and both are figures about
// the work, never a person: a tile compares this quarter's won value with last
// quarter's, or with the company's target for it.
export type TileDelta = { value: number; prior: number; delta: number | null; format?: ValueFormat; priorLabel?: string };
export type TileTarget = { amount: number; format?: ValueFormat; progress: number; label?: string };

export function DeltaLine({ d }: { d: TileDelta }) {
  const fmt = (n: number) => formatValue(d.format ?? "count", n);
  const label = d.priorLabel ?? "prior period";
  if (d.delta == null) return <span className="dash-tile-delta is-flat">{label}: {fmt(d.prior)}</span>;
  const tone = d.delta > 0 ? "is-up" : d.delta < 0 ? "is-down" : "is-flat";
  const arrow = d.delta > 0 ? "▲" : d.delta < 0 ? "▼" : "＝";
  return (
    <span className={`dash-tile-delta ${tone}`}>
      {arrow} {Math.abs(d.delta)}% <small>vs {label} ({fmt(d.prior)})</small>
    </span>
  );
}

// "vs target": the target, and whether the figure is ahead of the pace the
// period's elapsed share implies. A target of zero or a missing one renders
// nothing, so a tile without a target stays quiet rather than nagging.
export function TargetLine({ value, t }: { value: number; t: TileTarget }) {
  if (!t.amount) return null;
  const fmt = (n: number) => formatValue(t.format ?? "count", n);
  const pct = Math.round((100 * value) / t.amount);
  const pace = Math.round(100 * t.progress);
  const ahead = pct >= pace;
  return (
    <span className="dash-tile-target">
      <span className="dash-tile-target-track" aria-hidden>
        <svg viewBox="0 0 100 4" preserveAspectRatio="none">
          <rect className="dash-tile-target-pace" x="0" y="0" width={pace} height="4" />
          <rect className={ahead ? "is-ahead" : "is-behind"} x="0" y="0" width={Math.min(100, pct)} height="4" />
        </svg>
      </span>
      <small>
        {pct}% of {fmt(t.amount)} {t.label ?? "target"} · {ahead ? "ahead of" : "behind"} pace ({pace}%)
      </small>
    </span>
  );
}

// A dashboard stat tile: label, one large tabular number, one line under it,
// then an optional delta and an optional target. Links to the record list it
// counts when `href` is given. Tone colours the number only.
export function StatTile({
  label,
  value,
  sub,
  href,
  tone,
  delta,
  target,
  raw,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  tone?: "warn" | "ok";
  delta?: TileDelta;
  target?: TileTarget;
  // The numeric figure behind `value`, for the target comparison.
  raw?: number;
}) {
  const inner = (
    <>
      <span className="dash-tile-label">{label}</span>
      <span className={`dash-tile-value${tone ? ` is-${tone}` : ""}`}>{value}</span>
      {sub && <span className="dash-tile-sub">{sub}</span>}
      {delta && <DeltaLine d={delta} />}
      {target && raw != null && <TargetLine value={raw} t={target} />}
    </>
  );
  return href ? (
    <Link href={href} className="dash-tile dash-span-3">
      {inner}
    </Link>
  ) : (
    <div className="dash-tile dash-span-3">{inner}</div>
  );
}

// A chart card: title, an optional right-hand meta, the body, an optional
// note, and an optional footer link ("see all") when the body is a cut list.
//
// `download` puts a "Download rows" link beside the meta. It takes the rows
// the card is already rendering, so the file and the picture cannot drift
// apart; a card with no rows renders no link rather than offering an empty
// file. Every hub card that shows a table or bars passes it (RF-8).
export function ChartCard({
  title,
  meta,
  span = 6,
  note,
  more,
  download,
  children,
}: {
  title: string;
  meta?: ReactNode;
  span?: 4 | 6 | 8 | 12;
  note?: ReactNode;
  more?: { href: string; label: string };
  download?: { name: string; rows: CsvRow[] };
  children: ReactNode;
}) {
  return (
    <section className={`dash-card dash-span-${span}`}>
      <div className="dash-card-head">
        <h3 className="dash-card-title">{title}</h3>
        {/* Gated on the ROWS, not on the prop: DownloadRows renders nothing
            for an empty set, so gating on the object alone would emit an empty
            meta span on every card that can go to zero rows. */}
        {(meta || (download && download.rows.length > 0)) && (
          <span className="dash-card-meta">
            {meta}
            {download && <DownloadRows rows={download.rows} name={download.name} />}
          </span>
        )}
      </div>
      <div className="dash-card-body">{children}</div>
      {note && <p className="dash-card-note">{note}</p>}
      {more && (
        <Link href={more.href} className="dash-card-more">
          {more.label} →
        </Link>
      )}
    </section>
  );
}

export function DashEmpty({ children }: { children: ReactNode }) {
  return <div className="dash-empty">{children}</div>;
}

// A chart that has nothing honest to say yet: the card stays, dimmed, and
// says when its history begins, so an early reading is never mistaken for a
// finding. Used for the stage-log ages and the snapshot history.
export function DashPending({ since, children }: { since?: string | null; children: ReactNode }) {
  return (
    <div className="dash-pending">
      <span>{children}</span>
      {since && <small>history starts {since}</small>}
    </div>
  );
}

// The reads that failed, named. A hub page renders this above its tiles so a
// dashboard of zeros is never mistaken for a quiet business.
export function DashErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="admin-alert admin-alert--err u-mb-4" role="alert">
      {errors.length === 1 ? "One read failed" : `${errors.length} reads failed`}; the figures below are what could be loaded.
      <ul className="dash-errors">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

// The shape of a hub tab while its section streams in: four tiles and two
// cards, so the head and tabs are already there to click.
export function DashSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="dash-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dash-tile dash-span-3 dash-skeleton">
            <span className="dash-tile-label">&nbsp;</span>
            <span className="dash-tile-value">&nbsp;</span>
          </div>
        ))}
      </div>
      <div className="dash-grid">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="dash-card dash-span-6 dash-skeleton dash-skeleton-card" />
        ))}
      </div>
    </div>
  );
}

// A one-row progress mark: the share done, as a stretched SVG beside a label.
// The billed-versus-won table uses it so eighteen rows of dashes become a
// column of bars.
export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((100 * value) / max)) : 0;
  return (
    <span className="dash-progress" title={label}>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden>
        <rect className="dash-progress-track" x="0" y="0" width="100" height="8" />
        <rect className={pct >= 100 ? "is-done" : undefined} x="0" y="0" width={pct} height="8" />
      </svg>
      <small>{pct}%</small>
    </span>
  );
}
