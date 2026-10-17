"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { HomeFace } from "@/entities/team/ui/home/HomeFace";
import { giveKudos } from "@/entities/team/lib/kudos-actions";
import { KUDOS_MAX } from "@/entities/team/lib/kudos-rules";
import type { MayProp } from "@/kernel/identity/may-prop";

// Thank a teammate (TH.1.8): pick a face or anyone else, write one line, send.
// Enter sends. A failed send keeps the words where they were typed; a sent one
// lands on the board below when the action refreshes the page.

export type KudosFace = { personId: string; name: string; firstName: string; avatarUrl: string | null; tone: number };

// The counter appears only near the limit, so a short note is never watched.
const COUNTER_FROM = KUDOS_MAX - 40;

export function KudosComposer({ quick, everyone, may }: { quick: KudosFace[]; everyone: KudosFace[]; may: MayProp }) {
  const inputId = useId();
  const selectId = useId();
  const [to, setTo] = useState<string | null>(quick[0]?.personId ?? null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const person = everyone.find((p) => p.personId === to) ?? null;
  const fromList = to !== null && !quick.some((p) => p.personId === to);

  function pick(personId: string | null) {
    setTo(personId);
    setError(null);
    setSent(null);
  }

  async function send() {
    if (sending) return;
    setError(null);
    setSent(null);
    if (!person) {
      setError("Pick a teammate to thank.");
      return;
    }
    if (!text.trim()) {
      setError("Write your thanks in one line first.");
      return;
    }
    setSending(true);
    const r = await giveKudos({ toPersonId: person.personId, body: text });
    setSending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setText("");
    setSent(`${person.firstName} gets your kudos in their Inbox.`);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  // Hidden unless the viewer holds the action's atom (ADR 0014); the action still guards.
  if (!may["team.culture"]) return null;
  return (
    <div className="th-kd-form">
      <div className="th-kd-to" role="group" aria-label="Who to thank">
        <span className="th-kd-lbl">To</span>
        {quick.map((p) => (
          <button
            key={p.personId}
            type="button"
            className={`th-kd-face${p.personId === to ? " is-on" : ""}`}
            title={p.name}
            aria-label={`Thank ${p.name}`}
            aria-pressed={p.personId === to}
            onClick={() => pick(p.personId)}
          >
            <HomeFace name={p.name} avatarUrl={p.avatarUrl} tone={p.tone} />
          </button>
        ))}
        <label htmlFor={selectId} className="u-sr-only">
          Anyone else
        </label>
        <select
          id={selectId}
          className={`th-kd-else${fromList ? " is-on" : ""}`}
          value={fromList && to ? to : ""}
          onChange={(e) => pick(e.target.value || (quick[0]?.personId ?? null))}
        >
          <option value="">Anyone else…</option>
          {everyone.map((p) => (
            <option key={p.personId} value={p.personId}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="th-kd-in">
        <label htmlFor={inputId} className="u-sr-only">
          Your thanks, in one line
        </label>
        <input
          id={inputId}
          type="text"
          value={text}
          maxLength={KUDOS_MAX}
          placeholder={person ? `Thank ${person.firstName} for something, in one line` : "Pick someone, then thank them in one line"}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="button" className="th-kd-send" disabled={sending} onClick={() => void send()}>
          {sending ? "Sending…" : "Send kudos"}
        </button>
      </div>
      {text.length >= COUNTER_FROM && (
        <p className="th-kd-count">
          {KUDOS_MAX - text.length} characters left
        </p>
      )}
      {error && (
        <p className="th-kd-err" role="alert">
          {error}
        </p>
      )}
      <p className="th-kd-sent" role="status">
        {sent}
      </p>
    </div>
  );
}
