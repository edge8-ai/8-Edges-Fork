"use client";

// Summon a quest (QS.1; spec stories 1, 2, 4, 59, and "Heads"): the drawer
// that posts a Bounty. The Giver names it, may add an opening note, says
// whether it is a learning bounty, calls the Party (staff only: the `party`
// prop is the read model's staff list, so a client contact is never in it),
// and writes its heads, each an ask with its own due time. The preview grows
// the monster with the Party called, and from two heads it is a Hydra; it also
// says whether the bounty will be required (a manager or admin summoning) or
// optional. Every refusal the action makes is made here first.
//
// A Bounty Claude drafted (QS.9; the approved prototype's Draft board) opens
// the drawer with every field filled in and a banner that says so, quotes the
// person's own words, and says nobody is called until they press Summon. Its
// footer offers Discard draft in place of Cancel. Summon is the same action
// with the same guard as ever; the draft only fills the fields. Discarding or
// summoning takes the draft out of the address, so a reload does not bring it
// back.
import { useRouter } from "next/navigation";
import { saigonInstant } from "@/kernel/config/dates";
import { useId, useState } from "react";
import { businessDate } from "@/kernel/config/dates";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { showToast } from "@/kernel/ui/Toast";
import type { QuestActions } from "./actions-type";
import { Glyph, MonsterArt } from "./art";
import { Face } from "./Face";
import { monsterPreview, summonRule } from "./quests-model";
import { useGameStyle } from "./game-style";
import { questWords } from "./plain-model";
import { firstHead, type HeadDraft, headsRefusal, SummonHeads } from "./SummonHeads";
import type { Portrait } from "../lib/quests-read";
import { QUESTS_PATH, type BountyDraft } from "../lib/bounty-draft";

const KINDS = [
  { key: "bounty", label: "Bounty", sub: "a slime to hit", soon: false },
  { key: "raid", label: "Raid", sub: "soon", soon: true },
  { key: "beacon", label: "Beacon", sub: "soon", soon: true },
] as const;

/** The drawer's heads from a draft's, a blank due date or time taking the drawer's default. */
function headsFrom(draft: BountyDraft, today: string): HeadDraft[] {
  const blank = firstHead(today);
  if (draft.heads.length === 0) return [blank];
  return draft.heads.map((h, i) => ({ key: i, ask: h.ask, date: h.date || blank.date, time: h.time || blank.time }));
}

export function SummonDrawer({
  open,
  onClose,
  party,
  me,
  now,
  actions,
  summonerIsManager,
  draft = null,
  onDraftDone,
}: {
  open: boolean;
  onClose: () => void;
  party: Portrait[];
  me: Portrait;
  now: string;
  actions: QuestActions | null;
  summonerIsManager: boolean;
  /** A Bounty Claude drafted (QS.9): every field starts filled in from it. */
  draft?: BountyDraft | null;
  /** Called once the draft is discarded or summoned, so the page lets it go. */
  onDraftDone?: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const today = businessDate(now);
  const callable = party.filter((p) => p.personId !== me.personId);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [ask, setAsk] = useState(draft?.note ?? "");
  const [learning, setLearning] = useState(draft?.learning ?? true);
  // A drafted party keeps only the people this drawer may call.
  const [picked, setPicked] = useState<Set<string>>(() => new Set((draft?.partyPersonIds ?? []).filter((id) => callable.some((p) => p.personId === id))));
  const [heads, setHeads] = useState<HeadDraft[]>(() => (draft ? headsFrom(draft, today) : [firstHead(today)]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const everyone = callable.length > 0 && callable.every((p) => picked.has(p.personId));
  const preview = monsterPreview(picked.size, heads.length);
  // With the game style off (QS.11) the drawer posts a quest: no monster and no game words.
  const game = useGameStyle();
  const words = questWords(game);
  const refusal = !title.trim() ? "Name the bounty first." : picked.size === 0 ? (game ? "Call at least one person, or Everyone." : "Ask at least one person, or Everyone.") : headsRefusal(heads, Date.parse(now));
  const touched = title.trim() !== "" || picked.size > 0 || heads.some((h) => h.ask.trim() !== "");

  function toggle(personId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  async function summon() {
    if (!actions || refusal) return;
    setBusy(true);
    setError(null);
    const n = picked.size;
    const result = await actions.summonBounty({
      title: title.trim(),
      ask: ask.trim() || undefined,
      learning,
      partyPersonIds: [...picked],
      heads: heads.map((h) => ({ ask: h.ask.trim(), closesAt: saigonInstant(h.date, h.time) ?? "" })),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onClose();
    showToast({ message: `${words.posted} ${n} ${n === 1 ? "person" : "people"} ${words.asked}.` });
    if (draft) {
      // The page is read again without the draft in its address.
      onDraftDone?.();
      router.replace(QUESTS_PATH, { scroll: false });
    } else {
      router.refresh();
    }
  }

  function discardDraft() {
    onDraftDone?.();
    onClose();
    router.replace(QUESTS_PATH, { scroll: false });
  }

  const formId = `${ids}-form`;
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={words.postTitle}
      className="qs-drawer"
      footer={
        <div className="qs-drawer-foot">
          {(error ?? (touched ? refusal : null)) && (
            <p className={error ? "qs-error" : "qs-help"} role={error ? "alert" : undefined}>
              {error ?? refusal}
            </p>
          )}
          {draft ? (
            <button type="button" className="admin-btn" onClick={discardDraft}>Discard draft</button>
          ) : (
            <button type="button" className="admin-btn" onClick={onClose}>Cancel</button>
          )}
          <button type="submit" form={formId} className="admin-btn admin-btn--primary" disabled={!actions || busy || !!refusal}>
            {busy ? words.posting : words.post}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        className="qs-summon"
        onSubmit={(e) => {
          e.preventDefault();
          void summon();
        }}
      >
        {draft && (
          <div className="qs-draft-note" role="note">
            <b>Drafted by Claude</b>
            {draft.from && <span>{`From your ask: “${draft.from}”.`}</span>}
            <small>{`Nobody is ${words.asked} until you press ${words.post}. Change anything first.`}</small>
          </div>
        )}
        <div className="qs-fld">
          <span className="qs-lab">What kind</span>
          <div className="qs-typepick">
            {KINDS.map((k) => (
              <button key={k.key} type="button" aria-pressed={k.key === "bounty"} disabled={k.soon}>
                <span className={`qs-glyph qs-glyph--${k.key}`}>
                  <Glyph name={k.key} />
                </span>
                {k.label}
                <small>{k.key === "bounty" && !game ? "an ask with a date" : k.sub}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="qs-fld">
          <label htmlFor={`${ids}-title`}>Title</label>
          <input id={`${ids}-title`} className="qs-field" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two things before you go home this week" maxLength={200} />
        </div>
        <div className="qs-fld">
          <label htmlFor={`${ids}-ask`}>A note to the party (optional)</label>
          <textarea id={`${ids}-ask`} className="qs-field" value={ask} onChange={(e) => setAsk(e.target.value)} />
        </div>
        <label className="qs-check">
          <input type="checkbox" checked={learning} onChange={(e) => setLearning(e.target.checked)} />
          <span>
            <b>Learning bounty.</b> Turn-ins are worth sharing as learnings in Spark.
          </span>
        </label>
        <div className="qs-fld">
          <div className="qs-sel-row">
            <span className="qs-lab">{words.pick}</span>
            <button type="button" className="admin-btn admin-btn--sm" disabled={callable.length === 0} onClick={() => setPicked(everyone ? new Set() : new Set(callable.map((p) => p.personId)))}>
              {everyone ? "Clear" : "Everyone"}
            </button>
          </div>
          {callable.length > 0 ? (
            <div className="qs-people" role="group" aria-label="Party">
              {callable.map((p) => (
                <button key={p.personId} type="button" className="qs-pp" aria-pressed={picked.has(p.personId)} onClick={() => toggle(p.personId)}>
                  <Face who={p} size="sm" />
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="qs-help">{game ? "Nobody to call yet." : "Nobody to ask yet."}</p>
          )}
        </div>
        <SummonHeads ids={ids} heads={heads} today={today} onChange={setHeads} />
        {game ? (
          <div className="qs-preview-mon">
            <MonsterArt monster={preview.monster} learning={learning} />
            <span>
              You&apos;re summoning a <b>{preview.name}</b>
              {preview.line ? `: ${preview.line}` : ""}. {picked.size} called. {summonRule(summonerIsManager)}.
            </span>
          </div>
        ) : (
          <p className="qs-help">
            {picked.size} asked. {summonRule(summonerIsManager).replace("everyone called", "everyone asked")}.
          </p>
        )}
      </form>
    </DetailDrawer>
  );
}
