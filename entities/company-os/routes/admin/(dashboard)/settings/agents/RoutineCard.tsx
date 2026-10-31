"use client";

import { useState, useTransition, type FormEvent } from "react";
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import type { MayProp } from "@/kernel/identity/may-prop";
import { badgeClass, type AgentRow, type SwitchMode, type Tone } from "@/entities/company-os/lib/agent-rows";
import { runRoutineNow, turnRoutineOff, turnRoutineOn, turnRoutineShadow } from "./actions";
import { RoutineDetails, type PendingRun } from "./RoutineDetails";

// One routine on Settings -> Agents (Y.25): what it is doing now, the switch,
// Run now, and its details. Turning it off asks why, in place, because every
// skipped run repeats the reason; Run now says what the run will send before
// it runs. Both write through guarded actions, and the page re-renders from
// the database when each returns.

const CONTROL = "company-os.routine-control";
const CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

type Mode = null | "pausing" | "confirming";

const SWITCH_MODES: { key: SwitchMode; label: string; title: string }[] = [
  { key: "live", label: "Live", title: "Runs on its schedule and sends what it makes." },
  { key: "shadow", label: "Shadow", title: "Runs on its schedule and records what it would have sent, but sends nothing." },
  { key: "off", label: "Off", title: "Does not run on its schedule. You will be asked why." },
];

const NO_ANSWER = "The server did not answer. Reload the page to see where it stands.";

export function RoutineCard({ row, may }: { row: AgentRow; may: MayProp }) {
  const [mode, setMode] = useState<Mode>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [switching, startSwitch] = useTransition();
  const [running, startRun] = useTransition();
  const canControl = Boolean(may[CONTROL]);
  const pending: PendingRun | null = running && ranAt ? { at: ranAt } : null;

  // The two-way switch is on only when the routine is live. A routine set to
  // shadow that does not support it is not on (its runs are skipped), so the
  // switch says Shadow and turning it turns the routine on.
  const on = row.mode === "live";

  function flip() {
    setNote(null);
    if (on) {
      setMode("pausing");
      setDraft("");
      return;
    }
    setMode(null);
    startSwitch(async () => {
      try {
        const res = await turnRoutineOn({ routineId: row.id });
        if (!res.ok) setNote({ kind: "err", text: res.error });
      } catch {
        setNote({ kind: "err", text: NO_ANSWER });
      }
    });
  }

  // The three-way switch (Z.17), for a routine that declares shadow. Off asks
  // why, as the two-way switch does; Live and Shadow write at once.
  function choose(next: SwitchMode) {
    setNote(null);
    if (next === row.mode) return;
    if (next === "off") {
      setMode("pausing");
      setDraft("");
      return;
    }
    setMode(null);
    startSwitch(async () => {
      try {
        const res = next === "shadow" ? await turnRoutineShadow({ routineId: row.id }) : await turnRoutineOn({ routineId: row.id });
        if (!res.ok) setNote({ kind: "err", text: res.error });
      } catch {
        setNote({ kind: "err", text: NO_ANSWER });
      }
    });
  }

  function confirmPause(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = draft.trim();
    if (!reason) {
      setNote({ kind: "err", text: "Say why it is off: every skipped run repeats the reason." });
      return;
    }
    startSwitch(async () => {
      try {
        const res = await turnRoutineOff({ routineId: row.id, reason });
        if (res.ok) {
          setMode(null);
          setNote(null);
        } else setNote({ kind: "err", text: res.error });
      } catch {
        setNote({ kind: "err", text: NO_ANSWER });
      }
    });
  }

  function run() {
    setMode(null);
    setNote(null);
    setOpen(true);
    setRanAt(CLOCK.format(new Date()));
    startRun(async () => {
      // An action that never answers (the page's 300 s limit, a dropped
      // network) rejects here; caught, so the page stays and says so, rather
      // than the admin error boundary replacing it.
      try {
        const res = await runRoutineNow({ routineId: row.id });
        setNote(res.ok ? { kind: "ok", text: res.message } : { kind: "err", text: res.error });
      } catch {
        setNote({ kind: "err", text: "The run did not answer within 5 minutes; its history shows how it ended." });
      }
    });
  }

  const pill: { text: string; tone: Tone } = pending ? { text: "Running", tone: "info" } : { text: row.pill, tone: row.tone };
  const now = pending ? `Running: started by you at ${pending.at}. This page updates when it finishes.` : row.now;

  return (
    <article className="admin-agents-row" aria-busy={running || switching}>
      <div className="admin-agents-row-top">
        <div className="admin-agents-row-main">
          <div className="admin-agents-row-title">
            <h2 className="admin-agents-name">{row.name}</h2>
            <span className={badgeClass(pill.tone)}>{pill.text}</span>
          </div>
          <p className="admin-agents-now">{now}</p>
          <p className="admin-agents-meta">{row.meta}</p>
        </div>
        <div className="admin-agents-controls">
          {row.canShadow && canControl ? (
            <div role="group" aria-label={`${row.name}: live, shadow or off`} className="admin-agents-mode">
              {SWITCH_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={row.mode === m.key}
                  title={m.title}
                  className={`admin-agents-mode-btn${row.mode === m.key ? ` is-on is-${m.key}` : ""}`}
                  disabled={switching}
                  onClick={() => choose(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ) : row.canPause && canControl ? (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${row.name} is ${on ? "on. Turn it off" : row.mode === "shadow" ? "set to shadow, which it does not support. Turn it on" : "off. Turn it on"}`}
              className="admin-agents-switch"
              disabled={switching}
              onClick={flip}
            >
              <span aria-hidden className="admin-agents-switch-track">
                <span className="admin-agents-switch-knob" />
              </span>
              {on ? "On" : row.mode === "shadow" ? "Shadow" : "Off"}
            </button>
          ) : null}
          {row.canRun && canControl ? (
            <button
              type="button"
              className="admin-btn admin-agents-run"
              // One run at a time: the action refuses too, for a run another
              // tab or the schedule started.
              disabled={running || row.busy}
              title={row.busy ? `It is ${row.state} already; Run now waits until that run ends.` : undefined}
              onClick={() => {
                setNote(null);
                setMode("confirming");
              }}
            >
              {running ? "Running…" : "Run now"}
            </button>
          ) : null}
          <button type="button" className="admin-btn admin-agents-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Less" : "Details"}
          </button>
        </div>
      </div>

      {mode === "pausing" ? (
        <form className="admin-agents-inline" onSubmit={confirmPause}>
          <label className="admin-agents-reason">
            Why is it off? Every skipped run will say this.
            <input
              type="text"
              className="admin-input"
              value={draft}
              maxLength={200}
              required
              autoFocus
              placeholder="e.g. waiting on the redesign decision"
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button type="submit" className="admin-btn admin-agents-btn-ink" disabled={switching}>
            {switching ? "Turning off…" : "Turn it off"}
          </button>
          <button type="button" className="admin-btn" onClick={() => setMode(null)}>
            Keep it on
          </button>
        </form>
      ) : null}

      {mode === "confirming" ? (
        <div role="alertdialog" aria-label={`Run ${row.name} now`} className="admin-agents-inline">
          <p className="admin-agents-inline-text">{row.runNote}</p>
          <button type="button" className="admin-btn admin-btn--primary" onClick={run}>
            Run it
          </button>
          <button type="button" className="admin-btn" onClick={() => setMode(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      {note ? (
        <p role={note.kind === "err" ? "alert" : "status"} className={note.kind === "err" ? "admin-agents-note u-err" : "admin-agents-note"}>
          {note.text}
        </p>
      ) : null}

      {open ? <RoutineDetails row={row} may={may} pending={pending} /> : null}
    </article>
  );
}
