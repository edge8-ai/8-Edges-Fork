"use client";

// One plan, for its organiser (TR.5): the roster, publishing to a date, adding
// a session by hand, each session with Move and Cancel until it starts, and
// whether the plan's learners can see it yet.
// Nothing here is anyone's answer (ADR 0016).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import { PlanFields, planInput, type PlanDraft } from "./PlanFields";
import { LENGTHS } from "./TrainingFields";
import { PeoplePicker } from "./PeoplePicker";
import { ActionNote, DrawerFooter } from "./ActionNote";
import { SessionList, type SessionItem } from "./PlanSessionList";

export type { SessionItem } from "./PlanSessionList";

export type PlanPageProps = {
  plan: { id: string; title: string; draft: PlanDraft; rhythm: string; publishedUntil: string | null; larkTitle: string | null; openToLearners: boolean; hasPhilosophy: boolean; recipients: string[]; recipientNames: string[]; thisWeek: string };
  roster: { id: string; name: string }[];
  sessions: SessionItem[];
  types: { id: string; name: string }[];
  people: { id: string; name: string }[];
  today: string;
  actions: {
    update: (planId: string, input: unknown) => Promise<Result>;
    roster: (planId: string, input: unknown) => Promise<Result>;
    publish: (planId: string, input: unknown) => Promise<Result>;
    add: (planId: string, input: unknown) => Promise<Result>;
    move: (planId: string, trainingId: string, input: unknown) => Promise<Result>;
    cancel: (planId: string, trainingId: string) => Promise<Result>;
    archive: (planId: string) => Promise<Result>;
    recipients: (planId: string, input: unknown) => Promise<Result>;
    openToLearners: (planId: string, input: unknown) => Promise<Result>;
  };
};

type Drawer = { kind: "edit" } | { kind: "roster" } | { kind: "add" } | { kind: "move"; session: SessionItem } | { kind: "recipients" } | null;
const lengthText = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

export function PlanPage({ plan, roster, sessions, types, people, today, actions }: PlanPageProps) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [draft, setDraft] = useState<PlanDraft>(plan.draft);
  const [who, setWho] = useState<string[]>(roster.map((p) => p.id));
  const [until, setUntil] = useState(plan.publishedUntil ?? today);
  const [session, setSession] = useState({ date: today, start: plan.draft.start, minutes: 60, notes: "" });
  const [emails, setEmails] = useState(plan.recipients.join("\n"));
  const { note, setNote, pending, run } = useActionRunner();
  const close = () => setDrawer(null);
  const openDrawer = (d: Drawer) => {
    setNote(null);
    if (d?.kind === "edit") setDraft(plan.draft);
    if (d?.kind === "roster") setWho(roster.map((p) => p.id));
    if (d?.kind === "move") setSession({ date: d.session.date, start: d.session.start, minutes: d.session.minutes, notes: d.session.notes });
    if (d?.kind === "add") setSession({ date: today, start: plan.draft.start, minutes: 60, notes: "" });
    setDrawer(d);
  };

  // People already on the plan stay pickable even if the organiser could not add them today.
  const options = (() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const p of roster) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  const save = () => {
    if (drawer?.kind === "edit") return run(() => actions.update(plan.id, planInput(draft)), "Saved.", close);
    if (drawer?.kind === "roster") return run(() => actions.roster(plan.id, { personIds: who }), "Roster saved.", close);
    if (drawer?.kind === "recipients") return run(() => actions.recipients(plan.id, { emails: emails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean) }), "Recipients saved.", close);
    if (drawer?.kind === "add") return run(() => actions.add(plan.id, { ...session, ...(session.notes.trim() ? { notes: session.notes } : {}) }), "Session added.", close);
    if (drawer?.kind === "move") {
      const s = drawer.session;
      const input = { title: s.title, ...(session.notes.trim() ? { notes: session.notes } : {}), ...(s.may.move ? { date: session.date, start: session.start, minutes: session.minutes } : {}) };
      return run(() => actions.move(plan.id, s.id, input), "Saved.", close);
    }
  };
  const publish = () => run(() => actions.publish(plan.id, { until }), "Published.");
  const archive = async () => {
    const res = await actions.archive(plan.id);
    if (res.ok) router.push("/team/training");
    return res;
  };

  const upcoming = sessions.filter((s) => s.state === "upcoming");
  const past = sessions.filter((s) => s.state !== "upcoming");
  const titleOf = drawer?.kind === "edit" ? "Edit plan" : drawer?.kind === "roster" ? "Who is on the plan" : drawer?.kind === "add" ? "Add a session" : drawer?.kind === "recipients" ? "Weekly recap recipients" : "Move the session";

  return (
    <>
      <ActionNote note={note} only="ok" />
      <section className="admin-card admin-section-card tr-card" aria-label="Roster">
        <div className="tr-card-head">
          <h2 className="tr-card-title">Roster</h2>
          <div className="tr-row-actions">
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => openDrawer({ kind: "roster" })}>
              Change who
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => openDrawer({ kind: "edit" })}>
              Edit plan
            </button>
            <Link className="admin-btn admin-btn--sm" href={`/team/training/plans/${plan.id}/philosophy`}>
              {plan.hasPhilosophy ? "Philosophy" : "Write the philosophy"}
            </Link>
            <Link className="admin-btn admin-btn--sm" href="/team/training/exercises">
              Exercises
            </Link>
            <Link className="admin-btn admin-btn--sm" href={`/team/training/plans/${plan.id}/weekly/${plan.thisWeek}`}>
              Weekly recap
            </Link>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => openDrawer({ kind: "recipients" })}>
              Recipients{plan.recipientNames.length ? ` (${plan.recipientNames.length})` : ""}
            </button>
          </div>
        </div>
        {roster.length === 0 ? (
          <p className="tr-hint">Nobody yet. Put people on the plan, then publish it.</p>
        ) : (
          <div className="tr-chips tr-roster">
            {roster.map((p) => (
              <Link key={p.id} className="tr-chip is-on" href={`/team/training/plans/${plan.id}/learners/${p.id}`}>
                {p.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card tr-card" aria-label="Publish">
        <div className="tr-card-head">
          <div>
            <h2 className="tr-card-title">Publish</h2>
            <p className="tr-hint">
              {plan.rhythm}
              {plan.publishedUntil ? ` · sessions exist up to ${plan.publishedUntil}` : " · nothing published yet"}. Publishing creates one session per date, with the roster on each. Nothing but you extends it.
            </p>
          </div>
        </div>
        <div className="tr-publish">
          <label className="admin-field tr-publish-field">
            <span className="admin-label">Up to</span>
            <input className="admin-input" type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <button type="button" className="admin-btn admin-btn--primary" onClick={publish} disabled={pending || roster.length === 0}>
            Publish
          </button>
          <button type="button" className="admin-btn" onClick={() => openDrawer({ kind: "add" })} disabled={roster.length === 0}>
            + Add a session
          </button>
        </div>
        <ActionNote note={note} only="err" />
      </section>

      <section className="admin-card admin-section-card tr-card" aria-label="Learners">
        <div className="tr-card-head">
          <div>
            <h2 className="tr-card-title">{plan.openToLearners ? "Open to learners" : "Closed to learners"}</h2>
            <p className="tr-hint">
              {plan.openToLearners
                ? "Learners on the plan see its sessions, homework, your notes and recaps on My Training."
                : "Learners on the plan see none of it yet: no sessions, homework, notes or recaps, and no Inbox lines. You and the routines carry on as usual."}
            </p>
          </div>
          <ConfirmButton
            className="admin-btn admin-btn--sm"
            label={plan.openToLearners ? "Close to learners" : "Open to learners"}
            title={plan.openToLearners ? "Close this plan to its learners?" : "Open this plan to its learners?"}
            body={plan.openToLearners ? "Its sessions, homework, notes and recaps disappear from their My Training until you open it again. Nothing is deleted." : "Everyone on the plan sees its sessions, homework, your notes and published recaps on My Training."}
            confirmLabel={plan.openToLearners ? "Close" : "Open"}
            onConfirm={() => actions.openToLearners(plan.id, { open: !plan.openToLearners })}
            onDone={() => router.refresh()}
          />
        </div>
      </section>

      <SessionList title="Upcoming" items={upcoming} empty="No sessions yet. Publish the plan or add one." onMove={(s) => openDrawer({ kind: "move", session: s })} cancel={(id) => actions.cancel(plan.id, id)} />
      <SessionList title="Past" items={past} empty="" onMove={(s) => openDrawer({ kind: "move", session: s })} cancel={(id) => actions.cancel(plan.id, id)} />

      <div className="tr-organise-head">
        <ConfirmButton className="admin-btn admin-btn--sm tr-btn-quiet" label="Retire this plan" title="Retire this plan?" body="Its sessions stay as they are; nothing new is published from it." confirmLabel="Retire" onConfirm={archive} />
      </div>

      <DetailDrawer open={drawer !== null} onClose={close} title={titleOf} footer={<DrawerFooter note={note} pending={pending} onCancel={close} onSubmit={save} submitLabel={drawer?.kind === "add" ? "Add" : "Save"} />}>
        {drawer?.kind === "edit" && <PlanFields draft={draft} onChange={setDraft} types={types} />}
        {drawer?.kind === "recipients" && (
          <div className="admin-form">
            <p className="tr-hint tr-drawer-lede">Who gets the weekly recap by email, one address per line. Each must be a person in the directory.</p>
            <textarea className="admin-textarea" rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} aria-label="Recipient addresses" />
            {plan.recipientNames.length > 0 && <p className="tr-hint">Now: {plan.recipientNames.join(", ")}</p>}
          </div>
        )}
        {drawer?.kind === "roster" && (
          <>
            <p className="tr-hint tr-drawer-lede">Everyone on the plan goes on each session still to come. A session that has started keeps who was on it.</p>
            <PeoplePicker people={options} value={who} onChange={setWho} />
          </>
        )}
        {(drawer?.kind === "add" || drawer?.kind === "move") && (
          <div className="admin-form">
            {drawer.kind === "add" && <p className="tr-hint tr-drawer-lede">One more session of {plan.title}, with everyone on the roster.</p>}
            {drawer.kind === "move" && !drawer.session.may.move && <p className="admin-hint">It has started, so only the notes can change.</p>}
            <div className="admin-form-row">
              <label className="admin-field">
                <span className="admin-label">Date</span>
                <input className="admin-input" type="date" value={session.date} onChange={(e) => setSession({ ...session, date: e.target.value })} disabled={drawer.kind === "move" && !drawer.session.may.move} required />
              </label>
              <label className="admin-field">
                <span className="admin-label">Starts (Vietnam time)</span>
                <input className="admin-input" type="time" value={session.start} onChange={(e) => setSession({ ...session, start: e.target.value })} disabled={drawer.kind === "move" && !drawer.session.may.move} required />
              </label>
              <label className="admin-field">
                <span className="admin-label">Length</span>
                <select className="admin-select" value={session.minutes} onChange={(e) => setSession({ ...session, minutes: Number(e.target.value) })} disabled={drawer.kind === "move" && !drawer.session.may.move}>
                  {[...new Set([...LENGTHS, session.minutes])].sort((a, b) => a - b).map((m) => (
                    <option key={m} value={m}>
                      {lengthText(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="admin-field">
              <span className="admin-label">Notes · optional</span>
              <textarea className="admin-textarea" rows={3} value={session.notes} onChange={(e) => setSession({ ...session, notes: e.target.value })} maxLength={2000} />
            </label>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
