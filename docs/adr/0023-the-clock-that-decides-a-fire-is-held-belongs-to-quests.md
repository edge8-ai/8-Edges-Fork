# ADR 0023 — The clock that decides a fire is held belongs to Quests

Date: 2026-10-28. Status: accepted.

Records the S9 + S10 grilling of 28 October 2026 (architecture backlog pass 1028), confirmed by
Khoa. Vocabulary: **Held fire** in `entities/quests/GLOSSARY.md`, **Act** in
`entities/ladders/GLOSSARY.md`. Cards A.75, A.76, A.77.

## Context

The Quests glossary defines a Held fire as a Raid whose session has ended, was not cancelled, and
had someone other than the Host attend, and says it is what earns the Host their Points. Three
places decided it, from two different inputs. Quests (`isHeld`, which drives the Beacon and Evolve
offers) checked the end time. Ladders' points (`isFire`) and fire badges (`fireRows`) trusted
Training's register, whose `held` means only "not cancelled". Training accepts an attended mark
from the moment a session starts, and Ladders recomputes the Host on that mark. So a Host was
given their fire points partway through a session that Quests still showed as Burning.

Neither of the other owners could take the end check without breaking an accepted decision.
Training answers who came and judges nothing (ADR 0016). Ladders has no clock (ADR 0021: "Nothing
here has a clock").

## Decision

- **Held is Quests' answer.** Quests already joins Training's two reads (the taught session and
  its register) and applies the end time with its own `now`. Its door hands Ladders each hosted
  Raid with the judgment made: whether it is held, and who other than the Host attended. Ladders
  reads that answer and applies no clock.
- **The quest clock states the moment.** Each tick (every ten minutes), Quests states
  `quest.fire.held` for Raids whose session ended in a window that overlaps the last tick, with
  someone other than the Host marked attended. Ladders recomputes the Host on it. Every Ladders
  handler is a recompute, not an addition, so stating a fact twice is harmless. A missed tick is
  repaired by the nightly replay. No column records that the fact was stated.
- **Points and badges read one record.** Ladders gathers each person's acts once (the badge
  facts) and computes Points from them. Hit, Beacon lit and Held fire are each defined once and
  shared. The points-only Quests read is deleted (A.76). The Ideas and Boards twins follow (A.77),
  each proved by a person-by-person diff of Points against production before it merges.

## Considered options

- **Training answers "was this session held?"** Rejected. It makes Training judge, which ADR 0016
  rules out, and Training would have to know what a Host is.
- **Ladders adds the end check.** Rejected. It gives Ladders a clock, which ADR 0021 rules out.
- **Keep Ladders' rule and let Quests follow it** (held from the first attended mark). Rejected.
  The glossary's rule is the intended one, and a Beacon offered mid-session is wrong.
- **Stamp `held_at` on the quest so the fact is stated exactly once.** Rejected for now. It needs
  a migration through the full database gate to buy an exactly-once that idempotent recomputes do
  not need.
- **No event; let the nightly replay pick it up.** Rejected. A Host would wait up to a day for
  points the page promises at the end of the session.

## Consequences

- A fire's points arrive within about ten minutes of its session ending, never before it ends.
- `quest.fire.held` has one subscriber, Ladders. A notification to the Host would be a new inbox
  kind and a separate product decision.
- Training's register keeps meaning what it always meant. Only Quests reads it as a fire.
