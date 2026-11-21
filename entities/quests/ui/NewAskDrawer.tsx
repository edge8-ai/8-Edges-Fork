"use client";

// The New ask drawer (AK.3, ADR 0036; spec 2026-11-16, "New ask"; the approved
// prototype's drawer): three fields, What are you asking, Who (Everyone, or
// people by name) and Answer by, and Send ask, which posts through the existing
// summon action with one head and learning off. A manager or an admin also sees
// "Everyone asked should answer", ticked; unticking it posts an optional ask.
// Nobody else has the box, and the action alone decides what is required.
//
// An ask the assistant drafted opens the same drawer filled in, with a banner
// that quotes the person's own words and says nothing is sent until they press
// Send ask; its footer offers Discard draft in place of Cancel. Sending or
// discarding takes the draft out of the address, so a reload does not bring it
// back. Every refusal the action makes is made here first, in the drawer.
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { businessDate } from "@/kernel/config/dates";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { showToast } from "@/kernel/ui/Toast";
import type { BountyDraft } from "../lib/bounty-draft";
import type { Portrait } from "../lib/party-picker";
import { askFormFromDraft, askRefusal, askToSummon, blankAskForm, matchPeople } from "./ask-form";
import type { QuestActions } from "./actions-type";
import { ASKS_HREF } from "./team-nav";

export type NewAskActions = Pick<QuestActions, "summonBounty">;

export function NewAskDrawer({
  open,
  onClose,
  party,
  me,
  now,
  actions,
  mayChooseRequired,
  draft = null,
  onDraftDone,
}: {
  open: boolean;
  onClose: () => void;
  /** Everyone on the team now: the staff list, never a client contact. */
  party: Portrait[];
  me: Portrait;
  now: string;
  actions: NewAskActions;
  /** A manager or an admin: they see "Everyone asked should answer". */
  mayChooseRequired: boolean;
  /** An ask the assistant drafted: every field starts filled in from it. */
  draft?: BountyDraft | null;
  /** Called once the draft is discarded or sent, so the page lets it go. */
  onDraftDone?: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const today = businessDate(now);
  const [form, setForm] = useState(() => (draft ? askFormFromDraft(draft, party, me.personId, today) : blankAskForm(today)));
  const [search, setSearch] = useState("");
  const [shouldAnswer, setShouldAnswer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(draft !== null);

  const refusal = askRefusal(form, Date.parse(now));
  const found = matchPeople(party, search, form.picked, me.personId);
  const chosen = party.filter((p) => form.picked.has(p.personId));
  const required = mayChooseRequired && shouldAnswer;

  const change = (patch: Partial<typeof form>) => {
    setTouched(true);
    setForm((was) => ({ ...was, ...patch }));
  };
  const pick = (personId: string) => {
    setSearch("");
    change({ picked: new Set([...form.picked, personId]) });
  };
  const unpick = (personId: string) => change({ picked: new Set([...form.picked].filter((id) => id !== personId)) });

  async function send() {
    if (refusal) return;
    setBusy(true);
    setError(null);
    const input = askToSummon(form, party, me.personId, mayChooseRequired ? shouldAnswer : null);
    const result = await actions.summonBounty(input);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    const n = input.partyPersonIds.length;
    onClose();
    showToast({ message: `Asked ${n} ${n === 1 ? "person" : "people"}.` });
    if (draft) {
      // The page is read again without the draft in its address.
      onDraftDone?.();
      router.replace(ASKS_HREF, { scroll: false });
    } else {
      router.refresh();
    }
  }

  function discardDraft() {
    onDraftDone?.();
    onClose();
    router.replace(ASKS_HREF, { scroll: false });
  }

  const formId = `${ids}-form`;
  const shown = error ?? (touched ? refusal : null);
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="New ask"
      className="ak-drawer"
      footer={
        <div className="ak-drawer-foot">
          {shown && (
            <p className={error ? "ak-drawer-error" : "ak-quiet"} role={error ? "alert" : undefined}>
              {shown}
            </p>
          )}
          {draft ? (
            <button type="button" className="admin-btn" onClick={discardDraft}>
              Discard draft
            </button>
          ) : (
            <button type="button" className="admin-btn" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="submit" form={formId} className="admin-btn admin-btn--primary" disabled={busy || !!refusal}>
            {busy ? "Sending…" : "Send ask"}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        className="ak-drawer-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {draft && (
          <div className="ak-draft-note" role="note">
            <b>Drafted by Claude</b>
            {draft.from && <span>{`From your ask: “${draft.from}”.`}</span>}
            <small>Nothing is sent until you press Send ask. Change anything first.</small>
          </div>
        )}
        <div className="ak-fld">
          <label htmlFor={`${ids}-what`}>What are you asking?</label>
          <textarea
            id={`${ids}-what`}
            className="admin-textarea"
            rows={3}
            value={form.text}
            maxLength={2000}
            placeholder="Watch the launch video and share one takeaway"
            onChange={(e) => change({ text: e.target.value })}
          />
        </div>

        <fieldset className="ak-fld ak-who">
          <legend>Who</legend>
          <div className="ak-who-pick">
            <button type="button" className="admin-btn" aria-pressed={form.everyone} onClick={() => change({ everyone: true })}>
              Everyone
            </button>
            <button type="button" className="admin-btn" aria-pressed={!form.everyone} onClick={() => change({ everyone: false })}>
              Pick people
            </button>
          </div>
          {!form.everyone && (
            <>
              {chosen.length > 0 && (
                <ul className="ak-chips" aria-label="People you are asking">
                  {chosen.map((p) => (
                    <li key={p.personId}>
                      <button type="button" className="ak-chip" aria-label={`Remove ${p.name}`} onClick={() => unpick(p.personId)}>
                        {p.name}
                        <span aria-hidden="true"> ×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                className="admin-input"
                type="text"
                value={search}
                placeholder="Type a name"
                aria-label="People to ask"
                autoComplete="off"
                onChange={(e) => setSearch(e.target.value)}
              />
              {found.length > 0 && (
                <ul className="ak-found" aria-label="Matching people">
                  {found.map((p) => (
                    <li key={p.personId}>
                      <button type="button" className="ak-found-btn" onClick={() => pick(p.personId)}>
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {search.trim() !== "" && found.length === 0 && <p className="ak-quiet">Nobody on the team matches that.</p>}
            </>
          )}
        </fieldset>

        <div className="ak-fld">
          <label htmlFor={`${ids}-due`}>Answer by</label>
          <input id={`${ids}-due`} className="admin-input" type="date" value={form.date} min={today} onChange={(e) => change({ date: e.target.value })} />
        </div>

        {mayChooseRequired && (
          <label className="ak-check">
            <input type="checkbox" checked={shouldAnswer} onChange={(e) => setShouldAnswer(e.target.checked)} />
            <span>
              <b>Everyone asked should answer</b>
              <small>Untick to post it as open to anyone.</small>
            </span>
          </label>
        )}

        <p className="ak-drawer-note">
          {required
            ? "They get it in their Inbox and one Lark message, between 09:00 and 18:00 on weekdays. One private reminder the day before it's due. Nobody else sees who hasn't answered."
            : "They get it in their Inbox and one Lark message, between 09:00 and 18:00 on weekdays. Nobody is expected to answer, and there is no reminder."}
        </p>
      </form>
    </DetailDrawer>
  );
}
