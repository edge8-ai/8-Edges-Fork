"use client";

// The profile's game screen (LD.10, approved on the design canvas on 28 Oct
// 2026; LD.6's hero before it): the player card, the ranked ladders, the
// showcase and the stats on one dark ground, and on the owner's own page the
// Customise button that turns it into its editor, with the game style switch
// beside it.
//
// The ground is still: no scene art, no backdrop blur and no motion, and every
// block has its size before its data arrives. LD.6's hero drew an SVG scene
// under blurred buttons and moved its plaque at phone width; Khoa found it
// laggy and jumpy on 28 Oct.
//
// Every choice saves as it is made and shows at once: the Title, the stats and
// the showcase through setDisplay, each emblem through its own wear switch. A
// save that fails flips the choice back and says so, because a page that shows
// a choice it did not keep would be a quiet lie. A teammate's page passes no
// editor and nothing here is a control.
import { useState, useTransition, type ReactNode } from "react";
import type { Result } from "@/kernel/data/result";
import type { MayProp } from "@/kernel/identity/may-prop";
import { STAT_KEYS, type DisplayChange, type StatKey } from "../../lib/display-choices";
import { addable, titleChoice, titleFor, titleOptions, titleValue, withAdded, withRemoved } from "./case-choices";
import { CaseShelf, StatsStrip } from "./HeroParts";
import { PlayerCard, Ranks, type Worn } from "./PlayerCard";
import type { ProfileDress } from "./profile-model";

/**
 * What the owner's page hands the hero: their own ladders.mine, which shows
 * the controls, and the reader's own commands, each guarded where it lives
 * (the Quests page hands QuestsView its actions the same way). The wear
 * switches save through setWear themselves.
 */
export type Editor = {
  may: MayProp;
  actions: {
    setDisplay: (change: DisplayChange) => Promise<Result>;
    setGameStyle: (on: boolean) => Promise<Result>;
  };
};

function Pencil() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  );
}

/** `styleSwitch` is the game style switch, which the page shell holds because turning it off changes the whole page. */
export function ProfileHero({ dress, editor, styleSwitch }: { dress: ProfileDress; editor: Editor | null; styleSwitch?: ReactNode }) {
  const own = Boolean(editor?.may["ladders.mine"]);
  const [shown, setShown] = useState<StatKey[]>(() => dress.stats.filter((s) => s.shown).map((s) => s.key));
  const [worn, setWorn] = useState<Worn>({ learnShare: dress.emblems.learnShare?.worn ?? false, builder: dress.emblems.builder?.worn ?? false });
  const [titleBadge, setTitleBadge] = useState<string | null>(dress.titleBadge);
  const [caseIds, setCaseIds] = useState<string[]>(() => dress.displayCase.map((b) => b.id));
  // The Achievements tab changes the case too (LD.7b), and its save draws the
  // page again with the case it kept: the hero takes that case when it
  // arrives, the way React's docs adjust state to a changed prop, so the shelf
  // and the tab never show two cases.
  const savedCase = dress.displayCase.map((b) => b.id).join("|");
  const [seenCase, setSeenCase] = useState(savedCase);
  if (savedCase !== seenCase) {
    setSeenCase(savedCase);
    setCaseIds(dress.displayCase.map((b) => b.id));
  }
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  /** The choice is already shown; save it behind, and undo it with the reason if the save fails. */
  const save = (change: DisplayChange, undo: () => void) => {
    if (!editor) return;
    setError(null);
    start(async () => {
      const saved = await editor.actions.setDisplay(change);
      if (!saved.ok) {
        undo();
        setError(saved.error);
      }
    });
  };
  const flipStat = (key: StatKey) => {
    const before = shown;
    // Kept in the strip's order, whatever order they were switched on in.
    const next = STAT_KEYS.filter((k) => (k === key ? !before.includes(k) : before.includes(k)));
    setShown(next);
    save({ shownStats: next }, () => setShown(before));
  };
  const pickTitle = (value: string) => {
    const before = titleBadge;
    const next = titleChoice(value);
    setTitleBadge(next);
    save({ titleBadge: next }, () => setTitleBadge(before));
  };
  const changeCase = (next: string[]) => {
    const before = caseIds;
    setCaseIds(next);
    save({ displayCase: next }, () => setCaseIds(before));
  };

  const found = dress.found;
  // The owner's Title follows the select; a teammate's is the one the server named.
  const title = found.length > 0 ? titleFor(found, titleBadge) : dress.title;
  const named = new Map([...dress.displayCase, ...found].map((b) => [b.id, b.name]));
  const shelf = caseIds.map((id) => ({ id, name: named.get(id) ?? id, art: dress.art[id] }));
  return (
    <div className={`pf-hero-wrap${editing ? " pf-hero--editing" : ""}`}>
      <div className="pf-top">
        <span className="pf-crumb">{own ? "Me · Profile" : "Profile"}</span>
        <span className="pf-top-sp" />
        {own ? styleSwitch : null}
        {own ? (
          <button type="button" className={`pf-btn${editing ? " pf-btn--on" : ""}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>
            <Pencil />
            {editing ? "Done" : "Customise"}
          </button>
        ) : null}
        {error ? (
          <p className="pf-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="pf-hero">
        <PlayerCard
          dress={dress}
          worn={worn}
          title={title}
          editing={own && editing}
          titleEdit={own ? { options: titleOptions(found), value: titleValue(found, titleBadge), onChange: pickTitle } : undefined}
        />
        <div className="pf-main">
          <Ranks
            dress={dress}
            worn={worn}
            editing={own && editing}
            may={editor?.may ?? {}}
            onWorn={{ learnShare: (on) => setWorn((w) => ({ ...w, learnShare: on })), builder: (on) => setWorn((w) => ({ ...w, builder: on })) }}
          />
          <CaseShelf
            badges={shelf}
            editing={own && editing}
            own={own}
            edit={own ? { addable: addable(found, caseIds), onAdd: (id) => changeCase(withAdded(caseIds, id)), onRemove: (id) => changeCase(withRemoved(caseIds, id)) } : undefined}
          />
          <StatsStrip stats={dress.stats} shown={shown} editing={own && editing} onFlip={own ? flipStat : undefined} />
        </div>
      </div>
    </div>
  );
}
