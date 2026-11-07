# ADR 0021 — Two private ladders, worn as cosmetics

Date: 2026-10-21. Status: accepted.

Records the Ladders grilling (20 October 2026, Q1 to Q25), Khoa's rulings on the badge set and
the emblem art the same night, and the approved prototype (version 2 of the Ladders artifact,
approved 21 October 2026, whose emblems reached version 4 after two passes the same day). Vocabulary: the Ladders section of `entities/quests/GLOSSARY.md`,
which moves to `entities/ladders/GLOSSARY.md` with ticket LD.1. Read beside ADR 0016 (training
reads are about the programme or about yourself), ADR 0019 (Quests are their own entity) and
ADR 0020 (a missed quest is seen by the person and managers, never the party), and against the
quests spec's out-of-scope line, which ruled out "person levels". This ADR reverses that line on
purpose, inside a fence.

## Context

Quests gives the four levels of learning and sharing a place in the product, but nothing
pulls a person up them. Khoa asked what the pull should be and ruled out pay and reviews: the
pull is what games give, and what makes people play them for years. Visible locked
achievements, titles and cosmetics, unlocks, rarity, being needed, and praise the moment the act
lands.

Three facts shaped the answer.

- **One scale would measure people on someone else's job.** Over the last 90 days the five
  builders (the engineers and the founder) shipped roughly 100 to 420 Human Tokens each, and
  everyone else 0 to 50. The gap is structural, not effort. Khoa's line: "nobody is measured on
  a scale built for someone else's job". So there are two ladders, and nobody is placed on one
  against the other.
- **The 13 September rule forbids per-person metrics.** On 13 September 2026 Khoa ruled that
  metrics describe the work or its outcome, never a person, and that nothing is sliced by person.
  ADR 0016 and ADR 0020 both rest on it. A ladder is a per-person total by definition, so it can
  exist only as a carve-out with a fence that code enforces, not a promise in a screen.
- **A rule kept only in prose does not hold.** The database incidents of 2026-09-26 (PR #1717)
  and 2026-10-03 (CLAUDE.md, "Database changes"), and the boundary leak of 2026-10-12 (PR
  #2120), each followed the written rule to the letter and broke it in effect. A privacy
  carve-out that relied on every future screen remembering it would go the same way.

## Decision

### Two ladders, absolute, only up

- **Learn & Share** wears Wild Rift's armoured helms, eleven tiers: Iron 0 · Bronze 40 · Silver
  120 · Gold 300 · Platinum 600 · Emerald 1,000 · Diamond 1,600 · Master 2,500 · Grandmaster
  4,000 · Challenger 6,000 · Sovereign 10,000. Every tier up to Challenger has four divisions
  (IV to I); Sovereign is the open top. Points: a Turn-in on a Bounty 10 a head, a spark or a
  learning in Spark 10, a Raid you hosted that someone came to 100, a Beacon lit 250. Its tier
  is worn as a **border** round the face.
- **Builder** wears Dota 2's medals, eight tiers: Herald 0 · Guardian 300 · Crusader 1,000 ·
  Archon 2,500 · Legend 6,000 · Ancient 14,000 · Divine 30,000 · Immortal 60,000. Every medal up
  to Divine has five stars; Immortal is the open top, and its medal changes at 120,000 and
  250,000 (three **Immortal bands**, all called Immortal from outside). Points: a leaf card moved
  to Done is its Human Tokens × 10, an unsized one 3, credited to the assignee alone, per card per
  person. Its tier is worn as a **medal** on the profile plaque and the postcard.
- **Thresholds are absolute points.** No tier is a share of people, a position or a top-N, so
  holding Sovereign or Immortal never means someone else does not.
- **Only up.** No decay, no demotion, no reset, no seasons and no history. A tier once reached is
  kept even if a source row is later corrected (a card taken out of Done, a spark archived). The
  quarter-end trims of the first draft were dropped on 20 October: two current emblems, side by
  side, and nothing that looks back.
- **Acts earn, applause does not.** A Reaction, a Helped, a kudos or a "will try" earns nothing.

### Who reads what: the carve-out

- **The person alone** reads their standing: points, tier, division or stars, the bar to the
  next one, every badge including locked and secret ones, and every stat.
- **Teammates** read only what the person chose to show: the worn tier on each ladder (the tier
  word and its art, never a division, a star or a point), and on the profile the banner, the
  title, the stats switched on and the display case. Everything starts hidden.
- **Nobody else** reads anything. No manager view, no admin report, no export, no routine, no
  assistant tool, no notification about someone else's rank-up or badge, and never anything on
  the client portal.
- **Only the person wears or removes** an emblem, a border or a badge.

The fence is the door. The `ladders` entity's door exports two reads, each defined by its
audience, and no read takes a subject other than the reader:

- `myStanding(reader)`: everything, for the reader about the reader.
- `wornTiers(ids)`: for each person, the tier on each ladder they chose to wear, or nothing. It
  is batched so a page asks once for every face it draws.

The teammate's view of a dressed profile (banner, title, shown stats, display case) is the one
widening the approved prototype added after the grilling. It is answered by the same read,
`wornTiers([id], { profile: true })`, which adds the items that person switched on and nothing
else; there is no third read and no read that takes a subject and returns what they hid. `check:table-ownership` keeps
every other entity away from the three tables, and a pinned test fails any import of the
ladders door from an admin route, a report, an export, a routine or the assistant.

### Store, don't compute

The ladders are stored, as a cache that can always be rebuilt from the rows that earned them.
Event subscribers recompute a person's position when one of their acts lands; a nightly routine
replays every person from the source rows and repairs anything an event missed.

### Emblem art is private

The helms, borders and medals are the official Wild Rift, League and Dota 2 rank art itself:
transparent images of the real emblems, used as they are and composed around the face. Three
rounds of vector redraws (artifact versions 2 to 4) were rejected on 21 October: beside the
originals they read as a clean imitation, and Khoa's verdict was that "an ok draw makes it look
like a toy project", after his 20 October line that without the real thing "it's dumb and
boring, and no one will give a damn". The art is therefore private to Edge8. Because the entity
is portable and so reaches the public fork, the emblem module is fork-excluded and
`.github/fork-overlay/` ships a plain set under the same path (the vector set, a ringed circle
or a plain helm per Learn & Share tier and a plain shield per Builder tier), the
`onboarding-deck.ts` pattern. `npm run check:fork-safe` proves the staged tree builds with the
plain set and carries none of the official art. A licensing objection is what would reopen this
(below), and the plain set is the fallback that already builds.

## Considered options

- **One ladder for everyone.** Rejected on the 90-day numbers above: it would rank the builders
  above everyone else forever and tell most of the company their work does not count.
- **Compute on read.** The first sketch derived a tier from the source rows whenever it was
  drawn. It fails twice. Borders go everywhere a face shows (Quests, the sidebar, the board,
  Spark, My Week), so a board with forty cards would replay forty people's histories per render.
  And the rank-up screen needs a before and an after at the moment the act lands, which a pure
  read cannot give without storing the before somewhere. Khoa also ruled to "assume nobody
  reads the database raw": the stored table is not an exposure, the door is the fence.
- **Ranks visible by default, opt out.** Rejected: an opt-out turns the 13 September rule
  inside out. Hidden by default makes showing a tier a choice, like wearing a badge.
- **Relative top tiers, as in the games** (Grandmaster, Challenger and Immortal as top
  percentages). Rejected: at sixteen people a top tier is one name, and it says everyone else
  is not it.
- **Seasons and resets.** Rejected 20 October: a reset takes away something earned, and a
  season adds a clock. Nothing here has a clock.
- **Self-drawn emblems, or the plain set for everyone.** Rejected by Khoa after the version 1
  review: the art is the reward.

## Consequences

- A per-person total now exists in the database, readable through one door. Every new screen
  that wants it must go through `wornTiers`, and a screen outside the team surface cannot.
- The ladders entity requires `quests`, `ideas`, `boards` and `training` (it reads their acts
  through their doors); none of them may require it back. Faces in those entities get their
  border from a kernel seam that the composition root fills with `wornTiers` only when the
  deployment installs ladders, so a deployment without it draws plain faces and imports nothing.
- The cache can drift from its sources between an event and the nightly replay. A missed event
  delays a border by at most a night and never lowers one.
- Quests' own copy keeps its rule: nothing in Quests levels, ranks or totals a person. The
  ladders are their own context and read Quests' acts from outside.

## What would reopen it

- A reader other than the person, or a teammate seeing more than what was chosen, wanted for a
  real reason. That is a new attributed decision by Khoa, not a widening of a read.
- Evidence that the ladders pressure people rather than pull them: people asking to switch
  them off, or acts being split to farm points (ten one-line sparks where one would do). The
  remedy is to change the points table, never to add a comparison.
- A licensing objection to the emblem art. The plain overlay set is the fallback that already
  builds.
