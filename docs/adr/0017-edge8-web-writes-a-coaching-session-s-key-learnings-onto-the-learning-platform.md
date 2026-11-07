# ADR 0017 — edge8-web writes a coaching session's key learnings onto the learning platform, one column, never over a human

Date: 2026-10-15. Status: accepted.

Records the six decisions of the key-learnings grilling, confirmed by Khoa on 15 October 2026.

## Context

The learning platform (AIO Labz) shows learners the key learnings of each group coaching
session. Its requirements say those learnings are generated from the Zoom transcript, but only
the storage and a hand-driven form were built. In September Dave typed them in about three
minutes after attaching each recording. In October that step was skipped, and both sessions
showed "No learnings".

The transcript already reaches edge8-web: the zoom-transcripts routine ingests every group
session into `company_os.meetings` with the full transcript and an internal summary. The
platform's own content endpoint refuses any caller without a platform-tier browser session, by
design and with a test holding that line, and the platform's API has no scheduler. edge8-web
already holds the platform's service key and reads it in two entities.

## Decision

- **edge8-web generates the learnings and writes them.** The zoom-transcripts routine carries a
  second pass beside the attendee backfill. For each ingested coaching meeting that has a
  transcript and no learnings record, it finds the platform session, generates the learnings,
  writes them, and records what it wrote on the meeting row.
- **One column.** The write goes straight to the platform's `live_event.key_learnings` through
  its PostgREST with the service key. Nothing else on the row is touched: not `resources`, not
  `status`, not the schedule. Resources are pages a human builds; the automation never writes
  them. edge8-web is therefore a second writer of that one column, beside the platform's own
  content endpoint, and this record is what tells the platform's maintainers why.
- **The session is found by key and window.** A candidate is a coaching event, not cancelled,
  whose join link carries the recording's Zoom meeting id, scheduled within three hours of the
  recording's start. One candidate is the session. No candidate is reported and retried on the
  next run. Two candidates inside the window are refused and reported, never guessed, with the
  nearer named first.
- **Never over a human.** The automation writes only when the event's learnings are empty, and
  the write itself is conditional on the column still being empty at that moment. A list a
  person has touched is left alone for good, and the meeting row records it as kept. What the
  automation wrote is never rewritten either: a written record ends the meeting's part in the
  pass, so a person's later edit can never meet a second write. There is no draft step:
  learners see generated learnings as soon as they land, and Dave is told in the coaching chat
  with the admin link so he can edit after, which is what he did by hand in September.
- **Learnings are written for learners.** A prompt of their own over the transcript, three to
  eight one-sentence takeaways, no names, no blockers, no escalations. The internal summary is
  not the source: it is written for Edge8's leaders and names people.

## Considered options

Pushing through a new service-key endpoint in the platform's API would mean a second repository,
a second pull request, a deploy and a new secret, to reach a column the key already reaches.
Having the platform pull from edge8-web needs a scheduler it does not have. A pre-publication
gate needs a draft column on the platform or a holding queue here; neither existed, and a gate
can be added later without undoing anything written under this record.

## Consequences

The platform's `live_event_content.py` docstring calls itself the only writer of the content
columns. It no longer is, for `key_learnings`; a note pointing here belongs in that file. A
human who clears the learnings on the platform leaves the column empty and the meeting row
marked as written, so the automation will not refill it: the record on the meeting row, not the
column, is what says whether the automation may write.
