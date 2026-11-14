// What a member may credit for an outcome (TR.6): the plans they are on and may
// see, and the trainings they went to, newest first. Built from the rows My
// Training already read, so the drawer lists exactly what the page shows; the
// write checks the same rules against the tables again (./outcomes).
import type { MyTrainingRow } from "./training-rules";
import { whenLabel } from "./training-format";

type CreditKind = "training" | "plan";
export type CreditOption = { kind: CreditKind; id: string; label: string; sub: string };

export function creditOptions(rows: readonly MyTrainingRow[], plans: readonly { id: string; title: string; typeName: string }[], now: Date): CreditOption[] {
  const went = rows
    .filter((r) => r.status === "attended" && new Date(r.startsAt).getTime() <= now.getTime())
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .map((r): CreditOption => ({ kind: "training", id: r.trainingId, label: r.title, sub: `${r.typeName} · ${whenLabel(r.startsAt, r.endsAt).split(" · ")[0]}` }));
  return [...plans.map((p): CreditOption => ({ kind: "plan", id: p.id, label: p.title, sub: p.typeName })), ...went];
}
