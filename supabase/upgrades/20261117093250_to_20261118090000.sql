-- fork-schema-upgrade: 20261117093250 -> 20261118090000
-- Written by hand, not by scripts/gen-fork-schema.mjs: the generator's delta
-- step needs two throwaway Docker databases, which the authoring machine could
-- not run. CI's fork job proves it: it replays the baseline plus every delta
-- and requires a pg_dump equal to a fresh install of 01-schema.sql version
-- 20261118090000. Apply with scripts/fork-upgrade.sh, which runs it in one
-- transaction and records the new version; README Step 3b.
--
-- What changed upstream (survey categories, PR #2720): migration
-- 20261118090000 adds company_os.surveys.category (nullable, one check, a
-- comment) and appends it to the survey_list view. The migration's backfill of
-- Edge8's own surveys by slug is left out: a fork has none of them.

alter table company_os.surveys
  add column if not exists category text,
  add constraint surveys_category_check
    check (category is null or category in ('workshop', 'employee', 'client'));

comment on column company_os.surveys.category is
  'Who answers the survey, for grouping the admin Surveys list: workshop (workshop, retreat and program attendees), employee (Edge8''s own people) or client (client companies and contacts). Null until set.';

create or replace view company_os.survey_list as
select
  s.id, s.slug, s.name, s.description, s.status, s.intro_text, s.thank_you_text,
  s.metadata, s.created_at, s.updated_at, s.is_anonymous, s.created_by,
  s.archived_at, s.purpose,
  count(r.id)::int                              as response_count,
  max(coalesce(r.submitted_at, r.created_at))   as last_response_at,
  s.category
from company_os.surveys s
left join company_os.survey_responses r on r.survey_id = s.id
group by s.id;
