# ADR 0036 — The Quests game page is replaced by Asks, and the page speaks in ask words

Date: 2026-11-17. Status: accepted. Follows ADR 0019 (Quests are their own entity), ADR 0020 (a
missed quest is seen by the person and managers, never the party) and ADR 0023 (the clock belongs
to Quests). Narrows ADR 0020's QS.10 amendment on the Asks page.

Records the decisions of the Asks spec (`docs/engineering/2026-11-16-asks-spec.md`). Card AK.2.
The vocabulary is the Quests glossary's (`entities/quests/GLOSSARY.md`), whose Asks section maps
each page word to the domain term it stands for.

## Context

Quests was built so that an ask made of the team stops getting lost in chat: who was asked, who
answered, what they said. In 27 days live it carried one quest, a test that was posted and
withdrawn, with no Turn-ins, no raised hands, no Reactions and no quest Inbox rows. The page
asked a person to learn a game before they could make or answer one ask: Bounties, Hydras,
Raids, Beacons, Campfires, Lighthouses, the Lore, Evolve, HP, points and a season banner, across
eight sections. Every part waited on a Giver posting a Bounty, and none did.

The ask itself is the part only Quests holds. Learnings are sparks in Ideas, sessions are
Training's, and Ladders counts both.

## Decision

1. **The Quests game page is replaced by the Asks page, `/team/asks`.** It has four lists:
   *Waiting on you* (required asks made of the reader that they have not answered), *You asked*
   (the reader's own open asks, with *N of M answered*, the answerers' faces and their answers),
   *Open to anyone* (optional asks the reader was included in and has not answered) and, since
   AK.8, *Closed in the last two weeks* (a required ask the reader had not answered when it
   closed, which still takes an answer that is recorded and shown as late, and the reader's own
   closed asks with their answers, a late one tagged *Late*). Its row
   sits under *Me* in the team sidebar with the count of asks waiting on the person, and it is
   guarded by `quests.mine`, the atom the Quests page already used.

2. **Quests keeps its entity, tables, rules, atoms, events and notice kinds.** An ask is a Bounty
   with one head. Answer is a Turn-in on that head, Thanks is a Reaction with a fixed line, and
   Close now and Withdraw are the existing close and withdraw actions. There is no decline (§5).
   No table, column or permission is renamed, and no schema changes.

3. **Every word a person reads on the page is an ask word:** *ask*, *answer*, *late*, *thanks*
   and *asker*. No Bounty, Giver, Hydra, Turn-in or quest. The refusals the four moves can return
   are worded the same way at their source (`lib/standing.ts`, `lib/quest-actions.ts`).

4. **On the Asks page, an asker never sees who has not answered, even on a required ask.** The
   read model behind the page has no field for a person still out: *You asked* carries a count of
   who was asked, and names only the people who answered. The names it looks up are those
   people's and the askers', nobody else's. This narrows ADR 0020's QS.10 amendment on the page,
   which let a manager or an admin who gave a required Bounty see everyone they called. The
   manager report (`quests.report`) is unchanged: it still answers who is out on or missed one
   ask, for the managers and admins ADR 0020 and QS.10 name.

5. **A required ask cannot be declined.** It is a task. Its asker is a manager or an admin, every
   row starts Accepted, and a row still out when the ask closes is Missed, which the person and
   their managers see (ADR 0020). It still takes an answer after it closes; that answer is
   recorded as late, the person is told *Answered late*, and the asker's card and the manager
   report show it as late. *Waiting on you* offers Answer alone, and the model refuses a Hand back
   on a required Bounty from any Standing (`standing.openMoves`, `decide`). An ask open to anyone
   needs no decline, because nobody is expected to answer it. So the page has no decline at all,
   the hand-back action has no caller and is removed, and the page's read takes no hand-back note.

   The spec and AK.2 first made a required ask declinable, to spare a person a Missed they could
   explain. The boundary review on the Asks pull request blocked it: a declined required ask
   would show as *Handed back* beside the person's name on the manager report, while this ADR
   said a decline left no mark. Khoa ruled on 17 November 2026: "Required ask can not be
   declined. It's a task, if you missed the deadline, it's recorded and it will affect you." That
   is the rule ADR 0020 and Khoa's 20 October rulings already held for a required Bounty.

   Since AK.12 (Khoa, 17 November 2026) the model has no hand-back move at all, required or
   optional: a party member's one move is the Turn-in, so the refusal above became a type error.
   The *Handed back* rows the Quests page wrote keep their Standing and may still turn in.

## Consequences

- The game words leave the person's screen without a migration, and the assistant, the clock and
  old rows keep working against the same tables.
- *Required* keeps its meaning: answer, late if you must. A person who cannot answer says so to
  the asker outside the page, and the Missed stands until a late answer lifts it to *Turned in
  late*. The Missed itself only the person and their managers see (ADR 0020). The late answer is
  also seen by the asker, whose card tags it *Late*, on a required ask and on one open to anyone
  alike: it is a fact about the asker's own due time (AK.9).
- The optional Bounty's Hand back stays in the rules for the Standings written under the Quests
  page; no page offers it any more.

## What would reopen it

- People using Asks and asking for more than an ask: the usage is read again from the tables
  (asks posted, answers, thanks) before anything more is built on it.
- A need for the asker to chase people by name, which would have to be squared with ADR 0020
  rather than added to the page.
- A need for a person to decline a required ask on the page, which would reopen §5 and has to
  answer how the decline shows on the manager report.
