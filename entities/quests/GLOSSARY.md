# Quests

The things people take on to live Edge8's values of learning and sharing, and the Lore they leave
behind. A quest is a request or a commitment, never a score: nothing here levels, ranks or totals
a person. The reader's own Points and Tier appear on the Quests page (Next move), but they are the
Ladders' words, read from that entity and seen by the reader alone (ADR 0021).

The Quests page's game is replaced by the Asks page (ADR 0036). The entity, its tables and its
rules keep the words below; the Asks page says them in ask words, mapped in *Asks* at the end. The
terms only the game used (Hydra, Raid, Beacon, the Lore, Hit, HP, Campfires, Next move, Lands for
you) are the retired Quests page's, kept here for the rows and code that still carry them.

## Quests

**Quest**:
Something a person takes on: a Bounty, a Raid or a Beacon. Every quest has one Giver and a Party.
_Avoid_: task, card, mission, assignment

**Bounty**:
A quest one person asks of others, with a due time per head: an ask that would otherwise be lost in
chat. Work belongs on the Workboard, not in a Bounty.
The Asks page calls a Bounty with one head an ask (see *Asks* below, ADR 0036); this Avoid list is
the Quests page's, which says Bounty.
_Avoid_: request, ask, ticket

**Required bounty**:
A Bounty whose Giver is a manager or an admin. Everyone called is committed from the start: there
is no Accept, and everyone is reminded. It is a task: there is no Hand back, and a person who has
not turned in when it closes is Missed until a late Turn-in lifts it (ADR 0020, ADR 0036 §5).
_Avoid_: mandatory, compulsory

**Optional bounty**:
A Bounty from anyone else. Being called obliges nothing; Accept opts in and starts the reminders;
Decline is allowed. Only a person who accepted can be Missed on it.
_Avoid_: voluntary

**Learning bounty**:
A Bounty whose Turn-ins become Discoveries unless their author keeps them out of the Lore.

**Raid**:
A quest to teach the team in a session. The session itself is Training's. On the page it is a fire:
a Burning fire until its session ends, then a Held fire (to its Host, an ended fire to mark until its
register carries a word).
_Avoid_: workshop, talk, lesson

**Host**:
The person who teaches a Raid: whoever lit its fire, by lighting a Cold fire or by Evolve on their
own learning. They organise that one session and no other.
_Avoid_: organiser, presenter, speaker

**Beacon**:
A quest to put a learning in front of the world outside Edge8: a post, a talk, a micro-session. Its
Turn-in is a link to the public thing. Each lit Beacon stands as a lighthouse on the page's horizon,
with its author's face.
_Avoid_: world event, public share

**Giver**:
The person who posted a quest.
_Avoid_: owner, assigner, creator, poster

**Party**:
The people on a quest: those the Giver called, or those who joined.
_Avoid_: assignees, members, attendees

## Standing

**Standing**:
Where one Party member is on one quest: Called, Accepted, Turned in, Handed back or Missed.
_Avoid_: status, progress

**Called**:
Named on a quest by its Giver, with no answer yet.
_Avoid_: pinged, assigned, invited

**Accepted**:
Committed to a quest. Turning in counts as accepting.
_Avoid_: claimed, started

**Turn-in**:
What a Party member hands back to the Giver to answer a quest.
_Avoid_: submission, response, deliverable

**Handed back**:
Declined or given up openly, with a note to the Giver. An honourable answer, not a failure. Only
on an Optional bounty: a Required bounty cannot be handed back (ADR 0036 §5).
_Avoid_: abandoned, rejected, failed

**Missed**:
The quest closed before this Party member turned in. Only the person and managers ever see it, on
that one quest; it is lifted by a late Turn-in.
_Avoid_: failed, overdue, incomplete

**Late**:
A Turn-in that arrived after its quest closed. It counts in full, and it is recorded and shown as
late: the person is told so, and the Giver sees it tagged Late on the Asks page (AK.9).

**Head**:
One ask inside a Bounty, with its own due time. A Bounty has one or more; a Turn-in and a Standing
are per head.
_Avoid_: step, subtask, item

**Hydra**:
A Bounty with two or more heads, drawn with one head per ask.

**Due time**:
The date and time of day (Saigon) at which a head stops expecting Turn-ins. Raids and Beacons may
have none. On a required Bounty, everyone still out is reminded by Lark at 10:00 the working day
before it (AK.5); an optional one sends no reminder.
_Avoid_: deadline, closing date, expiry

**Withdrawn**:
A quest its Giver took back while open and before its closing date. Turn-ins already made stay;
nobody on it is Missed. A Raid is also withdrawn when its Training session is cancelled before
it starts (QS.5c): it leaves Burning, nothing is offered from it, and its topic is wanted again
with its Hands, as for a fire that never happens.
_Avoid_: cancelled, deleted, closed

**Reaction**:
The Giver's reply to a Turn-in. It is how a Bounty's mood brightens.
_Avoid_: approval, review, rating

## The Lore

**Lore**:
The company's learnings as the Quests page shows them: the learning sparks on the Spark page, read
through the Ideas door. The page's one-line composer posts into it through the same door. The
Quests entity keeps no copy.
_Avoid_: codex, library, knowledge base, wiki

**Discovery**:
One learning in the Lore: a learning spark ("I learned") on the Spark page, owned by Ideas. It is
what a Turn-in on a learning bounty becomes, or what a person posts in Spark themselves.
_Avoid_: page, note, post, tip

**Evolve**:
To take your own Discovery further. Once three people will try it, its author may host a fire on it
(a Raid); once that fire is held, they may light it as a Beacon. Evolve is offered only to the
author, on their own learning, and is never sent to anyone as a reminder; someone who wants another
person's learning taught raises a Hand instead.
_Avoid_: level up, upgrade, promote, nudge

**Hit**:
One Turn-in seen from the monster's side: it takes a share of the Bounty's HP equal to one Party
member. Hits are not scored on the page: HP is the share of the party still out, and nothing else.
A Hit does earn its Hitter 10 Learn & Share points, seen by them alone (ADR 0021, the Ladders).
_Avoid_: point, score

**HP**:
How much of a Bounty's Party has not turned in yet, as a percentage. It only ever goes down.
_Avoid_: progress, completion rate

**Helped**:
Spark's own answer on a learning ("will try"), seen from Quests. The Quests page shows how many
people other than the author will try each learning, and three unlock its author's Evolve; it never
names them and it earns no Points.
_Avoid_: like, upvote, kudos

## Campfires

**Hand**:
One person's wish to learn a topic, raised on the Quests page with one click on a topic already
named or with one line ("I want to learn…"). A hand is its owner's own: others see only how many
hands a topic has, never whose. One hand per person per topic.
_Avoid_: vote, upvote, request, like

**Cold fire**:
A topic with three or more Hands and no Host yet. Anyone may light it, choosing its time, and
becomes its Host; lighting it creates the Raid and its Training session.
_Avoid_: cold campfire, poll, wishlist, proposal

**Burning fire**:
A Raid with a Host and a time whose session has not ended: open for Seats. Once its session
ends it leaves Burning for everyone but its Host, who keeps it as an **ended fire** (QS.5c):
shown to them alone, with Mark who came, while they organise the session, someone sat by it, and
its register has no mark yet (someone marked attended or absent). It goes once the register
carries a word.
_Avoid_: event, booking, upcoming session

**Held fire**:
A Raid whose session was taught (never one a member logged for themselves), has ended, was not
cancelled, and had someone other than the Host attend.
It is what earns the Host their Points and what offers a Beacon next. A fire is never held while it
burns: someone marked attended during the session makes it held only once the session ends. Held
is Quests' word, and the Ladders take it from Quests (ADR 0023). Not Spark's "held", which is a
reader's answer that a learning they tried worked.
_Avoid_: past session, completed raid

**Seat**:
A place taken by a Burning fire: a row on its session's register in Training, which the member
takes and leaves themselves. A seat earns nothing, and nothing shows who took one and did not come.
_Avoid_: booking, RSVP, registration, attendance

## The page

**Next move**:
The top of the Quests page: every act open to the reader right now, each with the Points it earns
on their Learn & Share ladder, beside their own Tier and bar. Only the reader sees it, and it is
never sent to them or to anyone.
_Avoid_: to-do, suggestion, recommendation, reminder

**Lands for you**:
What an act would land for the reader, shown before they do it, beside the section where it is done
and in one line on each Next move card: its Points, their Tier before and after, the next Badges it
can find with their own progress, and the Title it lets them wear. Read from the Ladders and seen by
the reader alone. A Badge found drops where the act landed.
_Avoid_: rewards panel, incentive, preview

## Asks

The Asks page's words (ADR 0036). Each is a domain term above said in plain words: the page says
only the words on the left, and the entity, its tables, permissions, events and notice kinds keep
the terms on the right. The table is a map, not more terms. The Quests page that spoke the terms
above retired with AK.4; its Avoid lists still hold for code and docs that use the domain terms.

| On the Asks page | In the domain | What it is |
|---|---|---|
| ask | a Bounty with one head | One question or request to some or all of the team, with a due time, made from the page or by the assistant. Required when the asker is a manager or an admin. |
| asker | Giver | The person who made the ask. |
| Answer | Turn-in on that head | Words, a link among them if the ask wants one. It carries the answerer's name, and the asker sees it. |
| Thanks | Reaction with a fixed line | The asker's thanks for one answer; one per answer. |
| Close now, Withdraw | the Giver's close and withdraw | Closing keeps the answers and, on a required ask, marks Missed whoever has not answered, as the due time would. Withdrawing is refused once the due time has passed. |
| Waiting on you | rows Called or Accepted on an open head of a required Bounty | What managers and admins asked of the reader that they have not answered. The sidebar's Asks row counts it. |
| You asked | the reader's own open Bounties | Each with N of M answered, the faces of those who answered, their answers. Never the names of the people who have not answered (ADR 0020). |
| Open to anyone | rows Called or Accepted on an open head of an optional Bounty | Asks the reader was included in and has not answered. Nobody is expected to answer them, and not answering leaves no mark. |
| Closed in the last two weeks | heads closed (or past their due time) in the last 14 days: the reader's rows Called, Accepted or Missed on a required Bounty, and the reader's own Bounties | An ask moves here when it closes and leaves two weeks later (AK.8). An optional ask, and one the reader answered, leaves at its close. The reader's own closed asks keep their answers, one that came after the close tagged *Late*. The sidebar's count never includes it. |
| Answer late | a late Turn-in | The one move on a closed ask the reader had not answered. It lifts a Missed and is recorded as late: the reader is told *Answered late*, and the asker's card tags it *Late* (AK.9). |
| Late | a late Turn-in | The grey tag on an answer that came after the ask closed, on the asker's card. A required ask has no decline, so late is how an answer after the due time shows (ADR 0036 §5). |
