"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GOAL_STATUS_LABELS, LadderSelect, ladderValue, parseLadder, type AdminMemberGoals, type CoachingGoal, type EdgesOptions, type GoalStatus } from "@/entities/coaching/client";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { addMemberGoal, deleteMemberGoal, updateMemberGoal } from "../actions";

// The editable "Team member goals" tab of /admin/company/goals. Admins may add,
// edit, and delete ANY member's FAST goals (members still self-serve their own
// at /team/goals). One section per active employee; the form mirrors the
// member's own goal form so an admin edit and a self-edit produce the same row.
const STATUSES: GoalStatus[] = ["draft", "active", "achieved", "dropped"];

type FormState = {
  title: string;
  description: string;
  status: GoalStatus;
  quarterLabel: string;
  metricUnit: string;
  startValue: string;
  targetValue: string;
  currentValue: string;
  dueDate: string;
  ladder: string;
};

function emptyForm(quarter: string): FormState {
  return {
    title: "",
    description: "",
    status: "active",
    quarterLabel: quarter,
    metricUnit: "",
    startValue: "",
    targetValue: "",
    currentValue: "",
    dueDate: "",
    ladder: "",
  };
}

function formOf(g: CoachingGoal): FormState {
  const str = (v: number | null) => (v === null ? "" : String(v));
  return {
    title: g.title,
    description: g.descriptionMarkdown ?? "",
    status: g.status,
    quarterLabel: g.quarterLabel ?? "",
    metricUnit: g.metricUnit ?? "",
    startValue: str(g.startValue),
    targetValue: str(g.targetValue),
    currentValue: str(g.currentValue),
    dueDate: g.dueDate ?? "",
    ladder: ladderValue(g.ladder),
  };
}

const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

// Status pill only for the exceptions (achieved / draft / dropped); "active" is
// the default and stays unlabelled so 21 cards don't repeat the same pill.
function badgeTone(status: GoalStatus): string {
  return status === "achieved" ? "admin-badge--ok" : "admin-badge--warn";
}

// Progress start → target. Null when the numbers can't tell a truthful story:
// no target/current, zero span, or a down-direction goal ("under 20 days")
// with no recorded start, which would otherwise clamp to a full bar.
function progressPct(g: CoachingGoal): number | null {
  if (g.targetValue === null || g.currentValue === null) return null;
  if (g.startValue === null && g.currentValue > g.targetValue) return null;
  const from = g.startValue ?? 0;
  const span = g.targetValue - from;
  if (span === 0) return null;
  return Math.max(0, Math.min(100, Math.round(((g.currentValue - from) / span) * 100)));
}

export function IndividualGoalsEditor({
  members,
  edges,
  quarter,
}: {
  members: AdminMemberGoals[];
  edges: EdgesOptions;
  quarter: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // Which member's add form is open, and which goal id is being edited.
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(quarter));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd(teamMemberId: string) {
    setEditingId(null);
    setAddingFor(teamMemberId);
    setForm(emptyForm(quarter));
    setBanner(null);
  }
  function openEdit(g: CoachingGoal) {
    setAddingFor(null);
    setEditingId(g.id);
    setForm(formOf(g));
    setBanner(null);
  }
  function close() {
    setAddingFor(null);
    setEditingId(null);
    setForm(emptyForm(quarter));
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setBanner({ tone: "ok", text: okText });
        close();
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  function inputOf(): Parameters<typeof addMemberGoal>[1] {
    return {
      title: form.title,
      descriptionMarkdown: form.description,
      status: form.status,
      quarterLabel: form.quarterLabel,
      metricUnit: form.metricUnit,
      startValue: numOrNull(form.startValue),
      targetValue: numOrNull(form.targetValue),
      currentValue: numOrNull(form.currentValue),
      dueDate: form.dueDate,
      ladder: parseLadder(form.ladder),
    };
  }

  // `onDelete` is the delete action itself (not a handler): the ConfirmButton
  // it feeds shows the action's error in the modal and only then reports back.
  const goalForm = (
    onSubmit: (e: React.FormEvent) => void,
    label: string,
    onDelete?: { title: string; run: () => Promise<{ ok: true } | { ok: false; error: string }> },
  ) => (
    <form className="admin-form" onSubmit={onSubmit}>
      <div className="admin-field">
        <label className="admin-label">The goal</label>
        <input
          className="admin-input"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Days to hire under 20 days"
          maxLength={200}
          required
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">What success looks like (optional)</label>
        <textarea
          className="admin-textarea"
          rows={2}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Aligns to a company goal</label>
        <LadderSelect
          edges={edges}
          value={form.ladder}
          onChange={(v) => set("ladder", v)}
          disabled={pending}
          emptyLabel="Choose the company goal this serves…"
          required
        />
      </div>
      <div className="admin-goals-grid">
        <div className="admin-field">
          <label className="admin-label">Measure (optional)</label>
          <input className="admin-input" value={form.metricUnit} onChange={(e) => set("metricUnit", e.target.value)} placeholder="days, clients, %" />
        </div>
        <div className="admin-field">
          <label className="admin-label">Starting at</label>
          <input className="admin-input" type="number" step="any" value={form.startValue} onChange={(e) => set("startValue", e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Now</label>
          <input className="admin-input" type="number" step="any" value={form.currentValue} onChange={(e) => set("currentValue", e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Target</label>
          <input className="admin-input" type="number" step="any" value={form.targetValue} onChange={(e) => set("targetValue", e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label">By when</label>
          <input className="admin-input" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Cycle</label>
          <input className="admin-input" value={form.quarterLabel} onChange={(e) => set("quarterLabel", e.target.value)} placeholder={quarter} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Status</label>
          <select className="admin-select" value={form.status} onChange={(e) => set("status", e.target.value as GoalStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {pending ? "Saving…" : label}
        </button>
        <button type="button" className="admin-btn" onClick={close} disabled={pending}>
          Cancel
        </button>
        {onDelete && (
          <ConfirmButton
            label="Delete goal"
            title={`Delete "${onDelete.title}"?`}
            body="The goal and its progress history are removed."
            confirmLabel="Delete"
            disabled={pending}
            onConfirm={onDelete.run}
            onDone={() => {
              setBanner({ tone: "ok", text: "Goal deleted." });
              close();
              router.refresh();
            }}
          />
        )}
      </div>
    </form>
  );

  // Same list anatomy as the Company goals tab: one card per member (the
  // objective card), goal rows inside it (the KR rows), actions in the same
  // positions. Members without an active goal collapse into one trailing card
  // so the list stays dense.
  const withGoals = members.filter((m) => m.goals.length > 0);
  const withoutGoals = members.filter((m) => m.goals.length === 0);

  function fmtGoal(g: CoachingGoal): string {
    const unit = g.metricUnit ? ` ${g.metricUnit}` : "";
    if (g.currentValue === null && g.targetValue === null) return "";
    if (g.targetValue === null) return `${g.currentValue}${unit}`;
    return `${g.currentValue ?? 0}/${g.targetValue}${unit}`;
  }

  const goalRow = (g: CoachingGoal, gi: number) =>
    editingId === g.id ? (
      <div key={g.id} className="admin-edges-kr">
        <div className="u-pt-1 u-pb-3">
          {goalForm(
            (e) => {
              e.preventDefault();
              run(() => updateMemberGoal(g.id, inputOf()), "Goal saved.");
            },
            "Save goal",
            { title: g.title, run: () => deleteMemberGoal(g.id) },
          )}
        </div>
      </div>
    ) : (
      <div
        key={g.id}
        className="admin-edges-kr admin-edges-kr--click"
        role="button"
        tabIndex={0}
        title="Click to edit"
        onClick={() => openEdit(g)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEdit(g);
          }
        }}
      >
        <>
          <div className="admin-edges-kr-row">
            <div className="admin-edges-kr-title">
              <span className="admin-kr-index">
                G{gi + 1}
              </span>
              {g.title}
              {g.status !== "active" && (
                <span className={`admin-badge ${badgeTone(g.status)} u-ml-2`}>
                  {GOAL_STATUS_LABELS[g.status]}
                </span>
              )}
            </div>
            {(() => {
              const pct = progressPct(g);
              const val = fmtGoal(g);
              return pct !== null || val ? (
                <span className="admin-edges-prog">
                  <span className="admin-edges-prog-bar">
                    <i
                      className={g.status === "achieved" ? "is-done" : ""}
                      style={{ width: `${pct ?? 0}%` }} /* layout-ok: data-driven width */
                    />
                  </span>
                  <span className="admin-edges-prog-val">{val}</span>
                </span>
              ) : null;
            })()}
          </div>
          <div className="admin-cell-muted u-sm">
            {g.ladder ? `⇗ ${g.ladder.label}` : "No ladder yet"}
          </div>
        </>
      </div>
    );

  const memberCard = (m: AdminMemberGoals) => (
    <div key={m.teamMemberId} className="admin-card u-mb-4 u-p-0 u-clip">
      <div className="admin-edges-ohead">
        <h3>{m.name}</h3>
        <span className="admin-edges-ohead-note">
          {m.goals.length} {m.goals.length === 1 ? "goal" : "goals"} ·{" "}
          {m.goals.filter((g) => g.ladder).length} aligned
        </span>
      </div>

      {m.goals.map((g, gi) => goalRow(g, gi))}

      {addingFor === m.teamMemberId ? (
        <div className="u-p-4 admin-divider-top">
          {goalForm((e) => {
            e.preventDefault();
            run(() => addMemberGoal(m.teamMemberId, inputOf()), "Goal added.");
          }, "Add goal")}
        </div>
      ) : (
        <div className="admin-form-actions u-p-3 admin-divider-top">
          <button className="admin-btn admin-btn--sm" onClick={() => openAdd(m.teamMemberId)} disabled={pending}>
            + Goal
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {banner && <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>{banner.text}</div>}

      {withGoals.map(memberCard)}

      {withoutGoals.length > 0 && (
        <div className="admin-card u-mb-4 u-p-0 u-clip">
          <div className="admin-edges-ohead">
            <h3>No active goal yet</h3>
            <span className="admin-edges-ohead-note">
              {withoutGoals.length} {withoutGoals.length === 1 ? "member" : "members"}
            </span>
          </div>
          {withoutGoals.map((m) => (
            <div key={m.teamMemberId} className="admin-edges-kr">
              {addingFor === m.teamMemberId ? (
                <div className="u-pt-1 u-pb-3">
                  {goalForm((e) => {
                    e.preventDefault();
                    run(() => addMemberGoal(m.teamMemberId, inputOf()), "Goal added.");
                  }, "Add goal")}
                </div>
              ) : (
                <div className="admin-edges-kr-row">
                  <div className="admin-edges-kr-title">{m.name}</div>
                  <button className="admin-btn admin-btn--sm" onClick={() => openAdd(m.teamMemberId)} disabled={pending}>
                    + Goal
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
