"use client";

// The reader's moves (QS.1; spec stories 10-16, heads, and Khoa's required and
// optional rule of 20 October). Joining is per quest: on an optional bounty a
// called reader sees Accept and Decline (Decline is the hand-back, its note
// optional); a required bounty, from a manager or admin, has neither, because
// the reader is already on it. Answering is per head: Turn in (text and, where
// the ask wants one, a link), and on an optional bounty Hand back with a note. Every move goes through the server action the
// page passes in, which decides it with lib/standing.ts; this file only asks.
// With no actions the buttons are drawn disabled.
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { showToast } from "@/kernel/ui/Toast";
import type { QuestActions } from "./actions-type";
import { Glyph } from "./art";
import { calledHeads, canAccept, canDecline, canHandBack, canTurnIn, movesHint } from "./quests-model";
import { useGameStyle } from "./game-style";
import { questWords } from "./plain-model";
import type { HeadCard, QuestCard } from "../lib/quests-read";

/** Where the moves sit: the boss arena, or a card on the tavern board. Both are light; the card's buttons are smaller. */
type Place = "arena" | "card";
type Result = { ok: true } | { ok: false; error: string };

function classes(place: Place) {
  const size = place === "card" ? " admin-btn--sm" : "";
  return { btn: `admin-btn${size}`, primary: `admin-btn${size} admin-btn--primary` };
}

/** One move in flight: busy while it runs, its refusal kept to show, the page refreshed after it lands. */
function useMove(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(move: () => Promise<Result>, done: string) {
    setBusy(true);
    setError(null);
    const result = await move();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDone();
    showToast({ message: done });
    router.refresh();
  }
  return { busy, error, run };
}

function NoteForm({ place, label, placeholder, required, submit, busyLabel, busy, error, onCancel, onSubmit }: { place: Place; label: string; placeholder: string; required: boolean; submit: string; busyLabel: string; busy: boolean; error: string | null; onCancel: () => void; onSubmit: (note: string) => void }) {
  const ids = useId();
  const [note, setNote] = useState("");
  const { btn, primary } = classes(place);
  return (
    <form
      className={`qs-composer qs-composer--${place}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (required && !note.trim()) return;
        onSubmit(note.trim());
      }}
    >
      <label className="qs-composer-lbl" htmlFor={`${ids}-note`}>{label}</label>
      <textarea id={`${ids}-note`} className="qs-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} required={required} autoFocus />
      {error && <p className="qs-error" role="alert">{error}</p>}
      <div className="qs-composer-row">
        <button type="button" className={btn} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className={primary} disabled={busy || (required && !note.trim())}>{busy ? busyLabel : submit}</button>
      </div>
    </form>
  );
}

/** Accept and Decline on an optional bounty, and the one quiet line under the moves. */
export function JoinMoves({ card, actions, place, now }: { card: QuestCard; actions: QuestActions | null; place: Place; now: string }) {
  const [declining, setDeclining] = useState(false);
  const { busy, error, run } = useMove(() => setDeclining(false));
  const hint = movesHint(card, now);
  const giver = card.giver.name;
  const { btn, primary } = classes(place);
  if (!card.isMine) return null;
  if (declining && actions) {
    const heads = calledHeads(card, now);
    return (
      <NoteForm place={place} label={`A note to ${giver}, if you like`} placeholder="Optional" required={false} submit="Decline" busyLabel="Declining…" busy={busy} error={error} onCancel={() => setDeclining(false)}
        onSubmit={(note) => void run(async () => {
          for (const h of heads) {
            const r = await actions.handBack(card.id, h.id, note);
            if (!r.ok) return r;
          }
          return { ok: true };
        }, "Declined.")}
      />
    );
  }
  const join = canAccept(card, now);
  if (!join && !hint) return null;
  return (
    <div className="qs-moves">
      {join && (
        <button type="button" className={primary} onClick={() => actions && void run(() => actions.acceptQuest(card.id), "Accepted. We'll remind you before it closes.")} disabled={!actions || busy}>
          Accept
        </button>
      )}
      {canDecline(card, now) && (
        <button type="button" className={btn} onClick={() => setDeclining(true)} disabled={!actions || busy}>
          Decline
        </button>
      )}
      {hint && <p className="qs-said qs-hint">{hint}</p>}
      {error && <p className="qs-error" role="alert">{error}</p>}
    </div>
  );
}

/** The reader's moves on one head: Turn in, Hand back, or what they already said. */
export function QuestMoves({ card, head, actions, place, now }: { card: QuestCard; head: HeadCard; actions: QuestActions | null; place: Place; now: string }) {
  // The game's words or the plain view's, by the reader's game style (QS.11).
  const words = questWords(useGameStyle());
  const ids = useId();
  const [mode, setMode] = useState<null | "turnin" | "handback">(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const { busy, error, run } = useMove(() => setMode(null));
  const mine = head.mine;
  if (!mine) return null;
  const giver = card.giver.name;
  const { btn, primary } = classes(place);

  if (mode === "handback" && actions) {
    return (
      <NoteForm place={place} label={`A note to ${giver}`} placeholder="Why this one isn't for you" required submit="Hand back" busyLabel="Handing back…" busy={busy} error={error} onCancel={() => setMode(null)}
        onSubmit={(note) => void run(() => actions.handBack(card.id, head.id, note), `Handed back. ${giver} has your note.`)}
      />
    );
  }

  if (mode === "turnin") {
    return (
      <form
        className={`qs-composer qs-composer--${place}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!actions || !text.trim()) return;
          void run(() => actions.turnIn(card.id, head.id, { text: text.trim(), url: url.trim() || undefined, }), words.turnedInToast);
        }}
      >
        <label className="qs-composer-lbl" htmlFor={`${ids}-text`}>Your turn-in</label>
        <textarea id={`${ids}-text`} data-move={place === "arena" ? "turn-in" : undefined} className="qs-field" value={text} onChange={(e) => setText(e.target.value)} placeholder={head.ask} required autoFocus />
        <label className="qs-composer-lbl" htmlFor={`${ids}-url`}>A link, if the ask wants one</label>
        <input id={`${ids}-url`} className="qs-field" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        {error && <p className="qs-error" role="alert">{error}</p>}
        <div className="qs-composer-row">
          <button type="button" className={btn} onClick={() => setMode(null)} disabled={busy}>Cancel</button>
          <button type="submit" className={primary} disabled={!actions || busy || !text.trim()}>{busy ? "Turning in…" : "Turn in"}</button>
        </div>
      </form>
    );
  }

  if (mine.standing === "turned_in") {
    return (
      <p className="qs-said">
        <b className="qs-said-strong">{words.turnedIn}</b> {giver} will see it.{mine.late ? " It came in late, and it counts in full." : ""}
      </p>
    );
  }

  const turn = canTurnIn(card, head, now);
  const back = canHandBack(card, head, now);
  if (mine.standing === "handed_back" && !turn) {
    return (
      <p className="qs-said">
        <b>Handed back.</b> {giver} has your note.
      </p>
    );
  }
  if (!turn && !back) return null;
  return (
    <div className="qs-moves">
      {mine.standing === "missed" && <p className="qs-said">It got away before you turned in. A late turn-in still lands.</p>}
      {turn && (
        // The boss's Turn in is the move Your next move focuses (QS.13).
        <button type="button" className={primary} onClick={() => setMode("turnin")} disabled={!actions} data-move={place === "arena" ? "turn-in" : undefined}>
          <Glyph name="check" /> Turn in
        </button>
      )}
      {back && (
        <button type="button" className={btn} onClick={() => setMode("handback")} disabled={!actions}>
          Hand back
        </button>
      )}
    </div>
  );
}
