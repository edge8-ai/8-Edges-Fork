# ADR 0016 — Training reads are about the programme or about yourself, never about one person for someone else

Date: 2026-10-11. Status: accepted.

Records decision Q1 of the training-tracking grilling (W.123, 6 October 2026), confirmed by Khoa
on 11 October 2026 when the feature was placed in the Talent office. The plan first called this
ADR-0012; that number was taken in the repo before the plan was committed, so it is filed here.

## Context

The training entity records every training a person takes, lets the person review it (stars,
load, feeling tags, a note), lets them record outcomes, and turns all of it into analysis. That
analysis can be cut two ways: across people (how a scrim block or a course is landing) or for
one person (how this person's trainings relate to their results).

The second cut is what a manager would most like to see, and it is what the Talent office's
other pages are made of: Probation and Reviews are about one person. On 11 October the feature
moved into that office, at Talent › People › Training, which is exactly where a per-person
training page would look natural.

Three standing rules weigh against it. On 13 September Khoa ruled that metrics describe the work
or its outcome, never a person, and nothing is sliced by person. On 18 September growth was made
self-reported. And a review that is read against its author stops being honest: once a member
learns that two stars on a scrim count against them, every scrim gets four.

## Decision

There are two reads and no third.

- **The programme read** is about trainings across the people who took them, by training type,
  plan or period. Organisers, managers and admins see it, and so do members for plans they are in.
  It is the read shown at My Team › Training and at Talent › People › Training. A slice reviewed
  by fewer than three distinct people is not shown, for everyone, admins included. Notes carry no
  name unless the member signed one.
- **The personal read** is about one person, and only that person sees it. It is generated when
  they open it and is not stored. Nobody else sees it, and the product offers no way to send it
  anywhere: what a person tells others about their training, they tell them themselves.

No screen, export, routine, assistant tool or notification shows another person's trainings,
reviews, skips or outcomes to a manager, coach or admin as one person's record. Attendance is
counted only inside the programme read, under the same three-person minimum.

## Consequences

- Talent › People › Training sits beside Probation and Reviews but is not shaped like them: it has
  no person picker and no per-person row.
- The three-person minimum is enforced in the read model that both screens share, not in each
  screen, so a new screen cannot forget it.
- A manager or organiser learns how one member's training is going only by asking them.
- Some questions a manager would like answered ("is this person keeping up?") are not answerable
  here. They are asked of the person, in conversation.
- Training is separate from Coaching (decided 11 October 2026): a 1-1 is not a training, and no
  read travels into a 1-1's prep. The two privacy models never meet.

## What would reopen it

A decision by Khoa that training attendance is a condition of employment for some role, with
the people in that role told so in advance. That would be a separate, attributed record with its
own consent, not a relaxation of this read.

## Amendments (2026-10-12, Dave, English Program)

**The teacher's note.** A plan's organiser may write a note about one learner on that plan
(strong points, weak points, what to work on now; `training_learner_notes`). It is
teacher-to-learner feedback and the whole point of a taught class: the teacher writes it, the
learner reads it on My Training, and it appears nowhere else, not in the programme read, the
admin pages, the weekly recap or any assistant tool. It is not honesty data: it carries no stars,
load, skip reason or review note, and the programme read still never shows one person's answers.

**Attendance on a taught session.** For a session with a recording, attendance may be seeded from
the transcript (who spoke, who was listed) as attended or absent with its source recorded, and
either the learner or the organiser may correct it. A correction wins and is never overwritten by
a later transcript. Everywhere else the member's word stays final, as above; the organiser's
correction exists because a class register is the teacher's to keep, and the learner sees every
row about them with its source.
