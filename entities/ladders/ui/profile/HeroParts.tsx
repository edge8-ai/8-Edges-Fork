// The banner, the display case and the stats strip of the profile's hero (LD.6;
// the approved v5 prototype's .wp-scene, .wp-right and .wp-stats). Drawn from
// values; the owner's Customise passes the handlers, a teammate's page passes
// none, and then nothing here is a control.
import { BANNERS, DISPLAY_CASE_HOLDS, type StatKey } from "../../lib/display-choices";
import type { Banner } from "../../lib/rows";
import type { FoundBadge } from "./case-choices";
import type { CaseBadge, ProfileStat } from "./profile-model";
import { statValue, statWords } from "./stat-words";
import { BANNER_WORDS, BannerScene, type Scene } from "./scenes";
import { BadgeGlyph } from "../badges/BadgeArt";

/** The banner behind the hero: the scene picked, or the person's own photo. Plain, with the game style off, unless it is the photo. */
export function Backdrop({ banner, photoUrl, gameOn, id }: { banner: Banner; photoUrl: string | null; gameOn: boolean; id: string }) {
  if (banner === "photo" && photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- the person's own uploaded portrait, of unknown size, cropped to the banner
    return <img className="pf-photo" src={photoUrl} alt="" />;
  }
  if (!gameOn) return null;
  // A photo banner with no photo to show falls back to the default scene.
  return <BannerScene scene={banner === "photo" ? "meadow" : (banner as Scene)} id={id} />;
}

/** The Banner picker in Customise: the four scenes and the person's photo, each a pressed-or-not button. */
export function BannerPicker({ banner, photoUrl, gameOn, onPick }: { banner: Banner; photoUrl: string | null; gameOn: boolean; onPick: (b: Banner) => void }) {
  return (
    <div className="pf-picker" role="group" aria-labelledby="pf-picker-h">
      <h2 className="pf-picker-h" id="pf-picker-h">
        Banner
      </h2>
      {BANNERS.map((b) => (
        <button key={b} type="button" className="pf-pick" aria-pressed={banner === b} disabled={b === "photo" && !photoUrl} onClick={() => onPick(b)}>
          {(b === "photo" ? photoUrl : gameOn) ? (
            <span className="pf-pick-th">
              <Backdrop banner={b} photoUrl={photoUrl} gameOn={gameOn} id={`pf-pick-${b}`} />
            </span>
          ) : null}
          <span className="pf-pick-l">{BANNER_WORDS[b]}</span>
        </button>
      ))}
      {!photoUrl ? <p className="pf-picker-note">Add a photo on your postcard to use it here.</p> : null}
    </div>
  );
}

/** What Customise does to the display case: add a found badge to the end, or take one out. */
type CaseEdit = { addable: FoundBadge[]; onAdd: (id: string) => void; onRemove: (id: string) => void };

/**
 * The display case on the hero: the badges chosen, in order, each its medal
 * (LD.7b) and its name. In Customise the five slots show: a filled
 * one carries the prototype's Show switch, which takes it out, and each empty
 * one an Add… select of the found badges not already in the case. With nothing
 * found yet the selects stay disabled and say why.
 */
export function CaseShelf({ badges, editing, own, edit }: { badges: CaseBadge[]; editing: boolean; own: boolean; edit?: CaseEdit }) {
  const empty = editing ? DISPLAY_CASE_HOLDS - badges.length : 0;
  const offered = edit?.addable ?? [];
  return (
    <div className="pf-right">
      <h2 className="pf-h">Display case</h2>
      {badges.length === 0 && !editing ? (
        <p className="pf-none">{own ? "Pick up to five badges in Customise." : "Nothing in the display case yet."}</p>
      ) : (
        <ul className="pf-case">
          {badges.map((badge) => (
            <li key={badge.id} className={badge.art ? `pf-tok bd--${badge.art.rarity}` : "pf-tok pf-tok--named"}>
              {badge.art ? (
                <span className="pf-tok-c bd-medal" aria-hidden="true">
                  <BadgeGlyph glyph={badge.art.glyph} size={30} />
                </span>
              ) : null}
              <b>{badge.name}</b>
              {editing && edit ? (
                <button type="button" className="yl-wear-sw pf-case-sw" role="switch" aria-checked="true" aria-label={`Show ${badge.name} in the display case`} onClick={() => edit.onRemove(badge.id)}>
                  <span className="yl-wear-track" aria-hidden="true" />
                  Show
                </button>
              ) : null}
            </li>
          ))}
          {Array.from({ length: empty }, (_, k) => (
            <li key={`empty-${k}`} className="pf-tok pf-tok--empty">
              <span className="pf-tok-c" aria-hidden="true">
                +
              </span>
              <select
                aria-label={`Add a badge to slot ${badges.length + k + 1}`}
                aria-describedby="pf-case-hint"
                disabled={!edit || offered.length === 0}
                value=""
                onChange={(e) => e.target.value && edit?.onAdd(e.target.value)}
              >
                <option value="">Add…</option>
                {offered.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <p className="pf-hint" id="pf-case-hint">
          {offered.length > 0 || badges.length > 0 ? "Up to five of the badges you found." : "Badges you find by doing go here, up to five. You have not found one yet."}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The stats strip. Outside Customise only the stats switched on show, and with
 * none on there is no strip at all; in Customise all six show, each with its
 * switch, the hidden ones dimmed.
 */
export function StatsStrip({ stats, shown, gameOn, editing, onFlip }: { stats: ProfileStat[]; shown: readonly StatKey[]; gameOn: boolean; editing: boolean; onFlip?: (key: StatKey) => void }) {
  const drawn = editing ? stats : stats.filter((s) => shown.includes(s.key));
  if (drawn.length === 0) return null;
  return (
    <ul className="pf-stats" aria-label="Stats">
      {drawn.map((s) => {
        const on = shown.includes(s.key);
        const words = statWords(s.key, gameOn);
        return (
          <li key={s.key} className={`pf-stat${on ? "" : " pf-stat--off"}`}>
            <b>{statValue(s.value)}</b>
            <span>{words}</span>
            {editing && onFlip ? (
              <button type="button" className="yl-wear-sw pf-stat-sw" role="switch" aria-checked={on} aria-label={`Show ${words}`} onClick={() => onFlip(s.key)}>
                <span className="yl-wear-track" aria-hidden="true" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
