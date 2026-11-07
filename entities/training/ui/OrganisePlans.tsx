"use client";

// The organiser's plans on My Team › Training (TR.5): the list, each a link
// to its page, and New plan. The series itself is published from the plan's
// page, once the roster is set.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { EMPTY_PLAN, PlanFields, planInput, type PlanDraft } from "./PlanFields";
import { DrawerFooter } from "./ActionNote";
import { TrainingEmpty } from "./TrainingEmpty";

export type PlanItem = { id: string; title: string; typeName: string; rhythm: string; publishedUntil: string | null; people: number };

export function OrganisePlans({
  plans,
  types,
  create,
}: {
  plans: PlanItem[];
  types: { id: string; name: string }[];
  create: (input: unknown) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>(EMPTY_PLAN);
  const { note, setNote, pending, run } = useActionRunner();
  const openNew = () => {
    setDraft(EMPTY_PLAN);
    setNote(null);
    setOpen(true);
  };
  const save = () =>
    run(
      async () => {
        const res = await create(planInput(draft));
        if (res.ok) router.push(`/team/training/plans/${res.id}`);
        return res;
      },
      "Created.",
      () => setOpen(false),
    );
  return (
    <section className="admin-card admin-section-card tr-card" aria-label="Plans">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">Plans</h2>
          <p className="tr-hint">A series on a rhythm, published up to a date you choose. Each session lands on its people&rsquo;s My Training.</p>
        </div>
        <button type="button" className="admin-btn admin-btn--primary" onClick={openNew}>
          + New plan
        </button>
      </div>
      {plans.length === 0 ? (
        <TrainingEmpty icon="plan" title="No plans yet">
          A plan you create shows here, with its rhythm and how many people are on it.
        </TrainingEmpty>
      ) : (
        <ul className="tr-log">
          {plans.map((p) => (
            <li key={p.id} className="tr-log-row tr-type-1">
              <div>
                <div className="tr-row-title">
                  <Link href={`/team/training/plans/${p.id}`}>{p.title}</Link>
                </div>
                <div className="tr-row-meta">
                  {p.rhythm} · {p.typeName} · {p.people === 1 ? "1 person" : `${p.people} people`}
                  {p.publishedUntil ? ` · published to ${p.publishedUntil}` : " · not published yet"}
                </div>
              </div>
              <div className="tr-row-actions">
                <Link className="admin-btn admin-btn--sm" href={`/team/training/plans/${p.id}`}>
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DetailDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="New plan"
        footer={<DrawerFooter note={note} pending={pending} onCancel={() => setOpen(false)} onSubmit={save} submitLabel="Create" />}
      >
        <p className="tr-hint tr-drawer-lede">Next you put people on it and publish it to a date; that is what creates the sessions.</p>
        <PlanFields draft={draft} onChange={setDraft} types={types} />
      </DetailDrawer>
    </section>
  );
}
