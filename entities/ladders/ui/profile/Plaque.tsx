// The plaque (LD.6; glossary "Plaque"; the approved v5 prototype's
// .wp-plaque): the face with its worn border, the name, the handle, the Title
// and the two emblems side by side, each shown or a dash. A hidden emblem looks
// exactly like no tier (spec story 56), so the dash says nothing either way.
//
// The emblems show the tier alone: no division, no star, no point, on the
// owner's own plaque as on a teammate's, because the plaque is what teammates
// see. In Customise each emblem carries its Show switch, which IS the LD.4
// wear switch (WearSwitch), so wearing a tier happens in one place. With the
// viewer's game style off there is no art: the face has no border and each
// emblem is its tier's word.
import type { ReactNode } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { Avatar } from "@/kernel/ui/Avatar";
import { tierName, type BuilderTier, type LearnShareTier } from "../../lib/points";
import { Border, Emblem } from "../Emblem";
import { WearSwitch } from "../WearSwitch";
import type { TitleOption } from "./case-choices";
import type { ProfileDress } from "./profile-model";

const FACE = 112;

export type Worn = { learnShare: boolean; builder: boolean };

type EmblemSlotProps = {
  ladderWords: string;
  art: ReactNode;
  word: string | null;
  gameOn: boolean;
  control: ReactNode;
};

function EmblemSlot({ ladderWords, art, word, gameOn, control }: EmblemSlotProps) {
  return (
    <div className="pf-em">
      <div className="pf-em-art">
        {word === null ? (
          <span className="pf-em-dash" aria-hidden="true">
            —
          </span>
        ) : gameOn ? (
          art
        ) : null}
      </div>
      {word === null ? <b aria-label={`No ${ladderWords} emblem shown`}>—</b> : <b>{word}</b>}
      <small>{ladderWords}</small>
      {control}
    </div>
  );
}

/** Customise's Title select: one Title per found family, and the one worn ("" for No title). */
type TitleEdit = { options: TitleOption[]; value: string; onChange: (value: string) => void };

/**
 * The Title select in Customise. With nothing found yet there is no Title to
 * offer, so it stays disabled and says where Titles come from.
 */
function TitleSelect({ edit }: { edit?: TitleEdit }) {
  const options = edit?.options ?? [];
  if (options.length === 0) {
    return (
      <div className="pf-title-edit">
        <select className="pf-title-sel" aria-label="Title" aria-describedby="pf-title-hint" disabled value="">
          <option value="">—</option>
        </select>
        <p className="pf-hint" id="pf-title-hint">
          Titles come with badges
        </p>
      </div>
    );
  }
  return (
    <div className="pf-title-edit">
      <select className="pf-title-sel" aria-label="Title" value={edit?.value ?? ""} onChange={(e) => edit?.onChange(e.target.value)}>
        <option value="">No title</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Plaque({
  dress,
  gameOn,
  worn,
  title,
  editing,
  titleEdit,
  may,
  onWorn,
}: {
  dress: ProfileDress;
  gameOn: boolean;
  worn: Worn;
  /** The Title shown under the name, as the hero holds it now. */
  title: string | null;
  /** Customise is on: the Title select and the Show switches. Only the owner's page passes it. */
  editing: boolean;
  titleEdit?: TitleEdit;
  may: MayProp;
  onWorn: { learnShare: (on: boolean) => void; builder: (on: boolean) => void };
}) {
  const { person } = dress;
  const ls = dress.emblems.learnShare && worn.learnShare ? (dress.emblems.learnShare.tier as LearnShareTier) : null;
  const b = dress.emblems.builder && worn.builder ? (dress.emblems.builder.tier as BuilderTier) : null;
  const face = <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size={FACE} />;
  return (
    <section className="pf-plaque" aria-labelledby="pf-name">
      <div className="pf-av">
        {gameOn && ls ? (
          <Border tier={ls} size={FACE}>
            {face}
          </Border>
        ) : (
          face
        )}
      </div>
      <h1 className="pf-name" id="pf-name">
        {person.name}
      </h1>
      {person.handle ? <p className="pf-handle">@{person.handle}</p> : null}
      {editing ? <TitleSelect edit={titleEdit} /> : title ? <p className="pf-title">{title}</p> : null}
      <div className="pf-ems">
        <EmblemSlot
          ladderWords="Learn & Share"
          art={ls ? <Emblem ladder="learn_share" tier={ls} size={112} /> : null}
          word={ls ? tierName(ls) : null}
          gameOn={gameOn}
          control={editing && dress.emblems.learnShare ? <WearSwitch ladder="learn_share" worn={worn.learnShare} may={may} onWorn={onWorn.learnShare} /> : null}
        />
        <EmblemSlot
          ladderWords="Builder"
          art={b ? <Emblem ladder="builder" tier={b} size={128} /> : null}
          word={b ? tierName(b) : null}
          gameOn={gameOn}
          control={editing && dress.emblems.builder ? <WearSwitch ladder="builder" worn={worn.builder} may={may} onWorn={onWorn.builder} /> : null}
        />
      </div>
    </section>
  );
}
