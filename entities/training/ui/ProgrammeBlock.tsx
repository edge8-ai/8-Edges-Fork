// The programmes a member is on, for My Training (TR.5): each plan's rhythm,
// who runs it, who else is in it, and its philosophy read-only. Nothing about
// anyone's answers (ADR 0016); since TR.7, one line of how the plan is landing,
// from three or more people's reviews together, or why it does not show yet;
// since TR.8, what the organiser changed because of the reviews.
import type { MyPlan } from "@/entities/training/lib/plan-read";
import { rhythmLabel } from "@/entities/training/lib/plan-rhythm";
import type { ViewSlice } from "@/entities/training/lib/programme-read";
import type { ChangeNote } from "@/entities/training/lib/change-notes";
import { PhilosophyRead } from "./PhilosophyRead";
import { PlanChanges } from "./PlanChanges";
import { feelingsLine } from "./change-format";
import { loadShares, starsLabel } from "./programme-format";
import { LockIcon, StarIcon } from "./programme-icons";

/** How the plan is landing, in one line, or why it does not show. Nothing when the plan has no session that started. */
function PlanRead({ slice }: { slice: ViewSlice | undefined }) {
  if (!slice) return null;
  if (!slice.shown) {
    return (
      <div className="tr-pr-plan-read">
        <span className="tr-label">How this plan is landing</span>
        <span className="tr-pr-lock">
          <LockIcon />
          {slice.reason === "few" ? "Shows once three people have reviewed it, so your review stays yours." : "Hidden for now, so nobody's review can be worked out from the other figures."}
        </span>
      </div>
    );
  }
  const f = slice.figures;
  const load = loadShares(f);
  return (
    <div className="tr-pr-plan-read">
      <span className="tr-label">How this plan is landing</span>
      <span className="tr-pr-stars">
        <StarIcon />
        {starsLabel(f)}
      </span>
      {load.answered > 0 && <span>{load.right}% say the load is about right</span>}
      {f.tags.length > 0 && <span>Felt most: {f.tags.slice(0, 2).map((t) => t.label).join(", ")}</span>}
      <span>From {f.reviewers} people</span>
    </div>
  );
}

/** The group's top feelings for the changes' header, only while the plan's read is shown. */
function feelingsOf(slice: ViewSlice | undefined) {
  return feelingsLine(slice?.shown ? slice.figures : null);
}

export function ProgrammeBlock({ plans, reads = {}, changes = {}, now }: { plans: MyPlan[]; reads?: Record<string, ViewSlice>; changes?: Record<string, ChangeNote[]>; now: Date }) {
  if (plans.length === 0) return null;
  return (
    <>
      {plans.map((p) => (
        <section key={p.id} className="admin-card admin-section-card tr-card" aria-label={p.title}>
          <div className="tr-card-head">
            <div>
              <h2 className="tr-card-title">{p.title}</h2>
              <p className="tr-hint">
                {p.typeName} · {rhythmLabel(p.rhythm)} · with {p.organiserName}
                {p.with.length > 0 ? ` and ${p.with.join(", ")}` : ""}
              </p>
            </div>
          </div>
          <PlanChanges notes={changes[p.id] ?? []} feelings={feelingsOf(reads[p.id])} now={now} />
          <PlanRead slice={reads[p.id]} />
          {p.philosophy ? (
            <div className="tr-word-panel">
              <span className="tr-label">What this programme asks of you</span>
              <PhilosophyRead philosophy={p.philosophy} />
            </div>
          ) : (
            <p className="tr-hint">The programme philosophy is not written yet.</p>
          )}
        </section>
      ))}
    </>
  );
}
