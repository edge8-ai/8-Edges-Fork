// The player card and the rank cards (LD.10, approved on the design canvas on
// 28 Oct 2026; the plaque of LD.6 before it). The player card is the face
// teammates see: the photo, the name, the handle, the Title, the Builder medal
// when it is shown, and the role, team and start the team entity hands in. The
// rank cards are the two ladders.
//
// What a rank card says depends on whose page it is. On the owner's own page
// it holds everything about them: the tier with its division or stars, the
// points, the bar to the next tier, and whether teammates see it; in
// Customise it carries the Show switch, which IS the LD.4 wear switch
// (WearSwitch), so wearing a tier happens in one place. On a teammate's page a
// card is the tier alone, and only for a ladder its owner shows: no division,
// no star and no point ever reach it (spec "The two ladders").
import type { ReactNode } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { Avatar } from "@/kernel/ui/Avatar";
import { LADDER_WORDS, tierName, type BuilderTier, type Ladder, type LearnShareTier } from "../../lib/points";
import { Emblem } from "../Emblem";
import { WearSwitch } from "../WearSwitch";
import type { TitleOption } from "./case-choices";
import type { ProfileDress, RankDetail } from "./profile-model";

export type Worn = { learnShare: boolean; builder: boolean };

const n = (v: number) => v.toLocaleString("en-US");

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

export function PlayerCard({
  dress,
  worn,
  title,
  editing,
  titleEdit,
}: {
  dress: ProfileDress;
  worn: Worn;
  /** The Title shown under the name, as the hero holds it now. */
  title: string | null;
  /** Customise is on: the Title select. Only the owner's page passes it. */
  editing: boolean;
  titleEdit?: TitleEdit;
}) {
  const { person } = dress;
  // The card is what teammates see, so the medal on it is the worn one only.
  const medal = dress.emblems.builder && worn.builder ? (dress.emblems.builder.tier as BuilderTier) : null;
  return (
    <section className="pf-card" aria-labelledby="pf-name">
      <div className="pf-card-photo">
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the person's own uploaded portrait, of unknown size, cropped to the card
          <img className="pf-card-img" src={person.photoUrl} alt="" width={340} height={250} />
        ) : (
          <span className="pf-card-face">
            <Avatar name={person.name} initials={person.initials} size={120} />
          </span>
        )}
        {medal ? (
          <span className="pf-card-medal">
            <Emblem ladder="builder" tier={medal} size={76} label={`Builder: ${tierName(medal)}`} />
          </span>
        ) : null}
      </div>
      <div className="pf-card-body">
        <h1 className="pf-name" id="pf-name">
          {person.name}
        </h1>
        {person.handle ? <p className="pf-handle">@{person.handle}</p> : null}
        {editing ? <TitleSelect edit={titleEdit} /> : title ? <p className="pf-title">{title}</p> : null}
        {person.facts && person.facts.length > 0 ? (
          <dl className="pf-facts">
            {person.facts.map((f) => (
              <div key={f.label} className="pf-fact">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {open ? (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <path d="M3 3l18 18 M10.6 5.1A10.8 10.8 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4 M6.1 6.1C3 8.2 1 12 1 12s4 7 11 7a10.6 10.6 0 0 0 5.9-1.8" />
      )}
    </svg>
  );
}

function emblemOf(ladder: Ladder, tier: string, size: number, label?: string): ReactNode {
  return ladder === "learn_share" ? <Emblem ladder="learn_share" tier={tier as LearnShareTier} size={size} label={label} /> : <Emblem ladder="builder" tier={tier as BuilderTier} size={size} label={label} />;
}

type RankCardProps = {
  ladder: Ladder;
  tier: string;
  /** The owner's own place; absent on a teammate's page. */
  detail?: RankDetail;
  /** The owner's page only: whether teammates see this tier, and the Show switch in Customise. */
  visibility?: { worn: boolean; control: ReactNode };
};

function RankCard({ ladder, tier, detail, visibility }: RankCardProps) {
  const name = tierName(tier as LearnShareTier | BuilderTier);
  return (
    <article className={`pf-rank pf-rank--${ladder}`} aria-labelledby={`pf-rank-${ladder}`}>
      <div className="pf-rank-top">
        <span className="pf-rank-art">{emblemOf(ladder, tier, ladder === "learn_share" ? 91 : 104, detail?.words ?? name)}</span>
        <div className="pf-rank-txt">
          <span className="pf-rank-l">{LADDER_WORDS[ladder]}</span>
          {/* A Builder tier's stars go on a line of their own, so "Legend ★★★★★" never breaks between them. */}
          <h3 className="pf-rank-t" id={`pf-rank-${ladder}`} aria-label={detail?.words ?? name}>
            {detail?.stars ? name : (detail?.words ?? name)}
          </h3>
          {detail?.stars ? (
            <span className="pf-rank-stars" aria-hidden="true">
              {"★".repeat(detail.stars)}
            </span>
          ) : null}
          {detail ? (
            <span className="pf-rank-p">
              <b>{n(detail.points)}</b> points
            </span>
          ) : null}
        </div>
      </div>
      {detail ? (
        <div className="pf-rank-climb">
          <progress className="pf-rank-bar" max={100} value={detail.pct} aria-label={detail.next ? `Towards ${detail.next.tierName}` : `${name}, the top of the ladder`}>
            {detail.pct}%
          </progress>
          <div className="pf-rank-next">
            <span>
              {detail.next ? (
                <>
                  <b>{n(detail.next.toGo)}</b> to {detail.next.tierName} at {n(detail.next.start)}
                </>
              ) : (
                "The top of the ladder. Points keep counting."
              )}
            </span>
            {detail.next ? <span className="pf-rank-next-art">{emblemOf(ladder, detail.next.tier, 30, `Next: ${detail.next.tierName}`)}</span> : null}
          </div>
        </div>
      ) : null}
      {visibility ? (
        <div className="pf-rank-vis">
          <span className={`pf-chip${visibility.worn ? " pf-chip--on" : ""}`}>
            <EyeIcon open={visibility.worn} />
            {visibility.worn ? "Teammates see this" : "Hidden from teammates"}
          </span>
          {visibility.control}
        </div>
      ) : null}
    </article>
  );
}

/**
 * The two ladders. The owner's dress carries their ranks, so both cards show
 * in full, each saying whether teammates see it; a teammate's shows a card only
 * for a ladder its owner wears, and nothing at all when they wear neither.
 */
export function Ranks({
  dress,
  worn,
  editing,
  may,
  onWorn,
}: {
  dress: ProfileDress;
  worn: Worn;
  editing: boolean;
  may: MayProp;
  onWorn: { learnShare: (on: boolean) => void; builder: (on: boolean) => void };
}) {
  const { emblems, ranks } = dress;
  if (ranks) {
    return (
      <section className="pf-sec" aria-labelledby="pf-ranks-h">
        <div className="pf-sec-head">
          <h2 className="pf-sec-h" id="pf-ranks-h">
            Ranked ladders
          </h2>
          <span className="pf-sec-note">Your tier only ever goes up. Nothing resets.</span>
        </div>
        <div className="pf-ranks">
          {emblems.builder ? (
            <RankCard
              ladder="builder"
              tier={emblems.builder.tier}
              detail={ranks.builder}
              visibility={{ worn: worn.builder, control: editing ? <WearSwitch ladder="builder" worn={worn.builder} may={may} onWorn={onWorn.builder} /> : null }}
            />
          ) : null}
          {emblems.learnShare ? (
            <RankCard
              ladder="learn_share"
              tier={emblems.learnShare.tier}
              detail={ranks.learnShare}
              visibility={{ worn: worn.learnShare, control: editing ? <WearSwitch ladder="learn_share" worn={worn.learnShare} may={may} onWorn={onWorn.learnShare} /> : null }}
            />
          ) : null}
        </div>
      </section>
    );
  }
  if (!emblems.builder && !emblems.learnShare) return null;
  return (
    <section className="pf-sec" aria-labelledby="pf-ranks-h">
      <div className="pf-sec-head">
        <h2 className="pf-sec-h" id="pf-ranks-h">
          Ranks
        </h2>
      </div>
      <div className="pf-ranks">
        {emblems.builder ? <RankCard ladder="builder" tier={emblems.builder.tier} /> : null}
        {emblems.learnShare ? <RankCard ladder="learn_share" tier={emblems.learnShare.tier} /> : null}
      </div>
    </section>
  );
}
