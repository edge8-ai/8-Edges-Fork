// The party as its Giver sees it, in both arenas (ADR 0020). Right after a
// summon the arena used to say "0 hits landed" and show nobody, so a Giver
// could not tell from the page whom they had asked. Every Giver now sees how
// many they called. The Giver of a required quest, a manager or an admin at
// summon, also sees who: a chip per person, lit once they have turned in on
// every head. An optional quest's Giver sees only the lit portraits the whole
// party already sees. The read model decides which; this file only draws it.
import { Glyph } from "./art";
import { Face } from "./Face";
import { headsInNote } from "./quests-model";
import type { GiverParty as Party, Portrait } from "../lib/quests-read";

export function GiverParty({ party, lit, hydra, freshId = null }: { party: Party; lit: Portrait[]; hydra: boolean; freshId?: string | null }) {
  return (
    <>
      <div className="qs-party-head">
        <span className="qs-party-lbl">Your party · {party.called} called</span>
        {party.members && (
          <span className="qs-party-priv">
            <Glyph name="lock" size={12} /> only you see who
          </span>
        )}
      </div>
      {party.members ? (
        <ul className="qs-gp-list">
          {party.members.map((m) => {
            const note = m.lit ? "hit" : hydra ? headsInNote(m.headsIn, m.heads) : null;
            return (
              <li key={m.personId} className={m.lit ? "qs-gp qs-gp--lit" : "qs-gp"}>
                <Face who={m} size="sm" />
                {m.name}
                {note && <small>· {note}</small>}
              </li>
            );
          })}
        </ul>
      ) : (
        lit.length > 0 && (
          <div className="qs-portraits">
            {lit.map((p) => (
              <Face key={p.personId} who={p} lit fresh={freshId === p.personId} />
            ))}
          </div>
        )
      )}
    </>
  );
}
