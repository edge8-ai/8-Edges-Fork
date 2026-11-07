// The showcase and the stats strip of the profile's game screen (LD.6, redrawn
// LD.10 on the canvas approved 28 Oct 2026). Drawn from values; the owner's
// Customise passes the handlers, a teammate's page passes none, and then
// nothing here is a control. The banner scenes LD.6 drew behind the hero went
// with LD.10: Khoa found the bright meadow behind a dark plaque over a white
// page hard to look at, and the game screen is one dark ground.
import { DISPLAY_CASE_HOLDS, type StatKey } from "../../lib/display-choices";
import type { FoundBadge } from "./case-choices";
import type { CaseBadge, ProfileStat } from "./profile-model";
import { statValue, statWords } from "./stat-words";
import { BadgeGlyph } from "../badges/BadgeArt";

/** What Customise does to the display case: add a found badge to the end, or take one out. */
type CaseEdit = { addable: FoundBadge[]; onAdd: (id: string) => void; onRemove: (id: string) => void };

/**
 * The display case on the hero, called the showcase there: the badges chosen,
 * in order, each its medal (LD.7b) and its name. In Customise the five slots show: a filled
 * one carries the prototype's Show switch, which takes it out, and each empty
 * one an Add… select of the found badges not already in the case. With nothing
 * found yet the selects stay disabled and say why.
 */
export function CaseShelf({ badges, editing, own, edit }: { badges: CaseBadge[]; editing: boolean; own: boolean; edit?: CaseEdit }) {
  const empty = editing ? DISPLAY_CASE_HOLDS - badges.length : 0;
  const offered = edit?.addable ?? [];
  return (
    <section className="pf-sec" aria-labelledby="pf-case-h">
      <div className="pf-sec-head">
        <h2 className="pf-sec-h" id="pf-case-h">
          Showcase
        </h2>
        <span className="pf-sec-count">
          {badges.length} / {DISPLAY_CASE_HOLDS}
        </span>
      </div>
      {badges.length === 0 && !editing ? (
        <p className="pf-none">{own ? "Pick up to five badges in Customise." : "Nothing in the showcase yet."}</p>
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
    </section>
  );
}

/**
 * The stats strip. Outside Customise only the stats switched on show, and with
 * none on there is no strip at all; in Customise all six show, each with its
 * switch, the hidden ones dimmed.
 */
export function StatsStrip({ stats, shown, editing, onFlip }: { stats: ProfileStat[]; shown: readonly StatKey[]; editing: boolean; onFlip?: (key: StatKey) => void }) {
  const drawn = editing ? stats : stats.filter((s) => shown.includes(s.key));
  if (drawn.length === 0) return null;
  return (
    <ul className="pf-stats" aria-label="Stats">
      {drawn.map((s) => {
        const on = shown.includes(s.key);
        const words = statWords(s.key, true);
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
