# ADR 0034 — A second application reaches the database through its own role, a schema of views and an intake table

Date: 2026-10-29. Status: **superseded on 2026-10-29 by Khoa**, after step 4 shipped. The
marketing site reads the shared database with the normal service-role key, as ADR 0022 first
decided. Khoa's reason for the split is only that marketing work ships from its own repository
and Vercel project and cannot break edge8-web's deploys: "that's it, don't over build stuff".

What still stands from this ADR is the App-side preparation it ordered, now on production
(#2404–#2411, #2414):
- the App code that sat in `site` moved to its owners (steps 1 and 2);
- the public frame moved to `kernel/shell` (step 3);
- the contact and careers endpoints moved to crm and hiring.

The new site's forms post to those App endpoints through its own server routes.

What does not stand:
- **The role, views and intake table** (step 4, #2413). They were never used, and
  `site_app` never could log in. Migration `20261029180000_remove_site_schema_and_role`
  (card A.79.11) removes them.
- **The intake drain and reads through views** (A.79.9, A.79.10). Both are cancelled.

The rest of this record is kept as written, so the reasoning that was overruled stays visible.

This ADR amends ADR 0022 (the Marketing site gets its own repository). It changes 0022's
**Reads** decision and reverses its rejection of "a restricted key that can read only `site`
views". 0022 rejected that key "for now", on Khoa's ruling that the content team owns what
breaks. This ADR keeps that ownership and changes only when the team learns of a break: it
moves the warning from production to the App's own migration review.

Both architects of the 29 October review reached this contract independently, after reading
ADR 0022 against ADR 0029.

## Context

ADR 0022 moves the Marketing site to `edge8-ai/edge8-site`. The site leaves the App:

- **Reads**: the site "reads the App's tables directly, with the service-role key"
  (0022:45-48).
- **Writes**: a form "inserts one row into an intake table the App owns" (0022:49-53).
- **Accepted consequences** (0022:85-89): "a column the App drops can break a Marketing site
  page in production, and nothing here will warn about it", and "whoever administers that
  project can read every table".

Read against what the review established, that contract has three faults:

1. **The key is far wider than the job.** The site's job is to insert one row and read a few
   tables. The service-role key bypasses RLS (`kernel/data/supabase.ts:11`), so the site can
   also read and write every table. ADR 0029 says row-level security exists to fence callers
   that are not the App, and the site is the first such caller with its own codebase.
2. **No gate can see the site.** `check:table-ownership`, db-review and CLAUDE.md's search for
   readers stop at the repository's edge. Every column the site reads becomes a public contract
   that nobody declared.
3. **The write path does not exist yet.** No intake table, intake processor or webhook endpoint
   exists (`app/api/webhooks` holds only `resend`). Today the forms are App logic:
   - `site/api/contact/route.ts:2-11` calls `looksSpammy`, `openInquiryRun`,
     `promotePersonToLead` and `recordInquiry` on crm, plus campaigns' `campaignIdForUtm`,
     `getOrCreatePerson` and `notifyOps`;
   - `site/api/careers/apply/route.ts:2-15` calls hiring's screening, `updatePeople` and
     `notifyOps`.

The split also runs through code that is not marketing:

- **`entities/site` is portable, requires nothing, and is required by two entities.**
  - `campaigns` needs the blog's markdown and SEO libraries (`campaigns/lib/blog.ts`,
    `blog-publish.ts`, `writer/step-assemble.ts`).
  - `team` needs the gallery and `PostMeta` (`team/ui/StartHerePanel.tsx:2`).
  - `company-os` (the admin gallery) and `retreats` (`RevealObserver`, `VideoCarousel`,
    `jsonLd` in `retreats/routes/saigon-private/page.tsx:2,17`) import its door too.
- **`site` owns tables that only the App reads.** It owns `gallery_photos` and
  `gallery_photo_people`. Every reader is in the App: the Team Home, team chat tools, retreats'
  photo tagging and company-os's admin gallery.
- **`site` holds App endpoints that ADR 0022 keeps in the App:**
  - `api/ingest` wraps htt;
  - `api/stats` reads the library;
  - `api/unsubscribe` and `routes/unsubscribe` write consent;
  - `routes/help` is the help page.
- **`app/layout.tsx:110` wraps every page, Admin included, in `site`'s `SiteFrame`**, and takes
  four site constants as slots (ADR 0026).
- **The fork receives `entities/site` from edge8-web.** ADR 0022:90 says clients keep their site
  "until a site template is offered". Deleting `entities/site` here deletes it from the fork's
  next sync.

A restricted role is not new here. `20260715120000_admin_chatbot_reader.sql` creates
`chatbot_reader` as a `nologin` role with usage on one schema. Its password is set by hand
after the apply, so it never lives in git, and the App reaches it through a pooler connection
string in an environment variable. The same file records that the database is already shared
with three other applications, whose tables sit in `public`. `edge8-site` is the
first outside application that reads this repository's own tables.

## Decision

**A second application never holds the App's service-role key.** It gets its own Postgres role,
and reaches the database through one schema the App publishes for it:

- **Reads are views in a `site` schema**, owned by the entity that owns the underlying table and
  listed in the manifest:
  - `site.posts` and `site.pillars` belong to campaigns;
  - `site.open_roles` belongs to hiring.

  The site's role has `SELECT` on those views and nothing else. Postgres refuses to drop a
  column or table a view depends on, or change that column's type, unless the migration says
  `CASCADE`. So a migration that would break the site fails when it is applied, inside the
  App's own db-review, and not on the site in production. A renamed column is harmless: the
  view follows the rename and keeps its output name. What a view cannot catch is a change of
  meaning, such as a new `status` value or a column that stops being written. The owner of
  the view answers for that in the PR that makes the change. The home page's figures stay on
  the App's public `/api/stats` (0022:54).
- **The role follows `chatbot_reader`'s pattern.** It is created `nologin` by migration, its
  password is set by hand after the apply, and the site's Vercel project holds only its pooler
  connection string. Its `search_path` is `site` and it has usage on no other schema.
- **Writes are one intake table, `site.intake`,** with a `kind` column (inquiry, application)
  and a JSON payload validated in the App. The role has `INSERT` on it and nothing else. Resumes
  go to `resumes/intake/` as 0022 says.
- **The kernel owns `site.intake` and its drain,** as it owns the event outbox (ADR 0027).
  Each `kind` names one handler in the entity that owns the work: crm handles `inquiry`, and
  hiring handles `application`. The handlers are registered from the composition root, as
  event subscribers are. The kernel names no entity.
- **A row is processed only when its handler succeeds.** Each row has the outbox's claim,
  attempt and processed columns. The drain calls the handler and awaits it; a handler that
  throws or returns `{ ok: false }` leaves the row unprocessed for the next sweep, and a
  database webhook runs the drain at once for speed. This is stricter than the outbox today,
  which marks a row published even when a subscriber failed (backlog BUG-18). So intake does
  not ride the event bus until that is fixed. Processing is idempotent on the intake row's id.
  The handlers run everything the routes run today: the duplicate-person check, spam check,
  lead promotion, inquiry run, resume screening, staff emails and the Lark notice.
- **The contract is pinned on both sides.** The site's repository commits a dump of the `site`
  schema and its generated types. A check in each repository fails when the dump and production
  disagree, as `types-fresh` does here. db-review's catalogue gather includes the `site` schema,
  so a migration that changes a view is reviewed as a contract change.

**The split happens in this order, each step on production before the next:**

1. **Re-home the App code that sits in `site`:** ingest to htt, stats to library, unsubscribe to
   campaigns, help to org, and the gallery and its tables to retreats.
2. **campaigns absorbs the blog's libraries,** and team and company-os take the gallery from
   retreats, so nothing requires `site`.
3. **A public frame moves to `kernel/shell`** for the App's remaining public pages. The root
   layout reads the organisation's identity from `kernel/config` (ADR 0026).
4. **Build the `site` schema, the role, the intake table and its drain,** expand-first, through
   db-review. Move contact and careers onto intake while everything is still in one repository.
5. **Switch the site's reads to the views, still in this repository.**
6. **Give the fork its replacement.** The fork ships the kernel's public frame from step 3
   and a placeholder home page. `fork-sync` stops shipping `entities/site`, and the fork's
   own docs say a client's marketing site is a repository of its own.
7. **Copy the site's code to `edge8-site`,** do 0022's domain work, delete `entities/site`
   here, and regenerate.

## Alternatives rejected

- **Direct reads with the service-role key, as ADR 0022 decided.** It is simpler on day one. It
  hands a second Vercel project a key to every table, and it moves every schema break to
  production, where only a visitor sees it.
- **A JSON API owned by the App for every read.** It adds a deployment-coupled endpoint for
  data that a view serves with no code. `/api/stats` stays because it computes; posts and roles
  do not.
- **The site writes final rows itself.** ADR 0022 already rejected this, for the
  duplicate-person and lead rules.
- **One intake table per kind.** That means two drains and two webhooks for two rows that carry
  the same shape of work.
- **Read the real tables through the role, with no views.** This narrows the key's reach, but
  it keeps 0022's "nothing here will warn": dropping a column a role can select is not refused.
- **`contacts` owns intake.** It is installed in every deployment, but its drain would have to
  reach crm and hiring, which is the wrong direction for a `requires` edge (ADR 0032).
- **The drain publishes one event per row and crm and hiring subscribe.** That is the simplest
  wiring, but the bus swallows a handler's failure, so a failed lead promotion would mark the
  row done. It becomes possible once BUG-18 makes failed handlers retry.
- **Keep a portable skeleton of `site` here for the fork.** Edge8 would then maintain two
  websites that drift apart.
- **Freeze the last `site` in `.github/fork-overlay/`.** It would stop getting fixes and would
  stop compiling as the kernel moves under it.

## Consequences

- The site's role and its policies are written table by table. That is ADR 0029's cost for
  every caller that is not the App.
- A view's columns can change only when the site has stopped reading them. That is ADR 0022's
  "content team fixes it", moved to before the merge.
- `entities/site` leaves the manifest (27 entities become 26), five slots leave `SHELL_SLOTS`,
  and `fork-sync-exclude` loses `site`'s lines. `deployments/minimal.json` does not change,
  because it never held `site`.
- ADR 0024's "no surface becomes a separately deployed front end" names this as its one
  exception.
- 8 Edges clients lose the marketing pages they had in the fork, and keep a public frame and a
  placeholder home. That replaces 0022's "clients keep their site inside their own fork until a
  site template is offered". Parkes, which already has its own repository, is the pattern.
- 0022's two accepted consequences, "nothing here will warn" and "whoever administers that
  project can read every table", no longer hold.

## Decided

Khoa decided all three open questions on 2026-10-29:

1. **The warning moves from production to db-review.** The contract replaces 0022's
   service-role reads.
2. **A client's marketing site is a repository of its own.** The fork ships the kernel's public
   frame and a placeholder home page (step 6).
3. **The kernel owns `site.intake` and its drain,** with one handler per kind in the owning
   entity, and a row counts as processed only when its handler succeeds.

## What would reopen it

The site needing data that a view cannot express, such as a search over many tables or a
computed figure. That data is served by an App endpoint like `/api/stats`, and the contract
gains an API. A second application that needs to write more than intake would also reopen it.
That is a sign it is not a second application, but part of this one.
