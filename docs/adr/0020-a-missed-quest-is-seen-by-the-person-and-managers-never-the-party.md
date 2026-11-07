# ADR 0020 — A missed quest is seen by the person and managers, never by the party

Date: 2026-10-20. Status: accepted.

Records decisions Q6, Q15 and Q23–Q27 of the Quests grilling (20 October 2026), confirmed by
Khoa. Read beside ADR 0016, which this differs from on purpose.

## Context

Dave wants Quests to build a culture of accountability: "if you ask me to do something, I will
do my best", and people should push each other. Khoa wants a missed Bounty to matter, to the
person who asked and to the company. Both also ruled out shame: on 13 September Khoa forbade
per-person metrics, and on 20 October he added "no public shaming by any means".

ADR 0016 says training reads are about the programme or about yourself, never one person for
someone else. A Missed is information about one person. Quests shows it to others anyway, so
the difference needs a reason.

The reason is that a Bounty is a **request made to a named person**, not a review of how their
growth is going. Whoever asked, and whoever manages the person asked, has a legitimate reason to
know the request went unanswered, so that they can follow it up privately. A training review is
honest only while nobody reads it against its author; a request has no such honesty to protect.

## Decision

- **The party never sees who missed.** A quest shows its lit portraits and a count
  ("7 of 12 turned in"). The Bounty may end sad; nobody on it is named as the reason.
- **The person sees their own Missed**, in their own quest log.
- **Managers see Missed for their direct reports** (the `manager:team` scope), on a report in the
  admin surface and through Claude. **Admins see everyone.**
- **A Giver who is a manager sees everyone who missed their own Bounty.** A Giver who is not a
  manager sees only what the party sees, so posting a Bounty to everyone is never a way to find
  out who stays quiet.
- **Amended 2026-10-20 (QS.10, Khoa):** the same manager Giver also sees everyone they called
  while the Bounty is still open, lit once they have turned in. A required Bounty is an ask the
  Giver is entitled to follow up, and "who have I asked?" was the first thing missing on the live
  page. A Giver who is not a manager sees how many they called and the lit portraits, no more.
- **Every read of Missed is about one quest.** No screen, export, routine, assistant tool or
  notification counts a person's misses across quests ("missed 4 of the last 6").
- A Withdrawn Bounty has no Missed, and a Late Turn-in lifts one.

## Consequences

- The manager report has a quest picker and no person picker.
- The rule is enforced in the read model the report and Claude share, not in each screen, so a
  new screen cannot widen it.
- A manager who wants to know whether someone keeps missing asks them, in conversation; this
  product will not answer it.

## What would reopen it

A decision by Khoa that answering Bounties is part of a role's job, told to the people in that
role in advance. That would be its own attributed record, not a relaxation of the per-quest rule.
