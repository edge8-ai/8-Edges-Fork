"use client";

import { useState } from "react";
import { NOTICED_MAX } from "@/entities/coaching/lib/noticed-shared";

// Writing a noticed sentence (L.4).
//
// The value is required by the form rather than optional, and that is the whole
// mechanic: being made to say WHICH value a behaviour showed is what stops this
// becoming "great job". The products that get recognition right all do this;
// what they also do, and this does not, is count it.
//
// It folds away until asked for. A coach's profile page is for preparing a 1-1,
// and a permanently open "say something nice" box would read as a chore.

export function NoticeSomething({
  values,
  busy,
  onWrite,
}: {
  values: { id: string; title: string }[];
  busy: boolean;
  // onOk runs only when it was written, so a refused sentence is not lost (K.79).
  onWrite: (input: { body: string; valueId: string | null; subject: string | null }, onOk: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [valueId, setValueId] = useState("");
  const [subject, setSubject] = useState("");

  if (!open) {
    return (
      <div className="admin-coach-add-row">
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setOpen(true)}>
          Notice something
        </button>
      </div>
    );
  }

  return (
    <div className="coach-notice-form">
      <div className="admin-hint">
        One sentence about a specific piece of work, and the value it showed. Only they see it — it is never counted,
        listed or compared with anybody.
      </div>
      <textarea
        className="admin-input"
        rows={2}
        maxLength={NOTICED_MAX}
        disabled={busy}
        value={body}
        placeholder="You caught the pricing error before it went out, and rewrote it yourself rather than handing it back."
        onChange={(e) => setBody(e.target.value)}
        aria-label="What they did"
      />
      <div className="admin-coach-add-row">
        <select
          className="admin-input"
          value={valueId}
          disabled={busy}
          onChange={(e) => setValueId(e.target.value)}
          aria-label="The value it showed"
        >
          <option value="">The value it showed…</option>
          {values.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
        <input
          className="admin-input"
          value={subject}
          disabled={busy}
          placeholder="On what (optional)"
          onChange={(e) => setSubject(e.target.value)}
          aria-label="What the work was"
        />
        <button
          type="button"
          className="admin-btn admin-btn--sm"
          disabled={busy || !body.trim()}
          onClick={() => {
            onWrite({ body, valueId: valueId || null, subject: subject || null }, () => {
              setBody("");
              setValueId("");
              setSubject("");
              setOpen(false);
            });
          }}
        >
          Send it
        </button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
