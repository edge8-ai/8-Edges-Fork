// "Your reviews changed things" on a learner's plan card (TR.8, approved
// 3 Nov): a sprout that grows one leaf per change, the group's top feelings
// once at the top (only while the plan's read is shown), and each change as
// the organiser's face beside their words. The newest of the week pops in.
// Nothing when the organiser has said nothing yet.
import type { ChangeNote } from "../lib/change-notes";
import { ChangeCard } from "./ChangeCard";
import { isNew, leaves } from "./change-format";

// The leaves the sprout can grow, bottom to top, alternating sides.
const LEAVES = [
  "M22 30 C14 30 11 24 12 20 C18 20 22 24 22 30 Z",
  "M22 26 C30 26 33 20 32 16 C26 16 22 20 22 26 Z",
  "M22 21 C15 20 13 14 15 11 C20 12 22 16 22 21 Z",
  "M22 17 C29 16 31 11 29 8 C24 9 22 13 22 17 Z",
  "M22 13 C18 10 19 5 22 3 C25 5 26 10 22 13 Z",
];

export function PlanChanges({ notes, feelings, now }: { notes: ChangeNote[]; feelings: { label: string; friction: boolean }[] | null; now: Date }) {
  if (notes.length === 0) return null;
  const grown = leaves(notes.length);
  const label = notes.length === 1 ? "1 change so far" : `${notes.length} changes so far`;
  return (
    <div className="tr-cn-strip">
      <div className="tr-cn-strip-head">
        <svg className="tr-cn-sprout" viewBox="0 0 44 44" role="img" aria-label={label}>
          <path className="stem" d="M22 38 V12" />
          {LEAVES.slice(0, grown).map((d, i) => (
            <path key={i} className={`leaf is-${i % 3}`} d={d} />
          ))}
          <rect className="pot" x="14" y="36" width="16" height="7" rx="2" />
        </svg>
        <div>
          <p className="tr-cn-strip-title">Your reviews changed things</p>
          <p className="tr-cn-strip-sub">
            {label}
            {feelings && feelings.length > 0 && (
              <>
                , after the group said{" "}
                {feelings.slice(0, 2).map((f) => (
                  <span key={f.label} className={`tr-cn-feel ${f.friction ? "is-friction" : "is-good"}`}>
                    {f.label.toLowerCase()}
                  </span>
                ))}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="tr-cn-cards">
        {notes.map((n) => (
          <ChangeCard key={n.id} note={n} isNew={isNew(n.postedAt, now)} />
        ))}
      </div>
    </div>
  );
}
