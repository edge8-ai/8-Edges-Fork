"use client";

// The Beacon form (QS.6; spec "Lighthouses"; prototype version 10, section
// 5): "What did you put out?" and "Link to the public thing", both required,
// and Light it. One component for every place a Beacon is lit: the Light a
// Beacon button, a held fire's offer above it, QS.13's next move and QS.7's
// Evolve on a learning. `prefill` carries a held fire's title and the fire
// itself, which the action checks again before it records it as the origin.
//
// The browser says what is missing before it sends (the same words as the
// action's schema), so the native URL check is off: "Add the link to the
// public thing." is the page's sentence, not the browser's. Both fields are
// 16px on a phone (quests.css, .qs-field).
import { useId, useState, useTransition, type FormEvent } from "react";
import { useGameStyle } from "./game-style";
import { questWords } from "./plain-model";
import type { BeaconActions } from "./actions-type";
import { beaconFormError } from "../lib/lighthouse-model";

/** A held fire's title and the fire itself, or just a title to start from. */
export type BeaconPrefill = { title: string; originQuestId?: string | null };

export function BeaconForm({
  prefill = null,
  actions,
  points = null,
  onLit,
  onCancel,
}: {
  prefill?: BeaconPrefill | null;
  actions: BeaconActions | null;
  /** The points on Light it, from the ladders' slot; null shows none. */
  points?: number | null;
  onLit: (questId: string | null) => void;
  onCancel: () => void;
}) {
  const words = questWords(useGameStyle()).lighthouses;
  const id = useId();
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();

  const send = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const missing = beaconFormError(title, url);
    if (missing) return setError(missing);
    if (!actions) return setError("Lighting is not available here.");
    setError(null);
    startSend(async () => {
      const r = await actions.lightBeacon({ title: title.trim(), url: url.trim(), originQuestId: prefill?.originQuestId ?? null });
      if (!r.ok) return setError(r.error);
      onLit(r.questId ?? null);
    });
  };

  return (
    <form className="qs-composer qn-beacon-form" onSubmit={send} noValidate>
      <div className="qn-pair">
        <div>
          <label className="qs-composer-lbl" htmlFor={`${id}-title`}>
            {words.titleLabel}
          </label>
          <input
            id={`${id}-title`}
            className="qs-field"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={words.titlePlaceholder}
            maxLength={200}
            autoComplete="off"
            autoFocus={!prefill}
            aria-required="true"
            data-move="beacon-title"
          />
        </div>
        <div>
          <label className="qs-composer-lbl" htmlFor={`${id}-url`}>
            {words.urlLabel}
          </label>
          <input
            id={`${id}-url`}
            className="qs-field"
            type="url"
            inputMode="url"
            name="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            maxLength={2000}
            autoComplete="off"
            autoFocus={Boolean(prefill)}
            aria-required="true"
          />
        </div>
      </div>
      {error && (
        <p className="qs-error" role="alert">
          {error}
        </p>
      )}
      <div className="qs-composer-row">
        <button type="button" className="admin-btn" onClick={onCancel} disabled={sending}>
          {words.cancel}
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={sending}>
          {sending ? words.submitting : words.submit}
          {!sending && points !== null && <b> · +{points}</b>}
        </button>
      </div>
    </form>
  );
}
