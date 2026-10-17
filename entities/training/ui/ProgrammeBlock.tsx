// The programmes a member is on, for My Training (TR.5): each plan's rhythm,
// who runs it, who else is in it, and its philosophy read-only. Nothing about
// anyone's answers (ADR 0016).
import type { MyPlan } from "@/entities/training/lib/plan-read";
import { rhythmLabel } from "@/entities/training/lib/plan-rhythm";
import { PhilosophyRead } from "./PhilosophyRead";

export function ProgrammeBlock({ plans }: { plans: MyPlan[] }) {
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
