# ADR 0019 — Quests are their own entity, not a kind of Workboard card

Date: 2026-10-20. Status: accepted.

Records the data-model decision of the Quests grilling (20 October 2026), confirmed by Khoa.
Vocabulary: `entities/quests/GLOSSARY.md`.

## Context

Asks made in Lark chat get forgotten: nobody scrolls back to the message that asked them to share
something by Friday. Khoa and Dave agreed to make such asks assignable to everyone, discoverable
on a page, and answerable through Claude ("do I have any open quests?"). The obvious build is a
Workboard card with a new kind: the card already has assignees, a due date, comments, the drawer
and Claude's card tools. Khoa's first instinct was exactly that ("inherit the card but
polymorph it").

Three facts weigh against it.

- **The card's lifecycle is not a quest's.** All 58 reads of `company_os.tasks` and its 7
  triggers live in `boards` and assume a card moves through columns to Done. A quest is Called,
  Accepted, Turned in, Handed back or Missed per person, it can be Withdrawn, and a Bounty closes
  on a date without ever being "done".
- **The W.147 cascade would lie.** Moving a card to Done moves its open children with it. A
  global Bounty modelled as a parent card with a child per person would mark every unanswered
  Turn-in complete when it closed. Quests are self-reported (18 September 2026): a quest the
  system ticks off for you is not one you kept.
- **The boards would flood.** A Bounty to everyone is one row per person. Every board read would
  have to learn to leave quests out, and the one that forgets shows them.

## Decision

Quests is its own entity with its own tables and its own page on the `/team` surface. It reads
team members for its people picker, and it does not write `company_os.tasks`. A Bounty is for
an ask that would otherwise be lost in chat; work belongs on the Workboard from the start, and
there is no wire that turns a Bounty into a card.

A Raid's session is Training's taught session: Quests shows it, Training owns it. Accepting a
Raid as its Host grants the right to organise that one session.

## Considered options

- **A `kind` on `company_os.tasks`.** It gets the drawer and Claude's card tools for free, at
  the cost of the three problems above, permanently.
- **Cards for Bounties, a new entity for the rest.** Two homes for one idea; the page would join
  two models.

## Consequences

- Quests rebuilds what it needs from the card: a picker, a closing date, a discussion. That is
  the price of a page that does not feel like a ticket, which was the point.
- Claude needs its own Quests tools; the card tools do not see quests.
- The entity is `portable` in the manifest, with no internal pockets. The grilling had said
  internal for v1, but a fully internal entity cannot contribute a navigation row: the generated
  `app/nav.ts` ships to the fork as it is, so an import of an internal entity's door breaks the
  fork's build (`check:portability`, 20 October 2026). The two internal entities today, `htt`
  and `library`, have no nav row for that reason. Quests holds no Edge8-only value, so it ships.

## What would reopen it

A Workboard that stops assuming one lifecycle per row, or quests that turn out to be work in
practice. If most Bounties end up as cards anyway, the wire forbidden above is the thing to
revisit.
