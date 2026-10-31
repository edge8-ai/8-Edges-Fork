-- fork-schema-upgrade: 20261027080216 -> 20261027091732
-- GENERATED FILE: do not edit by hand. Produced by scripts/gen-fork-schema.mjs
-- in the upstream repository, as the DDL that takes a database built from
-- 01-schema.sql version 20261027080216 (then 02-rebrand.sql) to version 20261027091732.
-- Apply with scripts/fork-upgrade.sh, which runs it in one transaction and
-- records the new version; README Step 3b. Reference data is not here: a fresh
-- install inserts it once, and an upgraded database keeps its own rows.
--

-- The extensions 00-prereqs.sql creates, for a database built before one joined it.
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

ALTER TABLE "company_os"."notification_prefs"
  DROP CONSTRAINT "notification_prefs_kind_check";

ALTER TABLE "company_os"."notifications"
  DROP CONSTRAINT "notifications_kind_check";

ALTER TABLE "company_os"."notification_prefs"
  ADD CONSTRAINT "notification_prefs_kind_check"
    CHECK
    ((kind = ANY (ARRAY['card.completed'::text, 'card.set_aside'::text, 'subtask.done'::text, 'leave.approved'::text, 'leave.withdrawn'::text, 'hire.made'::text, 'deal.won'::text,
    'invoice.paid'::text,
    'idea.reacted'::text,
    'idea.built'::text,
    'idea.picked_up'::text,
    'claim.decided'::text,
    'claim.paid'::text,
    'idea.shipped'::text,
    'kudos.received'::text,
    'card.assigned'::text,
    'card.mentioned'::text,
    'card.commented'::text,
    'card.due_tomorrow'::text,
    'idea.set_aside'::text,
    'training.prep_ready'::text,
    'training.session_today'::text,
    'training.homework_due'::text,
    'training.note_updated'::text,
    'training.recap_ready'::text,
    'training.recap_published'::text,
    'training.weekly_recap_waiting'::text,
    'training.weekly_recap_held'::text,
    'approval.waiting'::text,
    'card.replied'::text,
    'blocker.handed'::text, 'coaching.one_on_one'::text, 'review.needs_you'::text, 'quest.called'::text, 'quest.reacted'::text, 'quest.reactions_waiting'::text])));

ALTER TABLE "company_os"."notifications"
  ADD CONSTRAINT "notifications_kind_check"
    CHECK
    ((kind = ANY (ARRAY['card.completed'::text, 'card.set_aside'::text, 'subtask.done'::text, 'leave.approved'::text, 'leave.withdrawn'::text, 'hire.made'::text, 'deal.won'::text,
    'invoice.paid'::text,
    'idea.reacted'::text,
    'idea.built'::text,
    'idea.picked_up'::text,
    'claim.decided'::text,
    'claim.paid'::text,
    'idea.shipped'::text,
    'kudos.received'::text,
    'card.assigned'::text,
    'card.mentioned'::text,
    'card.commented'::text,
    'card.due_tomorrow'::text,
    'idea.set_aside'::text,
    'training.prep_ready'::text,
    'training.session_today'::text,
    'training.homework_due'::text,
    'training.note_updated'::text,
    'training.recap_ready'::text,
    'training.recap_published'::text,
    'training.weekly_recap_waiting'::text,
    'training.weekly_recap_held'::text,
    'approval.waiting'::text,
    'card.replied'::text,
    'blocker.handed'::text, 'coaching.one_on_one'::text, 'review.needs_you'::text, 'quest.called'::text, 'quest.reacted'::text, 'quest.reactions_waiting'::text])));

COMMENT ON COLUMN "company_os"."notification_prefs"."kind" IS 'The inbox kind. Valid values: [card.completed, card.set_aside, subtask.done, leave.approved, leave.withdrawn, hire.made, deal.won, invoice.paid, idea.reacted, idea.built, idea.picked_up, claim.decided, claim.paid, idea.shipped, kudos.received, card.assigned, card.mentioned, card.commented, card.due_tomorrow, idea.set_aside, training.prep_ready, training.session_today, training.homework_due, training.note_updated, training.recap_ready, training.recap_published, training.weekly_recap_waiting, training.weekly_recap_held, approval.waiting, card.replied, blocker.handed, coaching.one_on_one, review.needs_you, quest.called, quest.reacted, quest.reactions_waiting]';

COMMENT ON COLUMN "company_os"."notifications"."kind" IS 'What kind of fact it is. Valid values: [card.completed, card.set_aside, subtask.done, leave.approved, leave.withdrawn, hire.made, deal.won, invoice.paid, idea.reacted, idea.built, idea.picked_up, claim.decided, claim.paid, idea.shipped, kudos.received, card.assigned, card.mentioned, card.commented, card.due_tomorrow, idea.set_aside, training.prep_ready, training.session_today, training.homework_due, training.note_updated, training.recap_ready, training.recap_published, training.weekly_recap_waiting, training.weekly_recap_held, approval.waiting, card.replied, blocker.handed, coaching.one_on_one, review.needs_you, quest.called, quest.reacted, quest.reactions_waiting]';
