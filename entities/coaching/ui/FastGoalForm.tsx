"use client";

import { useState } from "react";
import { GOAL_STATUS_LABELS, type EdgesOptions, type GoalStatus } from "@/entities/coaching/lib/types";
import type { MyGoalInput } from "@/entities/coaching/lib/data/my-goals";
import { LadderSelect } from "@/entities/coaching/ui/LadderSelect";
import { parseLadder } from "@/entities/coaching/lib/ladder";
import {
  currentQuarterLabel,
  darkNotice,
  fastChecks,
  partsOf,
  quarterLabelFor,
  sentenceOf,
  EMPTY_PARTS,
  type GoalSentenceParts,
} from "@/entities/coaching/lib/fast-checks";
import { FastGoalChecks, GoalExamples } from "./FastGoalChecks";

// The one FAST goal form. Member page, coach card and directory editor all
// render this, so a goal is the same object wherever it is written (K.13);
// before this there were three editors that had drifted apart, and a goal a
// manager typed in the directory could not be saved by its owner.
//
// The four sentence boxes are client state only: they are joined into
// `goals.title` on save. Storing the parts would be four columns nobody reads,
// and a goal is one sentence.

export type FastGoalInitial = {
  title: string;
  status: GoalStatus;
  // The ladder as the picker encodes it ("kind:id"), "" for none.
  ladderValue: string;
  descriptionMarkdown: string | null;
  stretchMarkdown: string | null;
  metricUnit: string | null;
  startValue: number | null;
  currentValue: number | null;
  targetValue: number | null;
  dueDate: string | null;
};

type FormState = {
  parts: GoalSentenceParts;
  ladder: string;
  status: GoalStatus;
  description: string;
  stretch: string;
  metricUnit: string;
  startValue: string;
  currentValue: string;
  targetValue: string;
  dueDate: string;
};

const STATUSES: GoalStatus[] = ["draft", "active", "achieved", "dropped"];

// "" stays null rather than becoming 0 — a blank measure is "not tracked",
// not "zero".
const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

const str = (v: number | null): string => (v === null ? "" : String(v));

function stateOf(initial: FastGoalInitial | null): FormState {
  return {
    parts: initial ? partsOf(initial.title) : EMPTY_PARTS,
    ladder: initial?.ladderValue ?? "",
    status: initial?.status ?? "active",
    description: initial?.descriptionMarkdown ?? "",
    stretch: initial?.stretchMarkdown ?? "",
    metricUnit: initial?.metricUnit ?? "",
    startValue: str(initial?.startValue ?? null),
    currentValue: str(initial?.currentValue ?? null),
    targetValue: str(initial?.targetValue ?? null),
    dueDate: initial?.dueDate ?? "",
  };
}

export function FastGoalForm({
  edges,
  initial = null,
  busy = false,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  edges: EdgesOptions;
  initial?: FastGoalInitial | null;
  busy?: boolean;
  submitLabel: string;
  onSubmit: (input: MyGoalInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => stateOf(initial));
  const [showExamples, setShowExamples] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setPart(key: keyof GoalSentenceParts, value: string) {
    setForm((f) => ({ ...f, parts: { ...f.parts, [key]: value } }));
  }

  const sentence = sentenceOf(form.parts);
  const ladder = parseLadder(form.ladder);
  const checkInput = {
    sentence,
    stretchMarkdown: form.stretch || null,
    metricUnit: form.metricUnit || null,
    targetValue: numOrNull(form.targetValue),
    dueDate: form.dueDate || null,
    ladder,
  };
  const notice = darkNotice(fastChecks(checkInput));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      title: sentence,
      ladder,
      descriptionMarkdown: form.description || null,
      status: form.status,
      // Derived from the goal's own deadline, never typed and never hardcoded:
      // a goal due in October belongs to Q4 whoever is filling the form in.
      quarterLabel: form.dueDate ? quarterLabelFor(form.dueDate) : currentQuarterLabel(),
      stretchMarkdown: form.stretch || null,
      metricUnit: form.metricUnit || null,
      startValue: numOrNull(form.startValue),
      targetValue: numOrNull(form.targetValue),
      currentValue: numOrNull(form.currentValue),
      dueDate: form.dueDate || null,
    });
  }

  const box = (key: keyof GoalSentenceParts, label: string, placeholder: string) => (
    <div className="admin-field">
      <label className="admin-label" htmlFor={`fast-${key}`}>{label}</label>
      <input
        id={`fast-${key}`}
        className="admin-input"
        value={form.parts[key]}
        onChange={(e) => setPart(key, e.target.value)}
        placeholder={placeholder}
        maxLength={80}
      />
    </div>
  );

  return (
    <form className="admin-form admin-fast-form" onSubmit={submit}>
      <div className="admin-fast-main">
        <div className="admin-goals-grid">
          {box("verb", "Do what", "Cut")}
          {box("what", "To what", "days to hire")}
          {box("amount", "How much, or to whom", "from 34 to under 20")}
          {box("byWhen", "By when", "by 30 September")}
        </div>

        <p className="admin-fast-reads">
          <span className="admin-cell-muted">Reads as</span>{" "}
          <strong>{sentence || "…"}</strong>
        </p>

        <button
          type="button"
          className="admin-btn admin-btn--sm"
          onClick={() => setShowExamples((v) => !v)}
        >
          {showExamples ? "Hide examples" : "Show good and weak examples"}
        </button>
        {showExamples && <GoalExamples />}

        <div className="admin-field">
          <label className="admin-label" htmlFor="fast-ladder">The company key result this feeds</label>
          <LadderSelect
            id="fast-ladder"
            edges={edges}
            value={form.ladder}
            onChange={(v) => set("ladder", v)}
            disabled={busy}
            emptyLabel="Choose the company goal this serves…"
            required
          />
        </div>

        <div className="admin-goals-grid">
          <div className="admin-field">
            <label className="admin-label" htmlFor="fast-unit">Measure</label>
            <input id="fast-unit" className="admin-input" value={form.metricUnit}
              onChange={(e) => set("metricUnit", e.target.value)} placeholder="days, clients, %" />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="fast-start">Starting at</label>
            <input id="fast-start" className="admin-input" type="number" step="any" value={form.startValue}
              onChange={(e) => set("startValue", e.target.value)} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="fast-now">Where I am now</label>
            <input id="fast-now" className="admin-input" type="number" step="any" value={form.currentValue}
              onChange={(e) => set("currentValue", e.target.value)} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="fast-target">Target</label>
            <input id="fast-target" className="admin-input" type="number" step="any" value={form.targetValue}
              onChange={(e) => set("targetValue", e.target.value)} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="fast-due">Due date</label>
            <input id="fast-due" className="admin-input" type="date" value={form.dueDate}
              onChange={(e) => set("dueDate", e.target.value)} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="fast-status">Status</label>
            <select id="fast-status" className="admin-select" value={form.status}
              onChange={(e) => set("status", e.target.value as GoalStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{GOAL_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="fast-stretch">What would doubling it look like?</label>
          <textarea id="fast-stretch" className="admin-textarea" rows={2} value={form.stretch}
            onChange={(e) => set("stretch", e.target.value)}
            placeholder="Twice this goal would mean…" />
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="fast-desc">What success looks like (optional)</label>
          <textarea id="fast-desc" className="admin-textarea" rows={2} value={form.description}
            onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>

      <FastGoalChecks input={checkInput} />

      <div className="admin-form-actions admin-fast-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || !sentence.trim()}>
          {busy ? "Saving…" : submitLabel}
        </button>
        <button type="button" className="admin-btn" onClick={onCancel} disabled={busy}>Cancel</button>
        {notice && <span className="admin-cell-muted">{notice}</span>}
      </div>
    </form>
  );
}
