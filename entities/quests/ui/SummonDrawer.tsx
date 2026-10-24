"use client";

// Summon a quest (QS.1; spec stories 1, 2, 4, 59, and "Heads"): the drawer
// that posts a Bounty. The Giver names it, may add an opening note, says
// whether it is a learning bounty, calls the Party (staff only: the `party`
// prop is the read model's staff list, so a client contact is never in it),
// and writes its heads, each an ask with its own due time. The preview grows
// the monster with the Party called, and from two heads it is a Hydra; it also
// says whether the bounty will be required (a manager or admin summoning) or
// optional. Every refusal the action makes is made here first.
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

const KINDS = [
  { key: "bounty", label: "Bounty", sub: "a slime to hit", soon: false },
  { key: "raid", label: "Raid", sub: "soon", soon: true },
  { key: "beacon", label: "Beacon", sub: "soon", soon: true },
] as const;

export function SummonDrawer({ open, onClose, party, me, now, actions, summonerIsManager }: { open: boolean; onClose: () => void; party: Portrait[]; me: Portrait; now: string; actions: QuestActions | null; summonerIsManager: boolean }) {
  const router = useRouter();
  const ids = useId();
  const today = businessDate(now);
  const callable = party.filter((p) => p.personId !== me.personId);
  const [title, setTitle] = useState("");
  const [ask, setAsk] = useState("");
  const [learning, setLearning] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [heads, setHeads] = useState<HeadDraft[]>(() => [firstHead(today)]);
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
    router.refresh();
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
          <button type="button" className="admin-btn" onClick={onClose}>Cancel</button>
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
