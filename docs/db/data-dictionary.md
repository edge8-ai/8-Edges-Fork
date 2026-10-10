# Edge8 Data Dictionary

Purpose: context for AI agents and engineers so that any new application can decide whether an existing table serves it or a new table is needed. Meaning (grain, origin, usage, reuse rules) is written by humans and reviewed like code. Facts (rows, reads, writes) are stamped from the live database and never hand-edited.

This file is the single source of truth. `scripts/data-dictionary/generate.mjs` emits the `COMMENT ON` migration, the lookup index in `.claude/skills/data-dictionary/SKILL.md`, and the Dictionary tab in `public/workflows/private/e8/data-atlas.html`. Edit here, then regenerate; never hand-edit the generated artifacts.

State documented: repo main as of 28 Aug 2026 — the live database (the linked Supabase project, schemas `company_os` + `htt`) plus the five pending rename/drop migrations (`20260828120100`–`120500`). Evidence numbers stamped 28 Aug 2026 from live counters (activity since table creation; renamed tables keep their history). `TODO(owner)` marks statements that need confirmation from whoever owns that area.

---

## Decision rules for agents

Read these before creating any table.

1. Search this dictionary's index by business term and synonyms before designing a new table. If an existing table has the same entity at the same grain, extend it (columns, or `metadata` jsonb for experiments); do not create a sibling.
2. Never write to a table marked "superseded" or "dead" below. Use the named replacement.
3. Anything involving a human references `people.id`. Anything involving an organization references `companies.id`. Do not store names, emails, or org names as plain text columns in new tables.
4. Money columns follow the house pattern: `amount_cents` (int8) + `currency` + `amount_usd_cents` + `fx_rate` where FX applies. Never floats, never a bare `amount`.
5. Soft delete via `archived_at` / `archived_by`. No hard deletes of business records.
6. Sensitive personal data goes in a dedicated `_sensitive` table with its own lockdown (RLS on, no policies, service-role only, revoked from the chatbot reader roles, app-gated by canViewSensitive), never as columns on the main entity. Precedents: `people_sensitive`, `candidate_sensitive`, `compensation_sensitive`.
7. Data owned by an external system (QuickBooks, Stripe, a partner platform) is mirrored, not mastered: carry `source`, `external_id`, `synced_at`, and treat the external system as truth.
8. A new table ships in the same PR as: its dictionary entry here, `COMMENT ON` statements for the table and every column, and FKs into the spine. CI enforces this (`.github/workflows/data-dictionary-gate.yml`).
9. Column comments for enums end with the deterministic suffix: `Valid values: [a, b, c]`.
10. Trust the stamped evidence lines over prose; if they disagree, the prose is stale — fix it.
11. Renames and drops ship with the code that references them (see the deploy-coupling notes in recent migrations) and update this file in the same PR.

## Entry format (parsed by the generator — keep field names exact)

```
### schema.table_name
One row is: <grain, one sentence — becomes the table comment>
Bucket: <master|transactional|other> · <group>
Tier: <1 spine | 2 stage engine | 3 support>
Status: <active | waiting | hold | superseded | dead>
Origin: <who/what writes it; note what never writes it>
Usage: <who reads it; cite evidence>
Reuse: <when a new feature should use this table, and how>
Do not: <known wrong uses; superseded siblings>
Columns:
- column_name: <meaning — becomes the column comment. Enums end with "Valid values: [...]">
Evidence: <generated line>
```

---

## Tier 1 — the spine

### company_os.people
One row is: one human the company has ever touched — staff, client contact, candidate who converted, event attendee, AIO participant once the bridge lands.
Bucket: master · People & org structure
Tier: 1 spine
Status: active
Origin: portal HR flows, recruiting conversion, event and inquiry capture. No external sync writes it today; the planned AIO bridge will upsert participants keyed via a platform-identity mapping table (recreate it when the bridge is built; the original `platform_identities` was dropped 27 Aug 2026 as unreferenced).
Usage: the hottest table in the database — 88 tables reference `people.id`; read by the portal, careers site, coaching, HTT attribution, leave, surveys.
Reuse: any feature that involves a human references `people.id`. Extend with columns only for attributes true of people in general; feature-specific person data gets its own table with a FK.
Do not: store names/emails in other tables; add sensitive fields here (use `people_sensitive`).
Columns:
- id: Primary key.
- email: Case-insensitive email address; the main lookup and dedupe key across CRM, portal auth, and imports.
- full_name: Full name as captured at source; inconsistent ordering (Vietnamese Family-Middle-Given vs Western Given-Family), so UI code prefers `display_name` via `personName()`.
- first_name: Given-name part, when captured separately from `full_name`.
- last_name: Family-name part, when captured separately from `full_name`.
- preferred_name: The name the person actually goes by; preferred over `full_name` in greetings and lists.
- phone: Contact phone number, free text.
- avatar_url: URL of the person's profile photo served from the public avatars storage bucket (see `lib/avatars.ts`).
- lark_dm_opt_out: True when the person asked not to receive Lark DMs from the platform; email still goes out. Read by `kernel/messaging` `sendLarkDm`, so every DM honours it.
- country: Country of residence, free text; backfilled by CRM heuristics scripts.
- timezone: The person's timezone, captured on profile edits and Stripe checkout.
- daily_focus_hours: Hours of hands-on delivery a normal day can carry for this person; the hours rule scales a day's repos down to this total when measured time exceeds it. Default 6.
- is_team_member: Flag marking the person as Edge8 staff, used to scope team lookups and exclude staff from marketing sends.
- do_not_contact: Blunt CRM-wide "never contact this person at all" flag; both this and `marketing_consent` must pass before a marketing email sends.
- owner_id: FK to people; the team member who owns this contact relationship in the CRM.
- source: Free-text provenance label for how the row was created (e.g. `edge8.ai/careers`, `intake`, import script names).
- auth_user_id: Login identity, FK to auth.users; nullable because most people in this table never log in.
- notes: Free-text CRM notes about the person.
- created_at: Row creation time.
- updated_at: Last modification time.
- gender: Self-reported gender, shown on the team profile.
- persona: Which kind of relationship this person is to Edge8. Valid values: [vendor, prospect, client, job_seeker, employee, student].
- linkedin_url: Link to the person's LinkedIn profile.
- city: City of residence, free text.
- state_province: State or province of residence, free text.
- metadata: JSONB escape hatch for experimental attributes; promote to real columns once stable.
- archived_at: Soft-delete timestamp; null means the row is active.
- archived_by: Free-text label (email) of who archived the row.
- emergency_contact_name: Name of the staff member's emergency contact, collected during onboarding.
- emergency_contact_phone: Phone number of the staff member's emergency contact.
- lark_email: Company Lark Mail address, recorded post-hire during onboarding.
- graduated_from: Non-sensitive education field (school or program), shown on the team profile.
- display_name: Canonical Given + Family rendering of the name the person goes by; the one name column safe to sort and abbreviate (see `lib/people-name.ts`).
- marketing_consent: Newsletter consent state, separate axis from `do_not_contact`; `never_asked` is the honest default for imported addresses. Valid values: [subscribed, unsubscribed, never_asked].
- marketing_consent_at: When the consent state last changed (subscribe/unsubscribe or backfill).
- marketing_consent_source: Free-text label for where the consent state came from (e.g. unsubscribe link, backfill tag).
- github_login: GitHub username (citext, unique when set); used by the human-token tracker to resolve PR authors to people.
Evidence: rows 911 · reads 281,793 · inserts 1,048 (stamped 28 Aug 2026)

### company_os.companies
One row is: one external organization in any relationship with us — prospect, client, learner org (post-bridge), partner.
Bucket: master · Customers & partners
Tier: 1 spine
Status: active
Origin: CRM flows and inquiry capture; enriched by hand. The AIO bridge will upsert learner organizations. QuickBooks customers map here via invoice sync.
Usage: 29 tables reference it; 60,101 reads. Deals, invoices, HTT client mapping, interactions all key to it.
Reuse: any org-scoped feature references `companies.id`. `lifecycle_stage` distinguishes prospect / learner / client — extend its values rather than adding boolean flags.
Do not: create per-feature "clients" or "accounts" tables; duplicate org names as text.
Columns:
- id: Primary key.
- name: Company display name; also the upsert/match key when HTT registration scripts create tracker clients.
- industry: Raw free-text industry as entered; kept untouched, with `industry_normalized` holding the taxonomy used by charts and filters.
- size_band: Employee-count band, check-constrained. Valid values: [0-50, 51-250, 251-5000, 5000+].
- country: Country the company operates from; free text, backfilled 2026-07-10.
- owner_id: The person accountable for the relationship, FK to people.
- notes: Internal free-text CRM notes; meeting-note fold-in scripts append here.
- created_at: Row creation time.
- updated_at: Last modification time.
- priority: Manual account priority used to badge and filter the clients list. Valid values: [high, medium, low].
- billing_address: Billing address free text; one of the client-editable fields in the portal profile page.
- metadata: Free-form JSON side-car; known keys include `qbo_customer_ids` and `qbo_customer_ids_aio` (realm-aware QuickBooks customer mapping per legal entity) plus payment details merged by the Stripe webhook.
- archived_at: Soft-archive timestamp; null means the row is active and every query filters on it.
- archived_by: Email of the admin who archived the row; cleared on unarchive.
- lifecycle_stage: The org's account-level sales-funnel stage with Edge8, raise-only via code (never auto-demoted); whether it is a client now comes from `client_start_date`/`client_end_date`, not from this. Valid values: [none, subscriber, lead, mql, sql, opportunity, customer, evangelist].
- industry_normalized: Fixed-taxonomy industry used by charts and filters, check-constrained. Valid values: [Technology & Software, Food & Beverage, Hospitality & Travel, Financial Services, Professional Services, Real Estate & Construction, Retail & Consumer Goods, Manufacturing, Healthcare & Wellness, Legal, Marketing & Media, Education, Logistics & Supply Chain, Energy, Other].
- website_url: Canonical bare host (citext) consolidated from the old domain+website pair; the CRM match/search key for companies.
- client_types: Text array of relationship kinds an org can hold simultaneously; Edge8-internal, never exposed to the portal.
- is_ai_program: Whether this org is in an AI program engagement (true means tracker on, at least one repo); set by the HTT registration pipeline.
- client_start_date: The day the client relationship began. Set on the admin company page, or filled by the QuickBooks invoice sync from the first invoice when empty. With client_end_date, decides current and former clients (kernel/identity/client-status.ts).
- client_end_date: The day the client relationship ends; null means open-ended. Once it has passed the company is a former client: off the Clients list, but its hub and portal stay on.
Evidence: rows 256 · reads 60,101 · inserts 256 (stamped 28 Aug 2026)

### company_os.team_members
One row is: one employment relationship — a person in a seat at one of our legal entities; a person can appear more than once across time.
Bucket: master · People & org structure
Tier: 1 spine
Status: active
Origin: HR onboarding flow on hire; updated on role or entity changes.
Usage: 32 tables reference it; 36,447 reads. Compensation, staff assignments, leave, coaching, and equipment hang off it.
Reuse: employment-scoped facts (comp, leave, assignments) FK here; person-scoped facts (qualifications, identity) FK to `people`.
Do not: conflate with `people` — a team member is always also a person via `person_id`.
Columns:
- id: Primary key.
- person_id: The human behind this employment, FK to people.
- department_id: FK to departments; the org unit this employment belongs to.
- position_id: FK to positions; the job position held.
- manager_id: FK to team_members; the direct manager, used for probation reviews, coaching, and leave approval.
- employee_number: Internal HR employee code, shown on the team profile.
- employment_type: Contractual engagement type; `contract` rows form the contractor roster. Valid values: [full_time, part_time, contract, intern, temp, advisor].
- work_location: Where the person works, free text.
- work_schedule: Name of the work schedule the person follows (for instance Vietnam schedule), free text; backfilled 13 Sep 2026.
- status: Lifecycle state of the employment; most queries filter to `active`. Valid values: [candidate, pre_start, active, on_leave, notice, terminated, alumni].
- start_date: First day of employment; anchor for onboarding cycles and tenure.
- end_date: Last day of employment, set when the person leaves.
- termination_reason: Why the employment ended. Valid values: [voluntary, involuntary, end_of_contract, redundancy, retirement, other].
- created_at: Row creation time.
- updated_at: Last modification time.
- leave_policy_id: FK to leave_policies; which time-off accrual policy applies, assigned by HR.
- employment_stage: Onboarding and off-ramp stage; null means confirmed/regular. Valid values: [pre_boarding, probation, full_time, declined_offer, rescinded, failed_probation].
- probation_ends_on: Date probation ends (defaults to Day 60 from start); drives the probation review window and can be extended.
- contract_start_date: Official contract start date, set to the day after probation ends; the anchor for performance-review scheduling (falls back to `start_date`).
- career_track: Whether the person grows as an individual contributor or a manager. Valid values: [ic, manager].
- career_level: Level on the career ladder, used by performance reviews. Valid values: [junior, collaborator, senior, principal].
- permissions: Admin-granted access beyond what the person's own data implies; `revenue` opens the Revenue section, `payroll` opens Payroll and is granted only by a super admin. Set from the admin Team roster, never by the employee. Valid values: [revenue, payroll].
Evidence: rows 64 · reads 36,447 · inserts 72 (stamped 28 Aug 2026)

### company_os.deals
One row is: one revenue opportunity with one company, moving through one pipeline's stages.
Bucket: transactional · Revenue documents
Tier: 1 spine
Status: active
Origin: sales flows; created from converted leads and inquiries; heavily hand-worked (over 1,000 updates on 138 live rows — the actively managed pipeline).
Usage: pipeline views, forecasting, handoff into delivery, affiliate and referrer attribution.
Reuse: anything that means "potential money from a company" is a deal or a column on deals. New sales motions get a new `pipelines` row, not a new table.
Do not: create parallel opportunity or quote tables; a future CPQ feature should FK to deals.
Columns:
- id: Primary key.
- pipeline_id: FK to pipelines; the pipeline this deal moves through (code selects the oldest active pipeline as the default).
- stage_id: Current pipeline stage, FK to pipeline_stages.
- stage_moved_by: Who is moving the deal to a new stage, set in the same statement as stage_id; a trigger copies it to deal_stage_log.moved_by and clears it. Null means the writer did not say (A.32, ADR-0011).
- stage_move_note: Why the deal is moving, set with stage_id; copied to deal_stage_log.note by a trigger and cleared (A.32, ADR-0011).
- title: Short deal label, e.g. "<person name> - SDR handoff" for handoff-created deals.
- person_id: FK to people; the primary contact on the deal.
- company_id: FK to companies; the account the revenue belongs to.
- amount_cents: Deal value in minor units with currency; amount_usd_cents/fx_rate carry the normalized figure.
- currency: ISO currency code of amount_cents, stored lowercase (e.g. usd).
- status: Deal outcome, set from the stage by a database trigger on every write, so it cannot disagree with the stage (is_won stage -> won, is_lost -> lost, else open; ADR-0011). Valid values: [open, won, lost].
- probability: Forecast percentage 0-100; entering the Contract Sent stage sets it to 90 once, later manual overrides stick.
- owner_id: FK to people; the team member who owns/closes the deal.
- affiliate_id: FK to affiliates; attributes the deal to a referral code.
- source: Free-text origin tag of the deal, e.g. `sdr_handoff` or `portal_build_team`.
- expected_close_date: Rep-entered date the deal is expected to close; used in pipeline forecasting views.
- closed_at: When the deal was closed (won or lost); set by the trigger on entering Won or Lost and cleared in an open stage.
- metadata: Free-form JSON side-car; edges metrics read a `categories` array (e.g. `[{"name":"AI Program"}]`) from it.
- created_at: Row creation time.
- updated_at: Last modification time.
- service_line_id: FK to service_lines; the business unit/offering the revenue belongs to.
- next_step: Free-text next action the rep has committed to on this deal.
- next_step_date: Date the next step is due.
- handoff_status: State of the SDR-to-closer handoff contract; deals created from the lead queue start pending until the closer decides. Valid values: [pending, accepted, rejected].
- handoff_rejected_reason: Why the closer rejected the handoff; required on reject. Valid values: [not_qualified, bad_fit, duplicate, bad_timing, other].
- handoff_note: Optional free-text note the closer attaches to the accept/reject decision.
- handoff_decided_at: When the closer accepted or rejected the handoff.
- lost_reason: Why a lost deal was lost; filled on close-lost only, and cleared by the trigger once the deal is not lost.
- archived_at: Soft-archive timestamp; null means active.
- archived_by: Email of the admin who archived the deal.
- amount_usd_cents: USD-normalized deal value in cents, derived by the deals_derive_usd trigger from amount_cents and the cached rate in fx_rates whenever the amount or currency changes; NULL when the currency has no cached rate. Never written by hand; prefer this when aggregating across currencies.
- fx_rate: Currency-to-USD rate the trigger used for amount_usd_cents (1 for USD); fx_rate_fetched_at is when that cached rate was refreshed.
- campaign_id: FK to marketing_campaigns; the campaign this deal is attributed to, set by hand on the deal form until intake carries it.
- fx_rate_fetched_at: When the FX rate was fetched.
- proposal_url: Link to the proposal document for this deal.
- contract_url: Link to the contract document for this deal.
- referrer_id: Person who referred this deal, FK to people - the referral loop is load-bearing.
- position: Manual 0-based ordering of the deal within its stage on the board/list; backfilled from created_at desc at rollout.
- referrer_company_id: Company that directly referred this deal (mirrors person referrer_id); attributes referred deals to a company affiliate, FK to companies.
Evidence: rows 138 · reads 5,898 · inserts 191 (stamped 28 Aug 2026)

### htt.pull_requests
One row is: one pull request observed in a tracked client or internal repo — the raw evidence of engineering effort.
Bucket: transactional · Effort & value measurement
Tier: 1 spine
Status: active
Origin: written only by the nightly GitHub sync (the `human-tokens` service account). Humans never write it. Not reliably re-fetchable once repo access lapses — treat as original data despite being a sync target.
Usage: the mint engine derives `token_entries` from it; project summaries and client-facing burn reporting read it. Largest table owned (5,230 rows).
Reuse: consume read-only; effort analytics build views over it.
Do not: hand-correct rows (the `pr_attribution_overrides` correction table was dropped 27 Aug 2026 — recreate an overrides mechanism rather than editing raw rows); join clients by name (use `client_identities`).
Columns:
- id: Primary key.
- repo_id: FK to htt.repos; the repository this PR belongs to.
- github_pr_id: Global numeric GitHub PR id; the sync's upsert conflict key (unique).
- number: PR number within the repo.
- title: PR title from GitHub.
- author_login: GitHub login of the PR author; the configured central service identity is substituted only when GitHub reports the author as unknown.
- author_person_id: FK to people; the real human author, resolved from the PR body's author block email first, then the GitHub login; null counts as unattributed in sync runs.
- url: GitHub web URL of the PR.
- state: GitHub PR state. Valid values: [open, merged, closed].
- status: Token-accounting verification state of the PR. Valid values: [tracked, verified, disputed, excluded].
- opened_at: When the PR was opened on GitHub.
- merged_at: When the PR was merged; null if not merged.
- closed_at: When the PR was closed; null while open.
- head_branch: PR head ref (branch name) from the GitHub API; joined against `token_entries.session_branch` on the same repo, using per-branch time windows, to attribute session tokens to this PR.
- session_id: Claude Code session UUID parsed from the PR body's Claude-Session trailer line (stamped by the client repo's committed git hook); groups PRs from one sitting; null when the PR carries no sane trailer.
- session_started_at: Session start instant parsed from the PR body's Claude-Session-Start trailer line; self-reported by the contributor machine, and the sync rejects a start at or after opened_at; capture-only today — no mint rule reads it yet.
- session_start_source: Provenance of the session columns, so trailer rows never masquerade as telemetry-grade data. Valid values: [commit-trailer].
- created_by: Audit label (text) of who or what created the row.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 5,230 · reads 7,011 · inserts 5,387 (stamped 28 Aug 2026)

### htt.model_prices
One row is: one Claude model's Anthropic list price (USD per 1M tokens) plus its prompt-cache multipliers, used to price `htt.token_entries` usage components at read time.
Bucket: other · Effort & value measurement
Tier: 3 support
Status: active
Origin: seeded by migration `20260907180000_htt_usage_components_and_model_prices.sql`; edited only through the service role (Supabase Studio or SQL) when Anthropic changes list prices. Never written by app code or contributors.
Usage: read by any future AI-cost figure that multiplies `token_entries.input_tokens` / `output_tokens` / cache columns by these rates; sibling of `public.model_prices` in human-token-tracker PR #158. Not yet read by edge8-web code.
Reuse: any Edge8-side cost-of-delivery computation reads rates from here rather than hardcoding them; pricing is applied at read time so a rate change reprices every v2 row without a backfill.
Do not: store a priced dollar figure on `token_entries`; confuse this (Edge8's cost of delivery) with a client's negotiated billing rate.
Columns:
- model: Primary key; the Claude model id as the CLI reports it (e.g. `claude-opus-5`).
- input_usd_per_million: List price of uncached input tokens, USD per 1M.
- output_usd_per_million: List price of output tokens (incl. thinking), USD per 1M.
- cache_write_5m_multiplier: Prompt-cache write with 5-minute TTL, as a multiple of the input price. Default 1.25.
- cache_write_1h_multiplier: Prompt-cache write with 1-hour TTL, as a multiple of the input price. Default 2.0.
- cache_read_multiplier: Prompt-cache read, as a multiple of the input price. Default 0.10.
- notes: Free-text provenance (e.g. seed date, price-change source).
- updated_at: Last modification time; maintained by the `htt.set_updated_at` trigger.

### htt.token_entries
One row is: one minted human-token record attributed to a person, repo, and client for a span of work.
Bucket: transactional · Effort & value measurement
Tier: 1 spine
Status: active
Origin: written by the mint engine from `pull_requests`; humans never insert directly. Span tiling is the settled minting spec; tenths are the final granularity.
Usage: the evidence behind renewal and referral conversations; wallet and burn reporting (UI vocabulary: burnt / allotted / unburnt only — never hours).
Reuse: read-only for consumers; derived value metrics are views on top, not sibling tables.
Do not: over-count under any tuning (under-count anomalies are acceptable, over-count never); introduce hours as a UI unit downstream.
Columns:
- id: Primary key.
- company_id: FK to companies; denormalized owning company for fast filtering and burn rollups.
- repo_id: FK to htt.repos; the repo the tokens were spent on; rows stay repo-scoped when no PR can be attributed.
- pull_request_id: FK to htt.pull_requests; back-filled by the attribution pass that matches `session_branch` to a PR's `head_branch` within its time window; null means repo-scoped only.
- person_id: FK to people; the real human contributor; null for owner/client effort and app rows.
- kind: What the amount measures. Valid values: [human, claude, app].
- amount: Token amount: raw model tokens for kind `claude`/`app`; centihours of active human effort (hours * 100) for kind `human`.
- source: How the entry was produced. Valid values: [pr_commit, pr_review, planning, design, research, manual, session, app].
- occurred_at: Instant the work or usage happened (session end for telemetry rows; noon UTC of the day for app rows).
- occurred_on: Calendar day for per-day keyed rows (human effort and app tokens); part of the daily dedup indexes; null for per-session claude rows.
- status: Review state of the entry. Valid values: [recorded, approved, disputed, excluded].
- session_branch: Git branch the Claude Code session was on at SessionEnd; the exact correlation key used to back-fill `pull_request_id`; null rows stay repo-scoped.
- session_id: Claude Code session id; idempotency key as (session_id, kind), with effort-log human rows suffixed `-h` so they never collide with the claude row.
- model: Dominant model by API-call count for the session (telemetry schema v2, edge8-telemetry >= 1.3.0). Null for pre-v2 rows and for `human`/`app` rows.
- input_tokens: Uncached input tokens (schema v2). Null = pre-v2 row. Priced at read time against `htt.model_prices`, never stored priced.
- output_tokens: Output tokens including thinking (schema v2). Null = pre-v2 row.
- cache_write_tokens: Total prompt-cache write tokens (schema v2). May exceed the 5m + 1h split when the CLI gave no TTL breakdown; the remainder is priced as 5m.
- cache_write_5m_tokens: Prompt-cache writes with the 5-minute TTL (schema v2); 0 when the CLI gave no split.
- cache_write_1h_tokens: Prompt-cache writes with the 1-hour TTL (schema v2); 0 when the CLI gave no split.
- cache_read_tokens: Prompt-cache read tokens (schema v2). Not part of `amount` for kind `claude`.
- created_by: Audit label (text) of who or what created the row.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 1,083 · reads 2,531 · inserts 1,762 (stamped 28 Aug 2026)

---

## Security boundaries (empty or small by design — never judge by row count)

### company_os.people_sensitive
One row is: one person's sensitive personal attributes, split from `people` so broad reads can never see them.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR flows gated by canViewSensitive.
Usage: super-admin people views only. RLS on, no policies, service-role only.
Reuse: any new sensitive person attribute goes here, not on `people`.
Columns:
- person_id: Primary key and FK to people; one restricted legal/payroll PII row per person, readable only via the service-role client after `canViewSensitive()`.
- date_of_birth: Date of birth, for HR/legal records.
- national_id_number: Vietnamese national ID (CCCD) number.
- national_id_issue_date: Issue date printed on the national ID.
- national_id_issue_place: Issuing authority/place printed on the national ID.
- permanent_address: Permanent (registered) address, as on legal documents.
- current_address: Current residential address.
- marital_status: Marital status, for HR records.
- bank_name: Bank the salary is paid into, collected during onboarding.
- bank_account_number: Salary bank account number.
- bank_branch: Branch of the salary bank account.
- tax_code: Personal income tax code.
- social_insurance_number: Vietnamese social insurance number.
- id_front_path: Storage path of the ID-card front image in the private `id-documents` bucket; served only via short-lived signed URLs.
- id_back_path: Storage path of the ID-card back image in the private `id-documents` bucket.
- id_selfie_path: Storage path of the ID-verification selfie in the private `id-documents` bucket, uploaded during onboarding.
- notes: Free-text notes on the sensitive record; audit log records that it changed, never its value.
- created_at: Row creation time.
- updated_at: Last modification time.
- place_of_birth: Place of birth, as on legal documents.
- native_province: Native province (que quan), a standard Vietnamese HR field.
Evidence: rows 31 · reads 677 · inserts 31 (stamped 28 Aug 2026)

### company_os.candidate_sensitive
One row is: one candidate's sensitive attributes (salary expectation, recruiter-verified and AI-extracted), split from `candidate_profile` so broad ATS reads can never see them.
Bucket: master · Candidates
Tier: 3 support
Status: active
Origin: recruiter flows gated by canViewSensitive; hardened 26 Aug 2026 and explicitly revoked from `chatbot_reader`.
Usage: super-admin candidate views only. Zero rows today is deliberate: relocated for future writes.
Reuse: any new sensitive candidate attribute goes here, mirroring the `people_sensitive` convention.
Do not: put salary or PII on `candidate_profile` or `applications`; those are read broadly, including by the interview-panelist AI prompt.
Columns:
- person_id: Primary key and FK to people; one restricted candidate-salary row per candidate, gated on `canViewSensitive()` (super admins only).
- salary_expectation_cents: Recruiter-entered structured salary expectation, in minor units of the currency; never written to the audit log.
- salary_expectation_currency: Currency of the structured salary expectation.
- ai_salary_expectation: Free-text salary expectation extracted by the AI resume screener; not editable in the recruiter form.
- notes: Free-text sensitive notes on the candidate.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 0 · reads 5 · inserts 0 (stamped 28 Aug 2026)

### company_os.compensation_sensitive
One row is: one compensation arrangement for a team member, effective-dated with approver — real pay data.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR comp-change flows with `approved_by` and `change_reason`; renamed from `compensation` 28 Aug 2026 to match the `_sensitive` convention.
Usage: admin comp views and contractor payment calculation, gated by canViewSensitive; blocked by name in the NL-to-SQL assistant block-lists.
Reuse: comp history extends here (`effective_from`/`effective_to`, `is_current`); never store pay on `team_members` or `people`.
Columns:
- id: Primary key.
- team_member_id: FK to team_members; whose pay arrangement this row is.
- comp_type: What kind of pay the row records; `base_salary` rows are employee salaries, `hourly`/`overtime`/`billable` are contractor rates. Valid values: [base_salary, hourly, bonus, commission, equity, stipend, allowance, overtime, billable].
- amount_cents: Generic amount in minor units of `currency`; for salary rows it mirrors `salary_usd_cents` so non-salary readers still see a value.
- currency: ISO-ish currency code of `amount_cents` (e.g. `usd`).
- pay_period: How often the amount is paid. Valid values: [annual, monthly, semi_monthly, biweekly, weekly, hourly, one_time].
- effective_from: Start date of this comp arrangement; history is kept as rows, not overwrites.
- effective_to: End date of the arrangement; a salary change closes the old row by setting this to the new row's `effective_from`.
- is_current: Whether this is the active arrangement for the team member.
- change_reason: Free-text reason for the change (raise, promotion, correction).
- approved_by: FK to team_members; approver of the change. Currently left null by app code - the approver is recorded in the audit log instead.
- notes: Free-text notes on the arrangement.
- created_at: Row creation time.
- updated_at: Last modification time.
- salary_vnd: Salary in whole VND; with `salary_usd_cents` this dual-currency pair is the record of truth for base salaries.
- salary_usd_cents: Salary in USD cents, converted from VND at a fixed 25,500 VND/USD rate (not live fx).
Evidence: rows 37 · reads 461 · inserts 37 (stamped 28 Aug 2026)

### company_os.payroll_runs_sensitive
One row is: one month's payroll for one of our legal entities, as the accountant's workbook for that month states it.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: the payroll importer, from the monthly workbook (the workbook is the source of truth); history from Jan 2024. A later upload tool writes it the same way.
Usage: the Payroll admin screens, behind the `payroll` team permission; blocked by name in the NL-to-SQL assistant block-lists.
Reuse: every payroll month, for any entity, is a row here; its people are rows in `payroll_lines_sensitive`. Totals are summed from the lines, never stored.
Do not: store salary arrangements here (that is `compensation_sensitive`); read it without the payroll permission.
Columns:
- id: Primary key.
- legal_entity_id: FK to legal_entities; the employer that ran this payroll.
- period: First day of the month the payroll pays.
- status: Where the run stands; imported history is `paid`. Valid values: [draft, approved, paid].
- is_estimate: True when the workbook marks the month as an estimate rather than the final payroll.
- working_days: Standard working days in the month, from the workbook.
- source_file: File name of the workbook the run was imported from.
- imported_at: When the importer last wrote this run.
- imported_by: Email of the person who ran the import.
- notes: Free-text notes on the run.
- created_at: Row creation time.
- updated_at: Last modification time.
- archived_at: Soft-delete time; an archived run is ignored by every reader.

### company_os.payroll_lines_sensitive
One row is: one team member's pay in one payroll run, every figure of the workbook's register row in whole VND.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: the payroll importer, one line per register row, matched to its team member by tax code or ID number first and name second; a run with an unmatched name is not written.
Usage: the Payroll admin screens and the Payroll tab of a team member profile, behind the `payroll` team permission; blocked by name in the NL-to-SQL assistant block-lists.
Reuse: any per-person payroll figure lives here; a one-off item the workbook adds for a month (13th salary, PIT refund, a correction) goes in `adjustments`, not a new column. Money is whole VND in `_vnd` columns, following `compensation_sensitive.salary_vnd`.
Do not: repeat tax code, national ID or bank account here (they live on `people_sensitive`); write salary history from it (that is `compensation_sensitive`).
Columns:
- id: Primary key.
- payroll_run_id: FK to payroll_runs_sensitive; the month and employer this line belongs to.
- team_member_id: FK to team_members; the employment this line paid.
- position: Position as printed on the workbook that month.
- on_probation: Whether the workbook marks the person as on probation that month.
- dependents: Number of registered dependents used for the family deduction.
- contract_salary_vnd: Monthly contract salary in whole VND.
- days_worked: Days worked in the month.
- gross_salary_vnd: Salary earned for the days worked, before allowances, in whole VND.
- lunch_allowance_vnd: Lunch allowance, tax free, in whole VND.
- internet_allowance_vnd: Internet allowance in whole VND.
- phone_allowance_vnd: Telephone allowance in whole VND.
- other_allowance_vnd: Any other allowance the workbook lists, in whole VND.
- bonus_vnd: Bonus paid in the month, in whole VND.
- overtime_vnd: Overtime pay, tax free, in whole VND.
- overtime_hours: Overtime hours worked in the month.
- total_income_vnd: Total income in the month, in whole VND.
- insurance_base_vnd: Salary the insurance contributions are computed on, in whole VND.
- employee_si_vnd: Employee social insurance contribution in whole VND.
- employee_hi_vnd: Employee health insurance contribution in whole VND.
- employee_ui_vnd: Employee unemployment insurance contribution in whole VND.
- self_deduction_vnd: Personal income tax self deduction in whole VND.
- family_deduction_vnd: Personal income tax family deduction for dependents in whole VND.
- taxable_income_vnd: Income subject to personal income tax, in whole VND.
- pit_vnd: Personal income tax withheld, in whole VND.
- net_salary_vnd: Net salary after insurance and tax, in whole VND.
- employer_si_vnd: Employer social insurance contribution in whole VND.
- employer_hi_vnd: Employer health insurance contribution in whole VND.
- employer_ui_vnd: Employer unemployment insurance contribution in whole VND.
- other_receivable_vnd: Other amounts the company recovers from the person this month, in whole VND.
- other_payable_vnd: Other amounts the company owes the person this month, in whole VND.
- paid_vnd: Amount actually paid to the person's bank account, in whole VND.
- unpaid_leave_days: Days of unpaid leave taken in the month, from the timesheet.
- annual_leave_days: Days of annual leave taken in the month, from the timesheet.
- adjustments: One-off labelled amounts the workbook adds for this month, as a list of label and amount_vnd pairs.
- source_row: Row number of the register line in the source workbook.
- created_at: Row creation time.
- updated_at: Last modification time.

---

## Tier 2 — stage engines

### Attract

### company_os.events
One row is: one event we run or speak at — workshop, retreat, talk night — with capacity, dates, and status.
Bucket: master · Products & offerings
Tier: 2 stage engine
Status: active
Origin: events admin flows.
Usage: 5 tables reference it (registrations, agenda, P&L, talks, products); 4,054 reads — the events surface and public pages.
Reuse: new event-scoped features FK to `events.id`; ticketing links via `products.event_id`.
Columns:
- id: Primary key.
- slug: Unique URL slug identifying the event; also the join key for the products backfill from `cohort_slug`.
- type: Kind of event. Valid values: [retreat, workshop, webinar, micro_session, dinner, private_trip, company_event].
- status: Event lifecycle state; `register_for_event` only accepts registrations while `open`. Valid values: [draft, published, open, closed, completed, cancelled].
- visibility: Who can see the event. Valid values: [public, private, internal].
- title: Display title of the event.
- blurb: Short teaser text for listings.
- description: Long-form event description.
- location: Free-text venue/city of the event.
- starts_at: Event start instant.
- ends_at: Event end instant.
- timezone: IANA timezone the event runs in; defaults to `Asia/Ho_Chi_Minh`.
- capacity: Total seat cap; `register_for_event` counts held seats as sum(1 + guest_count) and waitlists past this; null means uncapped.
- cover_image_url: URL of the event's cover image (event-media storage bucket).
- owner_person_id: FK to people; the internal owner responsible for the event.
- landing_path: Site-relative path of the event's landing page; the portal links here instead of the default `/events/[slug]` page when set.
- feedback_survey_id: FK to surveys; the post-event feedback survey, validated to exist before linking and used to send feedback requests.
- notes: Internal admin notes on the event.
- metadata: Free-form JSON (e.g. backfill markers); defaults to `{}`.
- archived_at: When the event was archived out of admin lists; null while live.
- created_at: Row creation time.
- updated_at: Last modification time.
- media: Ordered gallery JSON array of `{kind: image|video, url, caption}`; images live in the event-media bucket, videos are external URLs embedded by the public page.
- attendee_count_override: Manual headcount for events measured without a registration list (keynotes, workshops); admin shows coalesce(this, active registrations + guests).
- registered_count_override: Manual override for the admin "registered" count for headcount-measured events; null derives it from event_registrations.
Evidence: rows 22 · reads 4,054 · inserts 22 (stamped 28 Aug 2026)

### company_os.event_registrations
One row is: one person's registration for one event, from signup through attendance.
Bucket: transactional · Revenue documents
Tier: 2 stage engine
Status: active
Origin: public registration flows and admin entry.
Usage: 10,349 reads — event pages, capacity checks, follow-up.
Reuse: attendance-scoped facts extend here; the registrant is a `people` row.
Columns:
- id: Primary key.
- order_id: FK to orders; the payment order behind a paid registration (set by the Stripe webhook flow); null for free/manual registrations.
- product_id: FK to products; the ticket tier purchased, whose own `capacity` is enforced per tier at registration.
- person_id: FK to people; the CRM person who registered.
- attendee_name: Name of the attendee as entered at registration (may differ from the person record).
- attendee_email: Attendee email (citext); part of the registration idempotency check per event and person.
- status: Registration lifecycle state; legacy `confirmed` is read as `registered` and never rewritten, and `pending_payment`/`registered`/`attended`/`confirmed` hold seats. Valid values: [confirmed, refunded, pending_payment, registered, waitlisted, cancelled, attended, no_show].
- created_at: Row creation time.
- event_id: FK to events; the event this registration belongs to.
- guest_count: Extra guests on this registration; each row holds 1 + guest_count seats against event and tier capacity.
- waitlist_position: Position in the waitlist queue when the event was full at registration; null otherwise.
- ticket_code: Unique 12-char Crockford base32 ticket code (crypto-random, no I/L/O/U), generated by `new_ticket_code()` and looked up by the `/t/[code]` ticket page.
- checked_in_at: When the attendee was checked in at the door; set together with status `attended`, cleared when check-in is undone.
- confirmation_sent_at: When the registration confirmation was sent; defined by the lifecycle migration but has no writer in the current codebase.
- cancelled_at: When the registration was cancelled; null while active.
- notes: Internal admin notes on the registration.
Evidence: rows 14 · reads 10,349 · inserts 18 (stamped 28 Aug 2026)

### company_os.marketing_content
One row is: one planned or published piece of marketing content (blog, email, social, broadcast) with channel, status, and authored body.
Bucket: transactional · Marketing & content execution
Tier: 2 stage engine
Status: active
Origin: marketing planning flows and content production; renamed from `marketing_calendar` 28 Aug 2026, `body_html` added for authored email/content HTML.
Usage: the marketing workspace (15,218 reads); images live in `marketing_asset_images` keyed by `entry_id`.
Reuse: any new content type is a channel/status value here, not a new table — this is the one content table after the unused content_* system was dropped.
Do not: recreate a separate calendar or content system; the 27 Aug cleanup removed six unused content tables.
Columns:
- id: Primary key.
- title: Title of the content piece.
- brand_id: FK to brands; which identity (Edge8, AI Officer) the content publishes as.
- pillar: Legacy free-text pillar label, superseded by `pillar_id` and left in place unwritten.
- channel: Publishing channel for the piece. Valid values: [blog, email, linkedin, facebook, twitter].
- status: Workflow state on the content kanban. Valid values: [idea, drafted, approved, scheduled, published, skipped].
- publish_date: Planned publish date on the calendar.
- parent_id: FK to marketing_content; the repurposing waterfall — a channel derivative points at its core asset (usually the blog post).
- copy_md: The drafted content body in markdown.
- asset_url: Source asset URL for the piece; distinct from `posted_url` (where it went live).
- notes: Free-form working notes on the entry.
- sort_order: Kanban rank within a status column; double precision so a drag between two cards is a midpoint write, not a column renumber.
- created_by: Who created the entry.
- created_at: Row creation time.
- updated_at: Last modification time.
- pillar_id: FK to marketing_pillars; the brand's controlled content pillar for reporting.
- posted_url: The live URL after publishing — recorded manually for social posts, stamped with the blog URL by the publish flow.
- blog_style: Blog style slug chosen from the brand's style catalogue (e.g. `thesis`, `case-study`).
- image_type: How the visual is sourced. Valid values: [real, ai, mixed, none].
- seo_md: The loose SEO deliverable in markdown (title tag, meta, slug, keywords); parsed once at blog publish into the normalized columns below, never re-parsed at render.
- image_brief_md: The design brief for the visual (concept and palette).
- image_style: Aesthetic style slug for the image (e.g. `pop-art`); distinct from `image_type`, which is the source.
- social_style: Social post style slug (e.g. `hook-story`, `hot-take`).
- image_url: URL of the rendered hero/social image in the public `marketing` storage bucket; mirror of the selected `marketing_asset_images` row.
- broadcast_id: FK to email_campaigns; the actual email send linked to this entry, so the calendar shows true send status.
- campaign_id: FK to marketing_campaigns; the umbrella campaign this asset belongs to (nullable — assets can exist without one).
- slug: Public blog URL slug; unique among published blog entries via a partial index.
- title_tag: SEO title tag, normalized from `seo_md` at publish time.
- meta_description: SEO meta description for the public blog page.
- excerpt: Short summary shown on blog listing cards.
- primary_keyword: Primary SEO keyword for the post.
- category: Blog category display name (e.g. `Innovation`).
- category_slug: Blog category slug (e.g. `innovation`).
- read_time: Precomputed `N min read` label, set at publish.
- published_at: When the blog post went live.
- body_html: The authored email/content HTML, which references image-library images by URL; added alongside the marketing_calendar to marketing_content rename.
Evidence: rows 107 · reads 15,218 · inserts 120 (stamped 28 Aug 2026)

### company_os.affiliates
One row is: one affiliate partner who can be attributed on deals, orders, and subscriptions.
Bucket: master · Customers & partners
Tier: 2 stage engine
Status: active
Origin: partnerships flows.
Usage: 7 tables reference it; commission and payout records key to it.
Reuse: partner-attribution features FK here; the person behind an affiliate is a `people` row.
Columns:
- id: Primary key.
- code: Unique referral code (citext, e.g. SPRINGSALE) the customer uses at checkout; policy since 2026-07-17 is one active code per person.
- person_id: FK to people; the individual affiliate, or for a company affiliate the acting/portal contact who picks the redemption choice.
- rate: Legacy default commission rate kept for the NOT NULL column (0.20 on insert); the realized rate is a per-commission redemption choice (0.20 work credit / 0.10 cash) on affiliate_commissions.
- program_type: How the code compensates: commission accrues referral revenue, discount gives the buyer a price cut and earns nothing. Values seen in code: [commission, discount].
- stripe_coupon_id: Stripe coupon backing the code's checkout discount, when one exists.
- active: Whether the code is live; consolidation deactivates (never deletes) codes so history and commissions are preserved.
- notes: Free-text admin notes; deactivations and referral context are appended here as an audit trail.
- created_at: Row creation time.
- updated_at: Last modification time.
- company_id: The affiliate company when this is a company affiliate (the primary case); at least one of company_id/person_id is set, FK to companies.
- code_discount: TODO(owner): purpose unclear from code.
- code_commission: TODO(owner): purpose unclear from code.
- referred_by: TODO(owner): purpose unclear from code.
Evidence: rows 11 · reads 940 · inserts 12 (stamped 28 Aug 2026)

### Convert

### company_os.lead
One row is: one inbound or sourced lead before qualification — the rawest stage of the funnel.
Bucket: transactional · Pipeline activity
Tier: 2 stage engine
Status: active
Origin: website capture and CRM intake (the crm-lead skill writes here).
Usage: CRM triage views (3,084 reads); converts into deals.
Reuse: lead-stage attributes extend here; once qualified, the record's meaning moves to `deals`.
Do not: revive `touchpoints` (dropped) — activity logging belongs on `interactions`.
Columns:
- id: Primary key.
- person_id: FK to people, unique - one lead-satellite row per person actively being worked as a lead.
- status: Where the person sits in the SDR working queue; active statuses are new/attempting/connected/meeting_booked. Valid values: [new, attempting, connected, meeting_booked, open_deal, unqualified, nurture].
- sla_due_at: Speed-to-lead deadline; set to now + 4 hours (default) when the person is promoted to the queue, and drives queue ordering.
- attempt_count: Number of contact attempts the SDR has logged against this lead.
- disqualified_reason: Why the lead was unqualified; cleared when the person is re-promoted.
- owner_id: FK to people; the SDR who owns working this lead.
- source: Free-text acquisition channel of the lead row; carried from the promotion context.
- created_at: Row creation time.
- updated_at: Last modification time.
- pinned_at: Manual boost above the SLA-ordered queue; null = not pinned, pinned leads sort by pinned_at desc ahead of SLA/age.
Evidence: rows 46 · reads 3,084 · inserts 80 (stamped 28 Aug 2026)

### company_os.inquiries
One row is: one inbound inquiry from a public form or channel, with routing status.
Bucket: transactional · Pipeline activity
Tier: 2 stage engine
Status: active
Origin: public website forms.
Usage: CRM intake triage (5,025 reads).
Reuse: new public capture forms write here (or to `lead`), not to new tables. TODO(owner): the lead/inquiry split predates the current CRM — confirm which is canonical intake.
Columns:
- id: Primary key.
- person_id: FK to people; who sent the inbound message (created/upserted by email on intake).
- type: What kind of inbound this is; `consultation` (and other sales types) show on the sales board while non-sales types are filtered off it. Values seen in code: [consultation, retreat, general, trip, checkout, newsletter].
- subject: Short subject line, e.g. "AI Audit Request" from the contact form or the portal work-request subject.
- message: The inbound message body as submitted.
- source: Origin channel of the inquiry, e.g. `edge8.ai` or `portal`.
- source_site: Website domain the inquiry was submitted from, e.g. edge8.ai or infiniteleverage-8.com.
- status: Four working funnel stages plus terminal exits; the Stripe webhook advances retreat inquiries to won on payment. Valid values: [new_lead, contacted, qualified, no_action, spam, won, archived].
- deal_id: FK to deals; links the inquiry to the deal it produced.
- affiliate_id: FK to affiliates; attribution of the inquiry to a referral code (no active writer in current code).
- metadata: Free-form JSON side-car; the contact form stores company/team_size/name/email here, and the Stripe webhook merges payment details on won.
- created_at: Row creation time.
- campaign_id: FK to marketing_campaigns; the campaign the inquiry arrived through, when the intake form carries one.
Evidence: rows 171 · reads 5,025 · inserts 317 (stamped 28 Aug 2026)

### company_os.inquiry_triage
One row is: one inquiry's run through the inquiry-to-lead chain — where the run is, what the qualifier model read in the visitor's message, where the chain filed it, and whether a person corrected the read.
Bucket: transactional · Pipeline activity
Tier: 2 stage engine
Status: active
Origin: Z.11 (Automation Plan R1, 2026-10-09). Opened by the contact route (entities/site/api/contact) when an inquiry is written and the chain is not off; advanced by the crm lead-driver tick driver (ADR 0015: the run's step lives in the owner's table); corrected and restarted by the qualifier actions on the Leads queue and the Inquiries board. Written only by entities/crm.
Usage: the qualifier's read on the Leads card (fit chip, reasons, suggested GPCT); the Inquiries board's chips, held-as-spam strip and run panel; the lead driver's due list; the Z.15.9 watchdog check.
Reuse: the one record of what the qualifier model said about an inquiry. A suggestion here is never a fact: the person's own GPCT answers live in person_qualifications, and the inquiry's routing status stays on inquiries.status.
Do not: copy gpct_suggested into person_qualifications without a person pressing Use these and Save; store the visitor's name, email address, phone or message text here (the message stays on inquiries); read verdict as a disqualification (the chain never disqualifies a lead).
Columns:
- inquiry_id: The inquiry this run is for; primary key, so one run per inquiry, and the row goes when the inquiry does.
- mode: How the run was opened, fixed at intake from the chain's switch. live: the contact route left promotion and the Operations line to the chain. shadow: the route took the path it takes with the chain off, and the chain only records what it would have done. Valid values: [live, shadow]
- step: Where the run is (ADR 0015). qualify, file and notify are advanced by the lead driver; done is finished; stopped carries its error until a person presses Read again. Valid values: [qualify, file, notify, done, stopped]
- started_at: The run's epoch, part of every step's tick key and of the fence on every step's write; reset by Read again, so a restarted run gets fresh ticks and an old step cannot write over it.
- error: Why the last step failed or the run stopped; required when step is stopped, cleared by Read again.
- verdict: The qualifier's read of the inquiry. sales: someone who may buy; not_sales: a job seeker, vendor, support request or partnership pitch; spam: held off the queue; needs_a_person: not read (the model failed three times, its output was unusable, or the message carried an instruction aimed at the model), so the inquiry took the path it takes with the chain off. Null until the qualify step passes. Valid values: [sales, not_sales, spam, needs_a_person]
- not_sales_kind: For a not_sales verdict, which kind, for the board's chip; null otherwise. Valid values: [job_seeker, vendor, support, partnership, other]
- fit: The qualifier's fit from 0 to 5 against the fit the contact page states; shown on the Leads card, never used to order the queue.
- reasons: Up to three short reasons for the verdict and fit, each at most 140 characters, with links, email addresses and phone numbers stripped.
- gpct_suggested: The qualifier's suggested answers to the six qualification questions (goal, plan, challenge, timeline, budget, authority), drawn only from what the visitor wrote, "Not stated" otherwise; a suggestion until a person presses Use these and Save.
- injection_suspected: True when the visitor's message carried a deterministic marker of an instruction aimed at a model; the verdict is then forced to needs_a_person.
- company_match: The live company the qualify step matched by email domain or unique exact name, before anything was linked; null when none matched.
- company_id: The company the file step linked the person to (found or created); null when nothing was linked.
- company_created: True when the file step created company_id for this inquiry (find_or_create_company_by_host); null when nothing was linked.
- possible_duplicate_ids: Other people who may be the same person (same name at the same company domain), for the Leads card's links; never merged automatically.
- customer_deal_id: The open or won deal that made the sender a current client; the line names its owner instead of queueing a lead.
- routed: Where the file step put the inquiry. queued: promoted to the SDR queue; held_spam: status spam, off the queue; kept_on_board: left on the Inquiries board, labelled; customer_owner: a current client, named to the deal owner; fallback: the chain-off path (needs_a_person). Valid values: [queued, held_spam, kept_on_board, customer_owner, fallback]
- would_route: For a shadow run only, where a live run would have filed the inquiry; compared with what a person did. Valid values: [queued, held_spam, kept_on_board, customer_owner, fallback]
- prompt_version: The lead-qualify prompt version the verdict came from.
- notice: The one-line Operations message the notify step posted, or in shadow would have posted; a template with no message body; null for a spam hold, which posts nothing.
- qualified_at: When the qualify step wrote the verdict.
- filed_at: When the file step finished.
- notified_at: When the notify step finished (posted, recorded in shadow, or nothing to post).
- review: A person's answer to the qualifier's read. accepted: it was right; corrected: corrected_verdict and corrected_fit say what it should have been. Null until someone answers. Valid values: [accepted, corrected]
- corrected_verdict: The verdict a person says was right; set only with review corrected. Valid values: [sales, not_sales, spam, needs_a_person]
- corrected_fit: The fit from 0 to 5 a person says was right; set only with review corrected.
- reviewed_by: The person who answered review.
- reviewed_at: When review was answered.
- created_at: When the contact route opened the run.
- updated_at: When the row last changed, stamped by the set_inquiry_triage_updated_at trigger (company_os.handle_updated_at), as on companies.

### company_os.interactions
One row is: one logged touch with a person or company — call, email, note, meeting reference — or one Lark or WhatsApp message, including a post to a group chat.
Bucket: transactional · Pipeline activity
Tier: 2 stage engine
Status: active
Origin: CRM flows and the crm-lead skill; every accepted email (kernel/messaging/email.ts) and every delivered Lark message (kernel/messaging/lark-log.ts).
Usage: relationship timelines on people, companies, and deals (430+ rows, growing steadily).
Reuse: THE activity log. Any "log a touch" feature writes here with `kind`; never create per-channel activity tables.
Columns:
- id: Primary key.
- kind: How the touchpoint travelled, or what it was: email, lark and whatsapp are messages; note, call, meeting, system and status_change are CRM entries (status_change rows are hidden from note threads); collections is a chase recorded against a client company from the billing page. message is a legacy kind, kept allowed. interactions_kind_check limits the values.
- subject: Short title of the touchpoint, e.g. the email subject or "Unsubscribed from marketing email".
- body: Full touchpoint content - note text, call summary, or the sent email HTML.
- occurred_at: When the touchpoint actually happened (drives timeline ordering, distinct from row creation).
- owner_id: FK to people; the team member who owns/logged the touchpoint (not populated by current code paths).
- person_id: FK to people; puts the entry on that contact's 360 timeline.
- company_id: FK to companies; copied from the deal so notes also land on the company timeline.
- subject_type: Polymorphic scope of the entry paired with subject_id; `deal` for deal communications, `application` for ATS notes. Values seen in code: [deal, application].
- subject_id: UUID of the scoped record named by subject_type (deal id or application id).
- metadata: Free-form JSON side-car recording provenance, e.g. {source: "deal_drawer"}, author_email/author_name, email to-address and format. A lark or whatsapp post to a group chat names the chat in metadata.chat, which is what lets it stand without a person, company or subject.
- category: What the touchpoint was about: workboard, one_on_one, goals, reviews, onboarding, people_ops, client, marketing, account or other. Set on emails and Lark messages by kernel/messaging (message-category.ts); null on CRM notes, calls and meetings. interactions_category_check limits the values.
- created_at: Row creation time.
Evidence: rows 439 · reads 1,570 · inserts 443 (stamped 28 Aug 2026)

### company_os.pipelines
One row is: one sales pipeline definition (one exists today).
Bucket: master · Reference & rules
Tier: 2 stage engine
Status: active
Origin: seeded; edited rarely.
Usage: deals reference it; new sales motions add rows here.
Columns:
- id: Primary key.
- slug: Stable machine identifier for the pipeline (the single live one is `default-sales`).
- name: Human-readable pipeline name ("Default sales").
- kind: Pipeline category label; not read by application code, which selects the oldest active pipeline instead.
- active: Whether the pipeline is selectable; deal-creating flows pick the oldest active pipeline as the default.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 1 · reads 507 · inserts 1 (stamped 28 Aug 2026)

### company_os.pipeline_stages
One row is: one stage in one pipeline, ordered.
Bucket: master · Reference & rules
Tier: 2 stage engine
Status: active
Origin: seeded with the pipeline; edited rarely.
Usage: deals carry `stage_id`; stage funnels and boards read the ordering.
Columns:
- id: Primary key.
- pipeline_id: FK to pipelines; the pipeline this stage belongs to.
- name: Stage display name; the default sales pipeline runs New, Contacted, Discovery, Proposal, Contract Sent, Won, Lost.
- position: 0-based ordering of the stage within its pipeline; the lowest position is where new handoff deals land.
- is_won: Marks the terminal won stage; moving a deal into it sets deals.status to won.
- is_lost: Marks the terminal lost stage; moving a deal into it sets deals.status to lost and requires a lost_reason.
- default_probability: Forecast percentage a deal takes when it enters this stage, 0-100; null leaves the deal's own value alone. Applied on entry only, so a later manual override sticks.
- created_at: Row creation time.
Evidence: rows 7 · reads 1,085 · inserts 7 (stamped 28 Aug 2026)

### Deliver

### company_os.tasks
One row is: one unit of internal work on a board, in a sprint, or standalone.
Bucket: transactional · Client delivery & work
Tier: 2 stage engine
Status: active
Origin: work-management flows; stage moves are logged to `task_stage_log`.
Usage: boards and sprint views (2,855 reads).
Reuse: internal work items are tasks; client-facing roadmap work is `client_backlog_items`.
Columns:
- id: Primary key.
- title: Card title shown on the board.
- description: Longer free-text body of the card.
- board_id: FK to boards; the task board the card lives on.
- board_column_id: FK to board_columns; the kanban column the card currently sits in.
- sprint_id: FK to sprints; the sprint the card is committed to, null for backlog; open cards can roll over when a sprint closes.
- epic_id: FK to epics (on delete set null); the epic this card is grouped under, or null. The board's larger-feature filter axis.
- position: Float ordering of the card within its column (fractional inserts avoid renumbering).
- assignee_id: FK to people; who the card is assigned to.
- created_by: FK to people; who created the card.
- status: Whether the card is open, finished, or closed without being done; moving into a done column sets done, into a Not Doing column sets not_doing. Valid values: [open, done, not_doing].
- priority: Card priority, defaulting to p3. Valid values: [p1, p2, p3].
- due_date: Date the card is due; drives the board digest cron.
- completed_at: Timestamp when the card was marked done; cleared if reopened.
- internal: Internal-only flag; the client-facing board view hard-filters to `internal = false`.
- subject_type: Polymorphic link slot - one link per card, a coaching commitment or a client roadmap item, never both. Valid values: [coaching_commitment, client_backlog_item].
- subject_id: UUID of the linked subject row named by `subject_type`; moving a commitment-linked card to done marks the coaching commitment kept.
- metadata: JSONB card extras, e.g. `assigned_at` stamp for the New chip and `source: 'agent'` for the AGENT badge.
- archived_at: Soft-delete timestamp; null means the card is active.
- archived_by: Free-text label of who archived the card.
- created_at: Row creation time.
- updated_at: Last modification time.
- parent_task_id: FK to tasks; set on subtasks, making the card a checklist item under the parent card.
- human_tokens: Human-token allotment estimated on the card (and on each subtask), the board's unit of work sizing.
Evidence: rows 103 · reads 2,855 · inserts 103 (stamped 28 Aug 2026)

### company_os.client_backlog_items
One row is: one client-visible backlog item on a client roadmap.
Bucket: transactional · Client delivery & work
Tier: 2 stage engine
Status: active
Origin: delivery planning with clients.
Usage: client roadmap surfaces (1,617 reads); groups via `client_roadmap_groups`.
Reuse: client-facing delivery scope lives here, keyed to the client's company.
Columns:
- id: Primary key.
- company_id: FK to companies; the client whose AI Program roadmap this item is on.
- group_key: Roadmap section the item sits in, matching a `client_roadmap_groups.key` for the company; code validates the key against the company's own groups (the original hardcoded five-section check survives only as a seed template).
- ref: Stable seed reference like `F1`/`R1` for Edge8-authored items, unique per company; null for client-proposed items.
- title: The backlog item's name.
- who: Which client people the item affects (free text, e.g. names or "Everyone").
- today_state: How the work is done today — the manual process the item replaces.
- build_desc: What Edge8 would build.
- needs: Array of prerequisites (dependency refs like `F1`, API access, client inputs).
- token_low: Low end of the human-token estimate for the build.
- token_high: High end of the human-token estimate.
- edge8_priority: Edge8's proposed priority; the client's `client_priority` wins when set. Valid values: [now, next, later, park].
- client_priority: The client's own priority choice from the portal, overriding `edge8_priority` when set. Valid values: [now, next, later, park].
- client_note: The client's comment on the item, written from the portal.
- source: Who authored the item — Edge8 seeds or a client proposal awaiting acceptance. Valid values: [edge8, client].
- status: Item lifecycle on the roadmap. Valid values: [proposed, accepted, active, shipped, parked].
- sort_order: Edge8's ordering within a group; the admin views sort by it.
- archived_at: When the item was archived (soft delete); null means live.
- archived_by: Who archived the item.
- created_at: Row creation time.
- updated_at: Last modification time.
- client_sort_order: The client's dragged ordering within a group; the portal orders by `coalesce(client_sort_order, sort_order)` so un-reordered groups fall back to Edge8's order.
- ai_program_id: FK to ai_programs; null means company-wide, set means the item belongs to one AI Program (HTT Phase 1, backfilled only for single-program companies).
Evidence: rows 43 · reads 1,617 · inserts 43 (stamped 28 Aug 2026)

### company_os.meetings
One row is: one meeting or meeting-note record — calendar meetings and folded-in notes distinguished by `source`.
Bucket: transactional · Client delivery & work
Tier: 2 stage engine
Status: active
Origin: calendar sync and note flows; `meeting_notes` was folded in 28 Aug 2026 as `source='notes'` rows with ids preserved.
Usage: meeting views, action items, transcripts (via `call_transcripts`), and the polymorphic `meeting_associations` list of what a meeting is about.
Reuse: anything meeting-shaped is a row here with a `source` value, not a new table.
Columns:
- id: Primary key.
- source: Where this record came from; `notes` rows carry the folded meeting_notes client-notes workflow, `review` rows are performance-review calls. Valid values: [lark, thoughtflow, manual, zoom, google, other, notes, coaching, review].
- external_id: Identifier in the source system (e.g. the Zoom recording uuid); the idempotency key for importers.
- title: Meeting title; for notes rows the AI summarizer fills it only when blank.
- meeting_type: Canonical meeting taxonomy, coerced on every write by the `meetings_normalize_type` trigger so imports can never introduce a new type. Valid values: [Sales, 1-1, Leadership Sync, Vendor Call, General, Performance, Team Ceremony].
- summary: Readable meeting summary (AI-generated Markdown for client notes); null when `summary_encrypted` is true.
- summary_encrypted: When true the readable summary is absent and the text sits encrypted in `summary_ciphertext`; app writes always set it false.
- summary_ciphertext: Encrypted summary text for rows imported with an encrypted summary; unreadable to the app and the NL-to-SQL assistant.
- transcript_url: Link to the transcript in the source system.
- recording_url: Link to the recording (Zoom share URL for zoom rows).
- minutes_url: Link to the minutes document (e.g. Lark Minutes) in the source system.
- owner_id: FK to people; the internal owner/host of the meeting.
- started_at: When the meeting started; the canonical meeting date (notes rows store UTC midnight and surfaces show only the date part).
- ended_at: When the meeting ended.
- duration_seconds: Meeting length in seconds, from the source system.
- metadata: JSONB side-channel: raw transcript stash for re-summarizing, `source_meeting_type` preserved by the taxonomy trigger, and importer bookkeeping.
- created_at: Row creation time.
- updated_at: Last modification time.
- company_id: FK to companies; the client company the meeting is with - non-null is what makes a row a "client meeting" on the admin and portal surfaces.
- attendees: Array of attendee names, entered by an admin or extracted from the transcript by the summarizer.
- published_at: When the meeting summary was published to the client portal; null means draft (admin-only).
- ai_status: State of the AI summary pipeline for the row. Valid values: [pending, ready, failed].
- ai_error: Error message recorded when the AI summarizer fails (it never throws).
- ai_model: Which Claude model produced the current summary.
- source_file_path: Storage path of the uploaded transcript file; removed from storage when the meeting is deleted.
- source_file_name: Original filename of the uploaded transcript, shown on the details page.
- created_by: Email of the admin who created the row (text, not a FK).
- archived_at: Soft-delete timestamp; null means the row is active.
- ai_program_id: FK to ai_programs; optional AI Program tag scoping the meeting - null means company-wide (the default).
Evidence: rows 336 · reads 1,664 · inserts 386 (stamped 28 Aug 2026)

### company_os.sprints
One row is: one sprint window for the internal team.
Bucket: other · Plans & designs
Tier: 2 stage engine
Status: active
Origin: work-management flows.
Usage: task grouping and sprint views (973 reads).
Columns:
- id: Primary key.
- board_id: FK to boards; the board this sprint belongs to.
- name: Sprint name shown in the board header.
- goal: The sprint goal, part of the sprint brief.
- starts_on: First day of the sprint.
- ends_on: Last day of the sprint.
- status: Whether the sprint is running or finished; closing a sprint rolls open cards into the next one. Valid values: [active, closed].
- closed_at: Timestamp when the sprint was closed.
- sort_order: Ordering of sprints on a board; queries take the first active sprint in this order.
- created_at: Row creation time.
- updated_at: Last modification time.
- meeting_id: FK to meetings; the attached sprint meeting whose transcript the brief is extracted from (attach first, then pull).
- focus_improvement: Sprint-brief field: what to improve this sprint, editable and AI-draftable from the attached meeting.
- going_well: Sprint-brief field: what is going well, editable and AI-draftable from the attached meeting.
- meeting_summary: Sprint-brief field: this client's slice of the attached meeting, drafted by `extractSprintBrief` and saved only on explicit user action.
- week: The company sprint week the sprint belongs to: the ISO year and week of its first day (`2026-W38`), one per board (partial unique index with board_id). The weekly routine and createSprint set it; the Workboard and the planning page filter on it. Null on a sprint without a start date.
- locked_at: Set by Finish planning on the planning page: the committed scope. Name, goal and card commitments stay read-only in the planning strip until unlocked (null).
Evidence: rows 9 · reads 973 · inserts 11 (stamped 28 Aug 2026)

### company_os.epics
One row is: one epic, a board-scoped grouping of cards into a larger feature.
Bucket: other · Plans & designs
Tier: 2 stage engine
Status: active
Origin: work-management flows (board toolbar / manage-epics drawer).
Usage: card grouping and the board epic filter, orthogonal to columns (stage) and sprints (time).
Reuse: the "larger feature" axis for board cards; time-boxed grouping is `sprints`, stage is `board_columns`.
Columns:
- id: Primary key.
- board_id: FK to boards; the board this epic belongs to.
- name: Epic name shown on the chip and in the filter.
- description: Optional longer description of the epic.
- color: Accent color for the chip/filter dot; one of the lib/boards EPIC_COLORS palette. Null falls back to the first entry.
- status: active or archived; an archived epic drops out of the toolbar filter but still resolves on any card tagged with it. Valid values: [active, archived].
- sort_order: Ordering of epics on a board; new epics also cycle the default color by this index.
- archived_at: Timestamp when the epic was archived; null while active.
- archived_by: Audit label of who archived the epic.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 0 · reads 0 · inserts 0 (new 1 Sep 2026)

### Measure

### htt.man_hour_entries
One row is: one logged span of human hours with a rate, attributed to a person, repo, and client.
Bucket: transactional · Effort & value measurement
Tier: 2 stage engine
Status: active
Origin: manual and scripted logging alongside the PR-based minting. TODO(owner): confirm current intake path.
Usage: effort reporting next to token entries (656 reads).
Reuse: hour-shaped effort evidence goes here; PR-shaped evidence is `pull_requests`. Hours never surface as a UI unit in the tracker.
Columns:
- id: Primary key.
- person_id: FK to people; the contributor whose hours these are; nullable so non-registered, non-excluded contributors are kept rather than dropped.
- company_id: FK to companies; denormalized owning company for per-day billing rollups.
- repo_id: FK to htt.repos; the repo the hours were worked on.
- primary_role: Free-text role label for the contributor on this entry; the session ingest writes null.
- hours: The day's final delivered hours (numeric 6,2), the canonical delivery-debit figure: the human-hours rule's budget-split result on `auto_session` rows, or the person's override on `manual` rows.
- measured_hours: Hands-on hours the rule measured for this person, repo and day before the budget split; null on rows that predate the rule or were entered by hand.
- evidence: What the measured figure rests on: session count, total measured across repos, the other repos' shares, the budget and timezone applied.
- needs_review: True when the stored hours could not be measured (no session evidence) and a person should confirm or correct the day.
- occurred_on: Calendar day the hours were worked; part of the auto-session dedup key.
- occurred_hour: Clock hour of the entry, an integer 0-23; the session ingest pins it to 0 as a stable per-day slot for the (person, repo, day) dedup.
- source: How the entry was recorded; `auto_session` rows are unique per (person, repo, day). Valid values: [auto_session, manual].
- description: Free-text note describing the work.
- rate_cents: Optional billing rate in cents applied to the hours.
- currency: Currency code for `rate_cents`; defaults to `AUD`.
- status: Billing lifecycle state. Valid values: [recorded, approved, invoiced, paid, excluded].
- started_at: Precise client-provided git-pull instant that started the session; source of the duration metric (PR timestamp minus this); null for legacy rows and contributes 0.
- created_by: Audit label (text) of who or what created the row.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 258 · reads 656 · inserts 536 (stamped 28 Aug 2026)

### htt.work_sessions
One row is: one Claude Code session on one tracked repo, with the intervals the contributor was actually active and its token total.
Bucket: transactional · Effort & value measurement
Tier: 2 stage engine
Status: active
Origin: telemetry ingest (the edge8-telemetry plugin and the local transcript backfill), keyed on the session UUID.
Usage: the raw input of the human-hours rule; `man_hour_entries` auto rows are recomputed from these per person and local day.
Reuse: session-shaped effort evidence goes here; the day-grain result is `man_hour_entries`, never a second per-day table.
Columns:
- id: Primary key.
- company_id: FK to companies; the repo's owning client, denormalized for per-company reads.
- repo_id: FK to htt.repos; the repo the session worked on.
- person_id: FK to people; the contributor, resolved from their git email; null when unknown.
- session_id: Claude Code session UUID; the idempotency key, so a re-ingest updates rather than duplicates.
- tool: The tool that produced the session, e.g. claude-code.
- started_at: First message instant.
- ended_at: Last message instant.
- active_intervals: JSON array of {start, end} ISO instants during which ANY transcript line flowed without a 30 minute gap (legacy clock, includes AI and tool output); kept for comparison, no longer the billed basis.
- human_turns: JSON array of {t, branch, run_end}: the instant and git branch of every line the contributor typed, never AI or tool output, and when the AI went quiet after it. The hours rule (v2) builds 10-minute runs from these, unions them across the person's sessions and repos for the day, and apportions the day to repos and PRs by turn share. Empty for sessions recorded before edge8-telemetry 1.4.0.
- tokens_total: Deduplicated input + output + cache-creation tokens the session used.
- occurred_on: The session's start day in the contributor's timezone.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: new table (7 Sep 2026)

### htt.repos
One row is: one tracked repository, internal or client-owned.
Bucket: master · Assets & code
Tier: 2 stage engine
Status: active
Origin: tracker admin; nightly sync reads the roster. The `human-tokens` service account must be a collaborator by username or sync 404s.
Usage: 12 tables reference it; every PR and token entry keys to a repo.
Columns:
- id: Primary key.
- ai_program_id: FK to company_os.ai_programs: the AI Program this repo belongs to. A program owns any number of repos (X.1); every delivery figure is summed over them.
- company_id: FK to company_os.companies; denormalized owning-company scope used for RLS-style filtering and rollups.
- slug: URL slug, unique per company when set; backfilled as kebab-case of `name` for slug-based repo lookups.
- name: Display name of the tracked repo/engagement.
- github_repo: GitHub `owner/name` the sync and telemetry ingest resolve against; unique when set.
- github_repo_id: Numeric GitHub repository id from the API.
- github_repo_aliases: Historical `owner/name` values (renames, org transfers) that telemetry ingest also matches, so a rename does not orphan past records; explicit per repo, never auto-enrolls.
- roi_metric_name: Name of the repo's FAST-goal ROI metric.
- roi_metric_unit: Unit of the ROI metric. Valid values: [count, money, percent].
- roi_metric_baseline: ROI metric value before the engagement started.
- roi_metric_target: ROI metric value the engagement aims for.
- roi_metric_period: Reporting period of the ROI metric. Valid values: [monthly, quarterly, annual].
- started_at: Engagement lifecycle start instant.
- ended_at: Engagement lifecycle end instant.
- status: Engagement lifecycle state. Valid values: [planned, active, ramping, paused, complete, archived].
- last_synced_at: Most recent PR `updated_at` seen by the GitHub PR sync; advanced after each upsert batch.
- live_url: Live site URL mirrored from the GitHub repo homepage field during PR sync; null when the repo has no homepage set.
- created_by: Audit label (text) of who or what created the row; the tracker's auth.users linkage was dropped in the edge8 port.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 21 · reads 7,920 · inserts 23 (stamped 28 Aug 2026)

### htt.token_allocations
One row is: one allotment of tokens to a client engagement — the "allotted" side of burnt/allotted/unburnt.
Bucket: other · System config & plumbing
Tier: 2 stage engine
Status: active
Origin: tracker admin when an engagement is set up or topped up.
Usage: wallet and burn-down reporting.
Columns:
- id: Primary key.
- seq: Monotonic identity sequence; the table is append-only and the current allocation is the highest-seq row per company, unambiguous even when `set_at` ties.
- company_id: FK to companies; the client company whose allotted token pack this row sets.
- tokens: Allotted pack size in tokens (numeric so tenths are possible; UI shows whole); null on the latest row means the pack was removed.
- set_by_email: Email of the Edge8-internal user who set the value, taken from the verified session, never typed input.
- set_at: When this allocation row was recorded.
- kind: Why this Bought figure was set: purchased, referral_credit, retreat, complimentary, invoiced or correction; null on rows imported before the admin control existed.
- reason: Free-text reason typed by the admin who set the figure, shown under the Bought tile and in the allocation history.
Evidence: rows 8 · reads 73 · inserts 8 (stamped 28 Aug 2026)


### htt.delivered_additions
One row is: one addition to a client's Delivered human tokens made by hand, for work that did not run through Claude (meetings, deep work, requirement writing, research).
Bucket: other · System config & plumbing
Tier: 2 stage engine
Status: active
Origin: admin "Add delivered" control under the Human Tokens band on the company page.
Usage: summed into Delivered and Balance on the admin, team and portal hubs; not part of the leverage denominator.
Columns:
- id: Primary key.
- seq: Monotonic identity sequence; orders the history unambiguously even when `set_at` ties.
- company_id: FK to companies; the client company whose Delivered figure this row raises.
- hours: Human tokens added, in hours (the unit the band shows as Delivered); always positive.
- kind: What the work was: meeting, deep_work, requirements, research or other.
- reason: Free-text reason typed by the admin, shown under the Delivered tile and in the history.
- set_by_email: Email of the Edge8-internal admin who added the row, taken from the verified session, never typed input.
- set_at: When the addition was recorded.
### htt.engineer_keys
One row is: one issued engineer access key — the hash of the `e8k_` credential a contributor's machine holds, which mints GitHub tokens for git and authenticates that machine's Claude Code telemetry.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: issued by edge8-github-app-tracker (`POST /api/admin/keys`), which stores only the hash and shows the secret once. Created empty here on 2026-09-11; the live keys arrive with the tracker's own database move, never by copying hashes through a terminal or a transcript. Once that lands, `tracker.engineer_keys` becomes a view over this table and the tracker keeps writing it unchanged.
Usage: read by `/api/telemetry/sessions/` on every delivered Claude Code session to authenticate the machine and name the contributor; read by the tracker's own key mint, beacon and admin list.
Reuse: any Edge8 service that needs to know which machine is calling authenticates with the same `e8k_` key and verifies it here, rather than minting a second credential or distributing a shared secret.
Do not: grant it to reporting roles or join it into analytics (it is a credential verifier, not business data, though note `supabase_read_only_user` holds `pg_read_all_data` and `rolbypassrls`, so withholding the grant states intent rather than enforcing it); store the key secret itself; treat `member` as the contributor's identity without resolving it through `htt.resolve_contributor`.
Columns:
- key_id: Primary key; the public half of the credential (`e8k_<8 hex>`), sent in full as `e8k_<id>_<secret>` and split back out on lookup.
- key_hash: sha256 hex of the whole presented key. The secret is shown once at issue and never stored, so a leak of this table does not yield a usable key.
- member: Company email the key was issued to. A deliberate exception to the "reference people.id" rule: a key is issued by a separate service before the holder necessarily exists in `company_os.people`, so callers resolve it to a person at read time.
- status: Whether the key still authenticates; revoking is how a machine or a departing contributor is cut off. Valid values: [active, revoked]
- issued_at: When the key was issued, as a UTC ISO-8601 string. Text rather than timestamptz to match the tracker's schema exactly.

### htt.client_identities
One row is: one mapping from a tracker client to identifying handles (GitHub org, names) used by the sync.
Bucket: master · Customers & partners
Tier: 2 stage engine
Status: active
Origin: tracker admin.
Usage: attribution joins in the sync and reporting.
Columns:
- id: Primary key.
- repo_id: FK to htt.repos; scope of the identity row; null applies the identity to every repo (global).
- git_email: Client/owner git commit email; matched case-insensitively to exclude owner commits from attribution and to classify self-reported effort as owner work.
- github_login: Client/owner GitHub login; matched case-insensitively against `pull_requests.author_login` to classify a PR as owner (client) rather than Edge8 work.
- label: Human-readable label for the identity (who this email/login is).
- created_at: Row creation time.
Evidence: rows 20 · reads 52 · inserts 40 (stamped 28 Aug 2026)

### Collect

### company_os.invoices
One row is: one invoice mirrored from QuickBooks — QuickBooks is the system of record; this row is for visibility and joins.
Bucket: transactional · Revenue documents
Tier: 2 stage engine
Status: active
Origin: QBO sync only (`source`, `external_id`, `synced_at`, `lines` jsonb). Never hand-written.
Usage: revenue views and AR aging via `balance_cents` (2,204 reads; heavily rewritten by sync).
Reuse: invoice-shaped features read this mirror; changes to actual invoices happen in QuickBooks.
Do not: write invoices here; build credit notes or dunning on the mirror.
Columns:
- id: Primary key.
- company_id: FK to companies; the client the invoice bills, mapped from QuickBooks customer ids stored in `companies.metadata` (null when the QBO customer is unmapped, in which case `customer_name` identifies it).
- source: Sync source system; currently always `quickbooks` (the table is a read-only QuickBooks mirror, QBO is the source of truth).
- external_id: The bare QuickBooks invoice id within its realm; part of the `(source, entity, external_id)` upsert key the sync writes onto.
- doc_number: Invoice document number as shown in QuickBooks.
- txn_date: Invoice transaction date from QuickBooks.
- due_date: Payment due date from QuickBooks; a positive balance past this date derives `overdue` status.
- currency: Lowercase ISO currency code of the invoice, default `usd`.
- amount_cents: Invoice total in minor units.
- balance_cents: Outstanding balance in minor units; zero derives `paid` status.
- status: Derived at sync time from the memo, balance, and due date, never stored back to QBO. Valid values: [paid, open, overdue, voided].
- memo: QuickBooks private memo field; a `void` marker here derives `voided` status, and the column is never selected in the client portal (privacy hard line).
- payment_link: Client-facing pay URL; always null today (no QuickBooks payment-link source is wired up), and the portal omits its Pay button when null.
- lines: JSONB array of invoice line items (`description`, `quantity`, `rate`, `amount`, `item_name`) shown to clients in the portal.
- synced_at: When the QuickBooks sync last upserted this row.
- created_at: Row creation time.
- updated_at: Last modification time.
- customer_name: QuickBooks customer display name; identifies invoices whose customer has no mapped company.
- entity: Which QuickBooks company (realm) the invoice comes from; part of the upsert key because QBO invoice ids are per-realm. Valid values: [edge8, aio].
- deal_id: FK to deals; the deal this invoice bills, linked by hand from the deal detail so won amounts can be checked against billing. QuickBooks knows nothing of it.
- kind: What the invoice bills. Valid values: [recurring, project]. Set by the QuickBooks sync from the line items (retainer, monthly, subscription, staffing lines are recurring); null when the sync could not decide.
Evidence: rows 214 · reads 2,204 · inserts 217 (stamped 28 Aug 2026)

### company_os.orders
One row is: one Stripe checkout order for a product, with fees, tax, FX, and refunds captured.
Bucket: transactional · Revenue documents
Tier: 2 stage engine
Status: active
Origin: Stripe webhook flows (`stripe_session_id`, `stripe_payment_intent_id`).
Usage: product sales reporting (3,682 reads).
Reuse: one-off purchases are orders; recurring is `subscriptions`.
Columns:
- id: Primary key.
- person_id: FK to people; the buyer.
- product_id: FK to products; the product or event ticket tier purchased.
- payment_method: How payment was taken: `stripe` for checkout orders (Stripe-driven flow), `manual` for admin-recorded roster payments, `offline_vn` in legacy data.
- stripe_session_id: Stripe Checkout session id stamped at session-create time; the webhook resolves orders by it.
- stripe_payment_intent_id: Stripe PaymentIntent id, written by the webhook when payment succeeds.
- stripe_customer_id: Stripe Customer id; not written by any checkout flow in this codebase (carried over from the aio-website order schema).
- amount_cents: Order total in minor units in the native currency.
- tax_cents: Tax portion in minor units; written as 0 by the manual roster-payment action.
- currency: Lowercase ISO currency code of the order.
- status: Checkout lifecycle, flipped by the Stripe webhook guarded by current status (pending to paid or expired; an expired order can still flip to paid via payment recovery). Valid values: [pending, paid, expired, refunded].
- seat_hold_expires_at: When the 30-minute Stripe Checkout seat hold for an event registration lapses.
- refunded_cents: Refunded amount in minor units, shown on the admin orders list.
- affiliate_id: FK to affiliates; attribution used to mint a commission ledger row when a commission-type code converts.
- metadata: JSONB context stamped by the checkout flow (e.g. `type` of `event_registration` or `token_pack`, `registration_id`, `token_purchase_id`); the webhook deliberately never overwrites it.
- created_at: Row creation time.
- updated_at: Last modification time; doubles as paid-at on the webhook's status flip.
- amount_usd_cents: USD-normalized total derived via FX at write time so cross-currency sums are safe; commission gross uses it when set.
- stripe_fee_cents: Stripe processing fee in minor units; no reads or writes anywhere in this codebase (legacy aio-website column). TODO(owner): confirm whether anything still populates it.
- fx_rate: Native-to-USD conversion rate; no reads or writes anywhere in this codebase (legacy aio-website column). TODO(owner): confirm whether anything still populates it.
- vnd_amount: Order amount in Vietnamese dong; no reads or writes anywhere in this codebase (legacy aio-website column for `offline_vn` payments). TODO(owner): confirm whether anything still populates it.
Evidence: rows 8 · reads 3,682 · inserts 17 (stamped 28 Aug 2026)

### company_os.subscriptions
One row is: one Stripe subscription for a person and product.
Bucket: transactional · Revenue documents
Tier: 2 stage engine
Status: waiting
Origin: Stripe webhook flows; empty until the first recurring product sells.
Usage: none yet; read by product surfaces (304 reads against empty).
Columns:
- id: Primary key.
- person_id: FK to people; the subscriber.
- product_id: FK to products; the recurring product subscribed to.
- stripe_customer_id: Stripe Customer id behind the subscription (Stripe-driven table; currently an empty scaffold with no writer in this codebase).
- stripe_subscription_id: Stripe Subscription id linking the row to the Stripe object.
- status: Subscription lifecycle status, Stripe-shaped; no writer exists in this codebase yet.
- current_period_end: End of the current Stripe billing period.
- cancel_at_period_end: Whether the subscription is set to cancel at period end instead of renewing.
- affiliate_id: FK to affiliates; attribution for the referral program.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 0 · reads 304 · inserts 0 (stamped 28 Aug 2026)

### company_os.products
One row is: one sellable product or ticket tier, Stripe-linked, optionally tied to an event.
Bucket: master · Products & offerings
Tier: 2 stage engine
Status: active
Origin: product admin flows.
Usage: checkout, event ticketing, order joins (3,807 reads).
Reuse: new sellables are rows with `type`/`tier`, not new tables.
Columns:
- id: Primary key.
- type: Product kind; code writes `event` for event ticket tiers, and the `public_retreats` view treats `type = 'event'` rows grouped by `cohort_slug` as public retreats.
- slug: Globally unique URL identifier; event tiers are namespaced under the parent event's slug with a numeric suffix on collision.
- title: Display name of the product or ticket tier.
- subtitle: Secondary display line under the title; not referenced anywhere in this codebase (legacy catalog field).
- description: Longer description shown on admin product and event tier views.
- date_start: Start date for retreat-style products; shown on the admin products list and in the retreat confirmation email.
- date_end: End date for retreat-style products.
- location: Venue or city label for retreat-style products.
- capacity: Per-tier seat cap, independent of the event's overall capacity.
- cohort_slug: Groups tier products into one retreat cohort; the `public_retreats` view aggregates by it and survey responses are tagged with it.
- tier: Tier identifier within an event or cohort (slugified title with underscores).
- payment_method_local_vn: Whether local Vietnamese payment is offered for the product; not referenced anywhere in this codebase (legacy aio-website flag).
- stripe_product_id: Mirrored Stripe Product id; not read by checkout in this codebase.
- stripe_price_id: Mirrored Stripe Price id; deliberately unused by event checkout, which prices from `amount_cents` via inline `price_data` because mirrored ids may belong to another Stripe account (caio-coach).
- amount_cents: Price in minor units in the native currency; 0 means a free tier that skips Stripe entirely.
- currency: Lowercase ISO currency code of the price.
- active: Whether the product or tier is currently purchasable; inactive tiers are hidden and rejected at registration.
- created_at: Row creation time.
- updated_at: Last modification time.
- service_line_id: FK to service_lines; categorizes the product under a business offering.
- amount_usd_cents: USD-normalized price used for cross-currency display and sorting (admin products list, retreat "from" price).
- event_id: FK to events; set on `type = 'event'` rows to mark the tier as belonging to that event.
- sort_order: Display order of tiers within an event.
Evidence: rows 28 · reads 3,807 · inserts 31 (stamped 28 Aug 2026)

### company_os.service_lines
One row is: one service line the company sells, used to categorize deals and products.
Bucket: master · Products & offerings
Tier: 2 stage engine
Status: active
Origin: seeded; edited rarely.
Usage: deal and product categorization (506 reads).
Columns:
- id: Primary key.
- slug: Unique short identifier for the service line.
- name: Display name of the service line (a business offering such as staffing or AI program, referenced by `deals.service_line_id` and `products.service_line_id`).
- business_unit: Which business unit the service line belongs to; only surfaced through the NL-to-SQL schema docs, no direct app reads.
- description: What the offering covers.
- active: Whether the service line is currently offered.
- created_at: Row creation time.
Evidence: rows 8 · reads 506 · inserts 8 (stamped 28 Aug 2026)

### company_os.fx_rates
One row is: one currency's current rate to USD.
Bucket: master · Reference & rules
Tier: 2 stage engine
Status: active
Origin: rate refresh job. TODO(owner): confirm refresh cadence and source.
Usage: FX normalization on deals and orders.
Columns:
- currency: Primary key; lowercase ISO currency code.
- rate_to_usd: Multiplier converting one unit of the currency to USD, used to derive `*_usd_cents` reporting values; refreshed opportunistically from the Frankfurter API when event P&L lines and deals are saved.
- updated_at: When the cached rate was last refreshed.
Evidence: rows 3 · reads 178 · inserts 3 (stamped 28 Aug 2026)

---

## Tier 3 — support tables (concise entries)

### Master · People & org structure

### company_os.positions
One row is: one job position definition in the org structure.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR admin; changes rarely.
Usage: 31,503 reads — the public careers site and org views make this one of the hottest tables.
Evidence: rows 31 · reads 31,503 · inserts 31 (stamped 28 Aug 2026)

### company_os.capacity_roles
One row is: one role the company sells hours of, with the hours per week it can give — a role, never a person.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: the Operations -> Capacity screen (entities/org), an admin action. Nothing else writes it.
Usage: the capacity forecast and the fit check on /admin/operations/capacity read it with capacity_commitments.
Reuse: any question of the form "can we take this work" reads supply from here. A role's supply is `hours_per_week` every week from `effective_from` on; to change it, edit the row (there is no history in v1).
Do not: add a person column, a per-person utilisation or anything that ranks people — capacity is modelled by role and hours only (house rule). A job opening is `job_requisitions`; the org chart's seat is `positions`.
Columns:
- id: Primary key.
- name: The role's name as the capacity screen shows it, e.g. "Senior engineer". Unique and never blank.
- position_id: The org-chart position this role corresponds to, referencing positions.id; optional, and cleared if the position is deleted.
- hours_per_week: Hours of work this role can give in a normal week, the supply the forecast compares commitments against. Zero or more.
- effective_from: The first date the supply counts from; before it the role supplies nothing.
- archived_at: When the role was archived. A non-null value hides it from the forecast and the pickers; rows are never hard-deleted.
- created_at: Row creation time.
- updated_at: When the row last changed; maintained by a trigger.
Evidence: <generated line>

### company_os.departments
One row is: one department in the org structure.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: HR admin; changes rarely.
Usage: org views and careers site (16,524 reads); 5 tables reference it.
Evidence: rows 9 · reads 16,524 · inserts 17 (stamped 28 Aug 2026)

### company_os.staff_assignments
One row is: one assignment of a team member to a client, project, or internal function for a period.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: staffing decisions in the admin.
Usage: who-works-on-what views (3,699 reads).
Evidence: rows 27 · reads 3,699 · inserts 42 (stamped 28 Aug 2026)

### company_os.person_qualifications
One row is: one person's sales qualification answers (goal, plan, challenge, timeline, budget, authority) as a person working the SDR queue recorded them.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: the Leads queue's Save qualification (entities/crm leads actions saveQualification, written through the org door's upsertPersonQualifications). Corrected 2026-10-09 (Z.11): this entry used to describe a certification record, which nothing stores here.
Usage: the GPCT fields on the Leads card and the person's CRM page (2,248 reads).
Reuse: the one record of a person's qualification answers. The inquiry-to-lead qualifier's suggestions live in inquiry_triage.gpct_suggested and reach this table only when a person presses Use these and Save.
Do not: write a model's suggestion here directly, or store a certification here.
Evidence: rows 1 · reads 2,248 · inserts 3 (stamped 28 Aug 2026)

### company_os.legal_entities
One row is: one of our legal entities (country, base currency, tax id).
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: Settings → Legal entities, the org entity's only writer: a Super Admin (org.legal-entities) creates a company and edits its name, legal name, country, type, base currency and active flag; Finance or a Super Admin (org.legal-registration) keeps the registration details current (tax number, business registration number, registered address, legal representative, jurisdiction, date of incorporation), as the law requires whenever they change. Every change is audited with who, when and the reason given. Seeded with three rows.
Usage: employment and invoicing joins; the red-invoice hint on every reimbursement claim reads the Vietnamese entity's legal name and tax code (552 reads).
Reuse: any fact about one of our own registered companies.
Do not: write it with SQL or from outside the org entity (the registration details are a legal record with a named owner per change), or store a client's company here (that is companies).
Columns:
- id: Primary key.
- slug: Stable short key for the entity, used in code and joins.
- name: The name people use for the company.
- legal_name: The registered legal name, exactly as on the registration certificate.
- country: The country of registration, ISO 3166-1 alpha-2.
- entity_type: The legal form (corporation, llc, …).
- base_currency: The currency the company keeps its books in, lowercase ISO 4217.
- tax_id: The tax number: Vietnam's tax code (mã số thuế), a US EIN, or the local equivalent. Null until entered.
- registration_number: The business registration number: Vietnam's enterprise code, a US state file number, or the local company number. Null until entered.
- registered_address: The official registered address, as on the registration certificate. Null until entered.
- legal_representative_person_id: The person (company_os.people) who legally represents the company (Vietnam's legal representative; a US officer or registered agent). Null until entered.
- jurisdiction: The province or state of registration. Null until entered.
- incorporated_on: The date of incorporation. Null until entered.
- active: Whether the company is currently operating.
- created_at: When the row was created.
- updated_at: When the row last changed; maintained by a trigger.
Evidence: rows 3 · reads 552 · inserts 3 (stamped 28 Aug 2026)

### company_os.company_profile
One row is: one block of our own company profile content.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: admin edits.
Usage: profile surfaces (256 reads).
Evidence: rows 4 · reads 256 · inserts 4 (stamped 28 Aug 2026)

### company_os.core_values
One row is: one company core value.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: seeded; edited rarely.
Usage: culture surfaces and coaching context.
Evidence: rows 6 · reads 88 · inserts 6 (stamped 28 Aug 2026)

### company_os.coaching_profiles
One row is: one team member's coaching profile — the standing context a coach needs.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: coaching flows; the vestigial free-text fast_goal columns were dropped 28 Aug 2026 (FAST goals are `goals` rows now).
Usage: 8 tables reference it; the coaching workspace reads it heavily (8,913 reads).
Evidence: rows 13 · reads 8,913 · inserts 29 (stamped 28 Aug 2026)
Columns:
- preferred_time: The Saigon wall-clock time the member prefers for 1-1s, copied onto each scheduled row as starts_at. Null means no preference (K.34).
- proposed_one_on_one_on: A date proposed for the next 1-1 and not yet confirmed; cleared when the coach confirms it (which books it) or declines it. Null means no open proposal (K.32).
- proposed_by: Who proposed proposed_one_on_one_on, member or coach. Null when there is no open proposal (K.32).

### company_os.coaching_ocean_profiles
One row is: one person's OCEAN personality assessment result.
Bucket: master · People & org structure
Tier: 3 support
Status: active
Origin: assessment intake.
Usage: coaching context views.
Evidence: rows 4 · reads 289 · inserts 4 (stamped 28 Aug 2026)

### Master · Customers, candidates, vendors

### company_os.person_companies
One row is: one person-to-company relationship (role, primary contact flags) — the join that makes contacts work.
Bucket: master · Customers & partners
Tier: 3 support
Status: active
Origin: CRM flows.
Usage: 16,432 reads — contact lists and company pages.
Reuse: person↔org relationships extend here; never put a company FK directly on `people`.
Evidence: rows 313 · reads 16,432 · inserts 318 (stamped 28 Aug 2026)

### company_os.candidates
One row is: one candidate in the recruiting funnel (person-like entity; becomes a `people` row on hire).
Bucket: master · Candidates
Tier: 3 support
Status: active
Origin: application intake and sourcing.
Usage: ATS surfaces (6,860 reads).
Evidence: rows 285 · reads 6,860 · inserts 289 (stamped 28 Aug 2026)

### company_os.candidate_profile
One row is: one candidate's extended profile (resume-derived, broadly readable — nothing sensitive).
Bucket: master · Candidates
Tier: 3 support
Status: active
Origin: application intake and AI resume screening.
Usage: 20,658 reads — candidate pool, ranking, interview kits, the interview-panelist AI prompt.
Do not: add salary or PII here; that belongs in `candidate_sensitive`.
Evidence: rows 291 · reads 20,658 · inserts 291 (stamped 28 Aug 2026)

### company_os.vendors
One row is: one vendor or supplier with contact, bank, and tax details.
Bucket: master · Vendors
Tier: 3 support
Status: active
Origin: ops entry.
Usage: expense joins and vendor views (6,396 reads).
Evidence: rows 23 · reads 6,396 · inserts 23 (stamped 28 Aug 2026)

### Master · Products, brand, assets

### company_os.ai_programs
One row is: one AI program engagement definition for a client.
Bucket: master · Products & offerings
Tier: 3 support
Status: active
Origin: program setup flows.
Usage: 8 tables reference it; program surfaces (1,371 reads).
Evidence: rows 22 · reads 1,371 · inserts 24 (stamped 28 Aug 2026)

### company_os.talks
One row is: one talk in our speaking catalog.
Bucket: master · Products & offerings
Tier: 3 support
Status: active
Origin: events admin.
Usage: event agendas via `event_talks`.
Evidence: rows 4 · reads 145 · inserts 4 (stamped 28 Aug 2026)

### company_os.brands
One row is: one brand we operate under.
Bucket: master · Products & offerings
Tier: 3 support
Status: active
Origin: seeded; edited rarely.
Usage: 18,959 reads against 5 rows — hot config on marketing and public surfaces.
Evidence: rows 5 · reads 18,959 · inserts 6 (stamped 28 Aug 2026)

### company_os.brand_profiles
One row is: one brand's extended profile (voice, style, positioning) used by content tooling.
Bucket: master · Products & offerings
Tier: 3 support
Status: active
Origin: brand admin; `auto_publish` added 7 Sep 2026 for the writer agent.
Usage: content generation context (305 reads); the writer agent reads every step's instructions from here.
Reuse: a brand-level switch or rule for content tooling is a column here, keyed by brand.
Do not: hard-code a word count, lens or CTA in code; the profile is the spec.
Columns:
- brand_id: FK to brands; primary key, one profile per brand.
- positioning: What the brand is and what it sells.
- audience: Who the brand writes to.
- voice_md: Tone and how the brand sounds, in markdown.
- offer: What the brand sells.
- primary_cta: The default call to action.
- content_rules_md: Legacy content rules, superseded by the split fields below.
- updated_by: Who last saved the profile.
- created_at: Row creation time.
- updated_at: Last modification time.
- author_md: Who is speaking and the credentials to draw on.
- rules_md: Hard rules the writer never breaks.
- channels_md: Per-channel guidelines with an Active channels line and ## Blog / ## LinkedIn / ## Facebook / ## Email sections; the blog word range lives here.
- process_md: The writing process the writer agent enforces step by step.
- blog_styles_md: The blog style catalogue for this brand.
- editing_lens_md: The editing checklist (Dan Shipper lens) the edit step applies.
- seo_lens_md: The SEO checklist (Neil Patel lens) the SEO step applies.
- image_style_md: Palette, typeface and real-versus-AI guidance for images and exhibits.
- preferred_blog_types: Slugs from the shared blog style catalogue.
- preferred_image_styles: Slugs from the shared image style catalogue.
- preferred_social_styles: Slugs from the shared social style catalogue.
- auto_publish: When true a writer run that passes validate publishes the post and re-derives the channel assets with no human step; false (default) parks the run at ready.
Evidence: rows 2 · reads 305 · inserts 2 (stamped 28 Aug 2026)

### company_os.equipment
One row is: one physical asset we own (laptop, monitor, device).
Bucket: master · Assets & code
Tier: 3 support
Status: active
Origin: ops entry on purchase.
Usage: asset register and assignment views (1,601 reads). No depreciation or book value — deliberate; accounting lives in QuickBooks.
Evidence: rows 29 · reads 1,601 · inserts 32 (stamped 28 Aug 2026)

### company_os.company_github_orgs
One row is: one GitHub organization mapped to a client company.
Bucket: master · Assets & code
Tier: 3 support
Status: active
Origin: tracker setup.
Usage: HTT attribution joins.
Evidence: rows 5 · reads 14 · inserts 5 (stamped 28 Aug 2026)

### company_os.person_git_emails
One row is: one git author email mapped to a person, for PR attribution.
Bucket: master · Assets & code
Tier: 3 support
Status: active
Origin: tracker setup.
Usage: HTT attribution joins.
Evidence: rows 14 · reads 29 · inserts 14 (stamped 28 Aug 2026)

### Master · Reference & rules

### company_os.leave_policies
One row is: one leave policy (entitlement rules) applied to team members.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: HR admin; changes rarely. The accrual rules and the policy text live here and balances are computed from them (entities/time-off/lib/balance.ts).
Usage: leave balance math (662 reads).
Reuse: a client's own PTO policy for staff placed with them is one more row here, assigned through `team_members.leave_policy_id`; never a per-client table.
Columns:
- id: Primary key.
- name: Policy name as shown on every surface.
- auto_approve: Whether requests under this policy approve at submission or wait on the Requests board.
- year_basis: How the leave year is counted: calendar (resets 1 January) or anniversary (resets on the anniversary of the day accrual started, see counts_from). Valid values: [calendar, anniversary]
- accrual_cadence: How often hours post to the bank: none (no paid leave), monthly (last day of the month) or semi_monthly (15th and last day). Valid values: [none, monthly, semi_monthly]
- tiers: Entitlement by service year as a JSON array of {fromYear, hoursPerYear}, ascending; the tier in force is the last whose fromYear is at or below the current service year.
- hours_per_day: Length of one working day in hours; converts between the hours the bank is kept in and the days a page shows.
- min_increment_hours: Smallest unit of leave a request may take, in hours (1 for hourly policies, 4 for half days).
- carry_cap_hours: Most hours that survive the year-end check; null carries everything, 0 carries nothing.
- bank_leave_types: Which time_off leave types deduct from this bank (for instance vacation only, or vacation plus sick and personal).
- honour_imported_balance: When true the balance walk starts from the opening balance recorded in leave_adjustments (source `legacy-import`) on 6 July 2026 instead of from the anniversary date; set for policies whose opening figures were reconciled with the client.
- counts_from: The day accrual and the leave year count from: probation_end (the first contract) or start_date. Valid values: [probation_end, start_date]
- policy_text: The policy as people read it, shown on the admin, team and client portal time-off pages. Plain text; blank lines separate paragraphs.
- created_at: Row creation time.
- updated_at: Last modification time.
Evidence: rows 2 · reads 662 · inserts 2 (stamped 28 Aug 2026)

### company_os.holidays
One row is: one public holiday relevant to leave calculation.
Bucket: master · Reference & rules
Tier: 3 support
Status: waiting
Origin: should be seeded per country per year — currently empty, which is a data gap, not a dead table.
Usage: leave math will read it once populated.
Evidence: rows 0 · reads 113 · inserts 0 (stamped 28 Aug 2026)

### company_os.boards
One row is: one work board (kanban) definition.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: work-management admin.
Usage: board views (2,339 reads).
Evidence: rows 8 · reads 2,339 · inserts 8 (stamped 28 Aug 2026)

### company_os.board_columns
One row is: one column on one board, ordered.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: board admin.
Usage: board rendering (1,324 reads).
Evidence: rows 32 · reads 1,324 · inserts 32 (stamped 28 Aug 2026)

### company_os.board_members
One row is: one person's membership on one board.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: board admin.
Usage: board access and filters (1,991 reads).
Evidence: rows 27 · reads 1,991 · inserts 34 (stamped 28 Aug 2026)

### company_os.surveys
One row is: one survey definition.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: survey admin.
Usage: pulse and event surveys (2,217 reads).
Evidence: rows 9 · reads 2,217 · inserts 18 (stamped 28 Aug 2026)

### company_os.survey_fields
One row is: one question or field on one survey.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: survey admin.
Usage: survey rendering and answer joins (4,311 reads).
Evidence: rows 94 · reads 4,311 · inserts 166 (stamped 28 Aug 2026)

### company_os.tags
One row is: one tag label that can be attached to people (e.g. a program's students), used to build email audiences.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: created on first use from the Tags card on an admin contact page (contacts owns the table since 2026-09-15); a program's student marker is the first tag.
Usage: contact page Tags card; broadcast audiences filter on it.
Reuse: any "people who are X" marker a person sets by hand (a program, a community). Relationships that follow from data (client, prospect, team) are derived, never tagged.
Do not: tag companies (use company columns), or store a status that another table already records.
Columns:
- id: Primary key.
- label: The tag as shown in the admin, as first typed.
- slug: Unique lowercase key derived from the label; adding a tag with an existing slug reuses the row.
- kind: Optional grouping of tags; unused so far.
- color: Optional display colour; unused so far.
- created_at: Row creation time.
Evidence: rows 0 · reads 131 · inserts 0 (stamped 28 Aug 2026)

### company_os.taggables
One row is: one tag attached to one person.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: the contact page Tags card (add/remove), through contacts' writers.
Usage: contact page Tags card; broadcast audiences.
Reuse: attach a `tags` row to a person; unique on (tag_id, entity_type, entity_id).
Do not: attach to anything but people until a second entity type is agreed.
Columns:
- id: Primary key.
- tag_id: FK to tags; deleting the tag removes its attachments.
- entity_type: What kind of record the tag is on. Valid values: [person].
- entity_id: The id of the tagged record; a people.id when entity_type is person.
- created_at: When the tag was attached.
Evidence: rows 0 · reads 130 · inserts 0 (stamped 28 Aug 2026)

### company_os.requisition_loop_steps
One row is: one step in a requisition's interview loop plan.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: created 13 Aug 2026 with the interview-loop feature; written from the Interview loop card on /admin/talent/jobs/[id].
Usage: /admin/talent/jobs/[id] (the loop editor), /team/hiring (the loop per requisition), the interview kit (step name).
Reuse: a step's planned interviewers live in `requisition_loop_interviewers`; a booked interview links back through interviews.loop_step_id.
Evidence: rows 0 · reads 508 · inserts 1 (stamped 28 Aug 2026)

### company_os.requisition_loop_interviewers
One row is: one person planned to interview on one requisition loop step.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: dropped 27 Aug 2026 as empty while the loop editor still wrote it; restored 27 Sep 2026 so the editor can save interviewers. Written only by setStepInterviewers in entities/hiring/lib/ats/loop.ts.
Usage: /admin/talent/jobs/[id] interviewer picker; /team/hiring "loops I am in"; the interview kit lets a planned interviewer open and score the round.
Do not: treat as a booked seat; seats are interview_interviewers, materialised on scorecard submit.
Evidence: rows 0 (restored 27 Sep 2026)

### Transactional · Revenue documents

### company_os.event_pnl_lines
One row is: one revenue or cost line on one event's P&L.
Bucket: transactional · Revenue documents
Tier: 3 support
Status: active
Origin: event finance entry.
Usage: per-event profitability views.
Evidence: rows 58 · reads 191 · inserts 60 (stamped 28 Aug 2026)

### company_os.token_purchases
One row is: one purchase of human tokens by a client (the token economy's revenue record).
Bucket: transactional · Revenue documents
Tier: 3 support
Status: waiting
Origin: will be written when token packs are sold directly.
Usage: none yet (332 reads against empty).
Evidence: rows 0 · reads 332 · inserts 0 (stamped 28 Aug 2026)

### company_os.affiliate_commissions
One row is: one commission earned by an affiliate on an attributed sale.
Bucket: transactional · Revenue documents
Tier: 3 support
Status: active
Origin: attribution flows on closed deals and orders.
Usage: affiliate statements.
Evidence: rows 3 · reads 226 · inserts 4 (stamped 28 Aug 2026)

### company_os.affiliate_payouts
One row is: one payout of accumulated commissions to an affiliate.
Bucket: transactional · Revenue documents
Tier: 3 support
Status: waiting
Origin: will be written when the first payout runs.
Usage: none yet.
Evidence: rows 0 · reads 130 · inserts 0 (stamped 28 Aug 2026)

### company_os.renewals
One row is: one renewal date of one client account — when its current agreement comes up for renewal, and how that renewal went.
Bucket: transactional · Revenue documents
Tier: 3 support
Status: active
Origin: the Renewal card on the Revenue company page (/admin/revenue/companies/[id] and /team/revenue/companies/[id]), through crm's renewal action; audited. One live row per company (partial unique index on company_id where archived_at is null); replacing a renewal archives the old row rather than deleting it.
Usage: the Revenue "Accounts needing attention" screen shows the live renewal beside each account's health and flags any within 60 days.
Reuse: any "when does this client renew" question reads the live row here. The client dates on `companies` say when the relationship started and ends; this says when the next agreement is up, which is a different question.
Do not: add an owner or assignee column; renewals describe the account, never a person. Do not store contract money here; that belongs to deals and invoices.
Columns:
- id: Primary key.
- company_id: The client account, referencing companies.id; deleting the company deletes its renewals.
- renews_on: The day the current agreement comes up for renewal.
- term_months: Length of the agreement being renewed, in months, when known.
- status: Where this renewal stands. Valid values: [upcoming, renewed, churned, lapsed]
- note: Free-text context about the renewal, in a sentence or two.
- archived_at: When the row stopped being the live renewal; rows are never hard-deleted.
- created_at: When the row was written.
- updated_at: When the row last changed; maintained by a trigger.
Evidence: rows 0 · reads 0 · inserts 0 (created 25 Sep 2026)

### Transactional · Pipeline activity

### company_os.call_transcripts
One row is: one call or meeting transcript, linked to its meeting or deal context.
Bucket: transactional · Pipeline activity
Tier: 3 support
Status: active
Origin: call recording flows; the meeting_notes fold moved note transcripts here too.
Usage: call review and scorecards (835 reads).
Evidence: rows 38 · reads 835 · inserts 39 (stamped 28 Aug 2026)

### company_os.call_scorecards
One row is: one scored review of one call against the sales rubric.
Bucket: transactional · Pipeline activity
Tier: 3 support
Status: active
Origin: sales coaching flows.
Usage: call quality views (753 reads).
Evidence: rows 6 · reads 753 · inserts 6 (stamped 28 Aug 2026)

### company_os.proposal_drafts
One row is: one proposal the proposal chain drafted from one sales call (company and meeting) — the facts it was drafted from, the sections the client would read, where its run is, and whether it was approved and published.
Bucket: transactional · Revenue documents
Tier: 3 support
Status: active
Origin: Z.10 (Automation Plan R2, 2026-10-09). Written only by entities/crm: the crm tick driver's discovery read inserts one row per due sales meeting (or the Draft a proposal button does), the driver advances it one step per tick (ADR 0015: the run's step lives in the owner's table), and the review actions apply its CRM changes, edit, approve, reject, retry and stop it. Publishing decides through kernel/approvals (subject proposal_publish); the publish itself is claimed once in automation_effects under crm:proposal:<company>:<meeting>, a key the crm-call-to-proposal skill shares.
Usage: the meeting page's Proposal panel and the proposal review page (team and admin Revenue); the public proposal route /proposals/d/<slug>, which serves html only for a published row; the client portal's proposal list through deals.proposal_url; the Z.15 watchdog check.
Reuse: the one record of a proposal drafted from a call. The unique (company_id, meeting_id) is the discovery read's idempotency key, so a second tick over the same meeting opens nothing new.
Do not: store the raw transcript in inputs or anywhere else (inputs holds ids and its hash); serve html for a row that is not published; set deals.proposal_url outside the publish step; create people or companies rows from crm_patch without a person ticking them; publish to library_documents (internal) or public/proposals (needs a PR).
Columns:
- id: Primary key.
- company_id: The client company the proposal is for.
- meeting_id: The sales call the proposal was drafted from; unique with company_id. Set null when the meeting is deleted, which stops a run in flight and keeps a published proposal.
- deal_id: The deal the proposal is attached to, whose proposal_url the publish step sets; null until a deal is chosen or created. Set null when the deal is deleted.
- mode: Whether the run acts. shadow drafts and stops at shadow-done, opening no approval and publishing nothing; live asks for approval and publishes once approved. Set from the routine switch when the run starts. Valid values: [shadow, live]
- step: Where the run is (ADR 0015). gather, extract, draft, ask, publish and record are advanced by the tick driver; ready waits on the Revenue approver's decision; done is published; rejected is closed unpublished; stopped carries its error until a person retries; shadow-done ends a shadow run. Valid values: [gather, extract, draft, ask, ready, publish, record, done, rejected, stopped, shadow-done]
- started_at: The run's epoch, part of every step's tick key; reset when a person retries or drafts again, so a fresh run gets fresh ticks.
- finished_at: When the run reached done, rejected, stopped or shadow-done; null while it runs.
- error: Why the run stopped (the last step's error after its attempts, or the meeting gone); required when step is stopped, cleared on retry.
- inputs: What the gather step read, by reference: the meeting, company, deal and people ids and the transcript's hash; never the transcript itself.
- screen: The input screening result for the transcript (flagged instruction-shaped lines, whether it was cut and at what length), shown on the review page.
- facts: What the extract step read from the call (pains, budget said, timeline, decision makers, next step, normalised product names), each with the transcript line it rests on.
- crm_patch: The CRM changes the extract step proposes (deal fields, lifecycle, contacts matched or new), applied only when a person ticks them.
- crm_applied: Which parts of crm_patch a person applied and when; an applied part is not offered again.
- ai_sections: The proposal sections exactly as the model wrote them, kept so the approver's edit can be learned from.
- sections: The proposal sections the client will read; equal to ai_sections until a person edits them.
- amount_cents: The proposal's total value in the currency's minor unit; never negative.
- currency: Lowercase ISO 4217 code of amount_cents and the line items, as deals keeps it ("usd", "aud").
- line_items: The priced lines the total is made of, each with its amount in minor units.
- slug: The unguessable URL-safe name the published page is served at, /proposals/d/<slug>; unique.
- html: The page the client would read, rendered from the fixed proposal template; served only once the row is published.
- lint: The house-style and price-band findings on the current sections, shown to the approver; never corrected silently.
- version: The content hash of the sections, amount, currency, line items, slug, deal and company that the open approval names; publishing goes ahead only when the approved version equals it.
- published_url: The live URL the publish step set on the deal; set together with published_at, and only with html, version and slug.
- published_at: When the proposal went live in the client's portal; set together with published_url.
- requested_by: The person who pressed Draft a proposal; null when the driver's discovery read started the run.
- created_at: When the row was inserted.
- updated_at: When the row last changed, stamped by the writer.

### Transactional · Marketing execution

### company_os.marketing_campaigns
One row is: one marketing campaign grouping content and email sends.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: marketing planning; writer agent run state added 7 Sep 2026 (three columns, no new table: one run per campaign is the campaign's own grain).
Usage: campaign views (1,987 reads); content links via `marketing_content`; the writer-agent cron reads `writer_step` to advance runs.
Reuse: the writer agent's run pointer lives here; each step's execution is a `routine_runs` row, and the change log is the blog asset's `notes`.
Do not: add a writer_runs table; the campaign is the run.
Columns:
- id: Primary key.
- name: Campaign name.
- idea: The approved idea in markdown; the brief the writer works from, including the sources it may quote.
- objective: What the campaign is for; sharpens the brief.
- seo_geo_md: The campaign-level search and generative-engine plan in markdown.
- status: Campaign state. Valid values: [draft, active, paused, done, archived].
- brand_id: FK to brands; whose voice and process the writer follows.
- pillar_id: FK to marketing_pillars.
- starts_on: First publish date; the blog anchors it and the channel posts stagger after it.
- ends_on: Campaign end date.
- created_by: Who created the campaign.
- created_at: Row creation time.
- updated_at: Last modification time.
- writer_step: The writer agent step to run next; null when no run is active, `ready` when a run passed every check and waits to publish, `done` when it published and re-derived the channel assets. Valid values: [draft, edit, seo, exhibits, hero, links, assemble, validate, ready, publish, channels, done].
- writer_started_at: When the current writer run was started from the hub.
- writer_error: Why the current run stopped at `writer_step`; null while advancing, cleared by retry.
- utm_campaign: The utm_campaign value the site forms send back; an inquiry arriving with it is attributed to this campaign. Lowercase slug, unique.
Evidence: rows 10 · reads 1,987 · inserts 11 (stamped 28 Aug 2026)


### company_os.email_campaigns
One row is: one email campaign (broadcast) definition and send state.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: email marketing flows.
Usage: campaign views (2,092 reads).
Columns:
- archived_at: Soft-delete timestamp; an archived broadcast leaves every list and calendar but keeps its recipients and events.
- archived_by: Email of the admin who deleted it.
Evidence: rows 4 · reads 2,092 · inserts 8 (stamped 28 Aug 2026)

### company_os.email_audiences
One row is: one saved email audience, a named set of rules resolved to people whenever a recipient list is built.
Bucket: master · Marketing & content execution
Tier: 3 support
Status: active
Origin: the Audiences page under Revenue → Marketing (since 2026-09-16).
Usage: broadcast and series audience pickers; resolved by entities/campaigns/lib/audiences.ts.
Reuse: any "who should this email reach" question; add a rule kind to `rules` rather than a new table.
Do not: store resolved people here (the rules are re-resolved each build), or use `people.persona` for new audiences.
Columns:
- id: Primary key.
- name: What the audience is called in the broadcast and series pickers.
- rules: The rules as JSON: relationships (team, client, prospect, network), companyIds, tagIds, excludeTagIds. Every non-empty list must match; within a list any value matches. Consent and do-not-contact are applied on top at build and send time.
- created_by: Email of the admin who created it.
- created_at: Row creation time.
- updated_at: Last modification time.
- archived_at: Soft-archive timestamp; null means the audience can be picked.

### company_os.email_series
One row is: one recurring broadcast that opens a draft issue every week for its saved audience.
Bucket: master · Marketing & content execution
Tier: 3 support
Status: active
Origin: the Series page under Revenue → Marketing (since 2026-09-16); issues are opened by the hourly email-series-draft cron.
Usage: the series cron and editor; issues are email_campaigns rows with series_id.
Reuse: any email that repeats on a weekly schedule.
Do not: send from here directly; every issue is an ordinary broadcast that a person approves.
Columns:
- id: Primary key.
- name: Series name; each issue is named after it and its send date.
- audience_id: FK to email_audiences; the audience every issue is built for.
- brand_id: FK to brands; the brand identity each issue sends as.
- subject: Default subject line for a new issue, edited per issue before approval.
- body_template: Markdown body each new issue starts from. Filled when the issue opens: {next_coaching}, {latest_post}, {intro}. Filled per recipient at send: {first_name}, {certification_progress}, {coaching_progress}, {micro_session}.
- from_email: Sender address for issues; falls back to the marketing default when null.
- reply_to: Reply-to address for issues; falls back to the marketing default when null.
- time_zone: IANA zone the draft and send moments are read in, e.g. Australia/Perth.
- draft_weekday: Day the issue draft opens, 0 = Sunday. Valid values: [0, 1, 2, 3, 4, 5, 6].
- draft_hour: Hour (0-23, in time_zone) the issue draft opens.
- send_weekday: Day the issue sends, 0 = Sunday. Valid values: [0, 1, 2, 3, 4, 5, 6].
- send_hour: Hour (0-23, in time_zone) the issue sends once approved.
- batch_size: Emails per send tick for each issue.
- active: Whether the series cron opens new issues; false pauses the series.
- created_by: Email of the admin who created it.
- created_at: Row creation time.
- updated_at: Last modification time.
- archived_at: Soft-archive timestamp; an archived series opens no issues.

### company_os.email_agents
One row is: one personal email agent, the context it may read, its rhythm and the audience it writes to.
Bucket: master · Marketing & content execution
Tier: 3 support
Status: active
Origin: the Personal pages under Revenue → Marketing (since 2026-09-18); nothing else writes it.
Usage: the hourly agent cron (which people are due, which sources to read, which skill to run) and the Personal pages.
Reuse: any email written for one person from their data. A new kind of context is a new source key in `sources`, never a new agent table.
Do not: store the brief here (it is versioned in `email_agent_skills`), or store a per-person "next due" (it is computed from the last sent message plus `cadence_days`).
Columns:
- id: Primary key.
- name: What the agent is called, for example "AIO student check-in".
- brand_id: FK to brands; the identity it sends as.
- audience_id: FK to email_audiences; who it writes to.
- from_email: Sender address; null falls back to the marketing default.
- reply_to: Reply-to address; null falls back to the marketing default.
- sources: JSON list of the source keys the agent may read about a person: learner_progress, coaching, crm, past_emails, tags.
- cadence_days: Days between messages to the same person.
- send_hour: Hour (0-23) to send, read in the person's time zone, falling back to the brand's.
- review_mode: Whether every message waits for a person or a sample releases the rest. Valid values: [hold_all, sample].
- sample_size: Messages per run a person reads before the rest release, when review_mode is sample.
- max_words: Upper bound the validator enforces on the body.
- active: Whether the cron runs it; false pauses the agent.
- created_by: Email of the admin who created it.
- created_at: Row creation time.
- updated_at: Last modification time.
- archived_at: Soft-archive timestamp; an archived agent runs no more.

### company_os.email_agent_skills
One row is: one version of one personal email agent's brief (the skill), so every message records which version wrote it.
Bucket: master · Marketing & content execution
Tier: 3 support
Status: active
Origin: the agent page's skill editor; every save is a new version, nothing is edited in place.
Usage: the agent cron runs the latest version; the queue and the message record cite the version that wrote them.
Reuse: the brief for any per-person writing agent; compare reply rates by version before rewriting.
Do not: edit a row after a message cites it; add a new version instead.
Columns:
- id: Primary key.
- agent_id: FK to email_agents.
- version: 1, 2, 3; unique per agent. The agent runs its latest.
- body_md: The skill as Markdown: goal, voice, structure, rules, example emails.
- note: One line on what changed and why.
- created_by: Email of the admin who wrote it.
- created_at: Row creation time.

### company_os.email_messages
One row is: one email written for one person by one personal email agent, from draft through send.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: the agent cron drafts and holds; the queue approves, edits, skips or cancels; the send cron claims, sends and stamps.
Usage: the queue per agent, the send cron (approved rows past send_after), the cadence rule (last sent per person and agent), the Schedule calendar head counts.
Reuse: any per-person email with a draft lifecycle. The send fields (send_after, claimed_at, sent_at, resend_email_id, error) mirror `email_campaign_recipients`, so the one send cron serves both.
Do not: put a broadcast recipient here (that is `email_campaign_recipients`); log the sent email a second time (the `interaction_id` row is the CRM touch).
Columns:
- id: Primary key.
- agent_id: FK to email_agents.
- skill_id: FK to email_agent_skills; the version that wrote it.
- person_id: FK to people.
- routine_run_id: FK to routine_runs; the run that drafted it, so Settings > Agents links straight to its output.
- status: Where the message is. Valid values: [drafted, held, approved, sending, sent, skipped, cancelled].
- hold_reason: Why the validator held it: a fact with no source, a rule broken, over length.
- skip_reason: Why it was not written: no consent, do not contact, emailed within cadence, nothing new to say.
- subject: The email subject.
- body_md: The email body as Markdown.
- facts: JSON list of the gathered facts the writer was given, each dated and sourced, shown beside the draft in review.
- edited_at: Set when a person changed the body before approving.
- approved_by: Email of the admin who released it.
- approved_at: When it was released.
- send_after: Earliest send moment, from the agent's send_hour in the person's zone.
- claimed_at: When a send tick claimed the row, so two ticks never mail the same person.
- sent_at: When Resend accepted the send.
- resend_email_id: Resend's id for the sent email; email_events match on it.
- error: The send error, when the send failed.
- interaction_id: FK to interactions; the CRM touch written on send, so the next run reads what we said.
- created_at: Row creation time.
- updated_at: Last modification time.

### company_os.email_campaign_recipients
One row is: one recipient of one email campaign send.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: send runs (61 inserts historically; purged after processing).
Usage: send processing; empty between sends is normal.
Evidence: rows 0 · reads 223 · inserts 61 (stamped 28 Aug 2026)

### company_os.email_events
One row is: one email engagement event (delivery, open, click) from the send provider.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: provider webhooks (10 inserts historically; purged).
Usage: campaign engagement reporting; personal email results by message.
Columns:
- message_id: FK to email_messages; set when the event is about a personal email, beside campaign_id for a broadcast.
Evidence: rows 0 · reads 661 · inserts 10 (stamped 28 Aug 2026)

### company_os.marketing_asset_images
One row is: one image in the marketing image library, keyed to a content entry (`entry_id`).
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: active
Origin: image generation and upload flows; 69 rows backfilled from single-pointer image_url columns on 28 Aug 2026.
Usage: content image pickers (`lib/admin/marketing-images.ts`).
Evidence: rows 126 · reads 397 · inserts 137 (stamped 28 Aug 2026)

### company_os.marketing_pillars
One row is: one marketing pillar for categorizing content.
Bucket: transactional · Marketing & content execution
Tier: 3 support
Status: hold
Origin: created 22 Aug 2026; one insert, since deleted; heavily queried (11,336 reads) — a feature mid-build.
Usage: marketing surfaces query it on most page views. Re-verdict with the feature owner in September. TODO(owner)
Evidence: rows 0 · reads 11,336 · inserts 1 (stamped 28 Aug 2026)

### Transactional · Delivery & work

### company_os.task_comments
One row is: one comment on one task.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: task detail UI — shipped and working; zero comments ever left (product adoption question, not a schema one).
Usage: task detail reads it on every view (5,032 reads).
Evidence: rows 0 · reads 5,032 · inserts 0 (stamped 28 Aug 2026)

### company_os.task_attachments
One row is: one deliverable on one card — a file in the private card-attachments bucket, or a link — what the card's work produced, other than its PR.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: the card drawer's Deliverables section, through the Boards entity's attachment actions (W.128, W.155), the only writers. A file row is inserted unconfirmed when its upload starts and confirmed only after the server has read the stored object's real size and type; a link row is confirmed when inserted. A daily Boards sweep deletes unconfirmed rows older than a day with their objects (W.157).
Usage: the card drawer lists a card's live, confirmed deliverables; the workboard loader counts them for the paperclip on team boards (W.158). The client portal never reads it.
Reuse: any file or link attached to a card as a deliverable. The card's PR is not one: it stays in tasks.metadata.pr_url. A file attached to a person or a company is `documents`; to an AI program, `program_documents`.
Do not: store a PR here (the drawer offers a pull-request link for the PR field instead), serve a row to the portal, or delete a row a person removed (archive it; the sweep purges the object later). Do not reuse `documents`, whose readers infer the bucket from the row's type and which cannot hold a link.
Columns:
- id: Primary key.
- task_id: The card (company_os.tasks) the deliverable belongs to; the row is deleted with its card.
- kind: Whether the deliverable is a stored file or a link. Valid values: [file, link]
- storage_path: For a file, the object's path in the card-attachments bucket (task/<task id>/<random id>-<name>); unique. Null for a link.
- filename: For a file, the name it was uploaded with, as people see it. Null for a link.
- mime_type: For a file, the MIME type the server read from the stored object on confirm. Null for a link.
- size_bytes: For a file, the stored object's size in bytes as the server read it on confirm. Null for a link.
- width: For an image, its width in pixels, when known. Null otherwise.
- height: For an image, its height in pixels, when known. Null otherwise.
- url: For a link, its address; http or https only. Null for a file.
- title: For a link, the words shown for it; for a file, an optional caption. Null when there is none.
- uploaded_by: The person (company_os.people) who added the deliverable; null when the adder has no person record or that person was removed.
- confirmed_at: When the deliverable became real: a file once the server confirmed the stored object, a link when it was added. Null while an upload is unfinished; unconfirmed rows are never shown.
- created_at: When the row was inserted (for a file, when its upload started).
- archived_at: When the deliverable was removed from the card. Null while it is live; the sweep purges an archived file's object after 30 days.
- archived_by: The person (company_os.people) who removed it; null while it is live.

### company_os.issues
One row is: one tracked issue or bug in internal work.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: work-management flows.
Usage: issue views (249 reads).
Evidence: rows 1 · reads 249 · inserts 5 (stamped 28 Aug 2026)

### company_os.meeting_participants
One row is: one person's participation in one meeting.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: calendar sync and meeting flows.
Usage: meeting detail views (543 reads).
Evidence: rows 16 · reads 543 · inserts 16 (stamped 28 Aug 2026)

### company_os.meeting_associations
One row is: one polymorphic link stating what a meeting is about — (meeting_id, entity_type, entity_id) to a deal, company, or project.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: meeting flows; renamed from `meeting_links` 28 Aug 2026 (per-meeting URLs live on `meetings` itself).
Usage: meeting context rendering.
Reuse: new meeting-to-entity relations are `entity_type` values here, not new join tables.
Evidence: rows 12 · reads 351 · inserts 12 (stamped 28 Aug 2026)

### company_os.meeting_action_items
One row is: one action item captured from a meeting.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: meeting note flows: the coaching Zoom ingest (entities/coaching, origin null), and since Z.13 the meeting-to-actions chain (entities/crm, origin meeting-actions), which writes one row per action item a client meeting agreed.
Usage: follow-up views (419 reads); the client meeting page's Actions and follow-up panel; the boards meeting-cards filer, which files the to_file rows as Workboard cards through crm's door and writes the card back through crm's writer.
Reuse: an action item agreed in a meeting. A chain row is keyed by (meeting_id, position), so a retried extract reuses its rows instead of asking the model again.
Do not: set file_state on a row the chain did not write; file a card for a row except through the boards filer, whose once-index on tasks (subject_type meeting_action_item) is what keeps it to one card.
Columns:
- origin: Which flow wrote the row: meeting-actions for the Z.13 chain; null for the coaching ingest and older rows. A row has a file_state exactly when origin is meeting-actions.
- owner_side: Who the meeting said owns the action. Valid values: [edge8, client, unclear]
- owner_name: The owner's name as the meeting said it, matched only against the names the chain supplied to the model; the card's assignee is resolved from it by exact folded name, never fuzzily.
- evidence: The verbatim transcript line the action was taken from; the chain drops an item whose evidence is not in the transcript.
- file_state: Where the chain's row is on its way to a card. to_file waits for the boards filer; filed has its task_id; needs_board waits for a person to pick a board; client is the client's own action, listed in the follow-up and never carded; proposed is a shadow run's item, never filed; dismissed was set aside by a person. Valid values: [proposed, to_file, filed, needs_board, client, dismissed]
- file_note: Why the row was not filed or not assigned as asked (several boards, no board, no board member by that name), in a sentence.
- task_id: The Workboard card the row was filed as; null until filed, and again if the card is deleted.
- shadow_mark: A person's verdict on a shadow run's proposed item, the chain's precision measure before it goes live. Valid values: [useful, not_useful]
Evidence: rows 9 · reads 419 · inserts 9 (stamped 28 Aug 2026)

### company_os.bookings
One row is: one external booking made against an availability block.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: public booking flow.
Usage: scheduling surfaces (1,317 reads).
Evidence: rows 1 · reads 1,317 · inserts 5 (stamped 28 Aug 2026)

### company_os.capacity_commitments
One row is: one block of weekly hours of one capacity role already promised to a client or to internal work, over a date range.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: the Operations -> Capacity screen (entities/org), an admin action; `source` records what prompted it. Nothing writes it automatically yet.
Usage: the capacity forecast and the fit check on /admin/operations/capacity sum it per role per week against capacity_roles.
Reuse: any promise of a role's hours — a won deal, an approved requisition, a work request — is a row here, so the forecast sees it. A commitment counts in every week it overlaps.
Do not: name a person; commitments are by role (house rule). Do not store the deal's value or the client's name here — the company is `company_id`, the money lives on the deal.
Columns:
- id: Primary key.
- role_id: The capacity role whose hours are committed, referencing capacity_roles.id; deleted with the role.
- company_id: The client the hours are for, referencing companies.id; null means internal work.
- hours_per_week: Hours per week of the role this commitment takes. Greater than zero.
- starts_on: The first date the commitment covers.
- ends_on: The last date the commitment covers; null means open-ended. Never before starts_on.
- source: What prompted the commitment. Valid values: [manual, deal, requisition, work_request]
- note: Free-text context, e.g. the deal or the scope it covers.
- archived_at: When the commitment was archived. A non-null value drops it from the forecast; rows are never hard-deleted.
- created_at: Row creation time.
- updated_at: When the row last changed; maintained by a trigger.
Evidence: <generated line>

### Transactional · Spend

### company_os.expenses
One row is: one expense mirrored from QuickBooks — QuickBooks is the system of record.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: QBO sync (`source`, `external_id`, `lines` jsonb, `synced_at`). `company_id` is the one exception and is ours: set here, never by the sync.
Usage: spend views; the Revenue hub's delivery-cost and gross-margin figures read `company_id` and `amount_cents` by `incurred_on`'s month.
Reuse: attributing spend to a client belongs in `company_id` on this row, not in a second table beside it.
Do not: write expenses here; enter them in QuickBooks. Do not backfill `company_id` from a category name — every row today is a P&L category summary (`txn_type` 'pnl_summary'), which is the wrong grain for a client.
Columns:
- company_id: The client this expense was incurred for, when it was incurred for one. Ours, not QuickBooks': the sync owns every other column, and this one is set by the per-transaction expense sync once it lands, or by hand in the admin. Null means unattributed, which the Data health tab counts and the margin card reports as unknown cost rather than silently treating as zero.
Evidence: rows 30 · reads 151 · inserts 61 (stamped 28 Aug 2026)

### company_os.contractor_payments
One row is: one monthly payment decision for a contractor (hours, amount, status).
Bucket: transactional · Spend
Tier: 3 support
Status: waiting
Origin: will be written by the contractor payment flow.
Usage: none yet.
Evidence: rows 0 · reads 159 · inserts 0 (stamped 28 Aug 2026)

### company_os.contractor_work_requests
One row is: one request for contractor work with scope and rate.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: contractor management flows.
Usage: contractor admin (703 reads).
Evidence: rows 3 · reads 703 · inserts 3 (stamped 28 Aug 2026)

### company_os.contractor_work_events
One row is: one event in a contractor work request's lifecycle.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: contractor management flows.
Usage: request timelines.
Evidence: rows 7 · reads 118 · inserts 7 (stamped 28 Aug 2026)

### company_os.equipment_assignments
One row is: one assignment of one asset to one person for a period.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: ops flows.
Usage: asset views (305 reads).
Evidence: rows 35 · reads 305 · inserts 44 (stamped 28 Aug 2026)

### company_os.equipment_requests
One row is: one request for equipment by a team member.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: team requests.
Usage: ops queue (289 reads).
Evidence: rows 2 · reads 289 · inserts 2 (stamped 28 Aug 2026)

### Transactional · People operations

### company_os.approvals
One row is: one request for somebody's decision and its outcome — a leave request, a contractor estimate or submitted work, an assistant action — whatever flow raised it.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: the approvals primitive (kernel/approvals/requests.ts, S.5), called by each flow: time off when an employee requests leave, contractor requests when an estimate or work is submitted, the admin assistant when a privileged action is approved or declined. Nothing else writes it.
Usage: "Waiting on you" on the admin home and /team/approvals read pending rows by approver; every decision leaves its row, so the table is also the one record of who was asked and who answered.
Reuse: any new flow that needs someone's approval adds a subject type in kernel/approvals/vocabulary.ts and calls the primitive, rather than a fourth request/decide implementation.
Do not: treat it as the flow's own state (the leave row's status and the work request's lifecycle stay the truth about those), or write it from anywhere but kernel/approvals/requests.ts.
Columns:
- id: Primary key.
- subject_type: What is being approved: a word from kernel/approvals/vocabulary.ts (time_off, contractor_estimate, contractor_work, assistant_action). Vocabulary in code, not a check constraint, so a new flow needs no migration.
- subject_id: The thing being approved within its type: the leave row's id, the work request's id, the assistant's tool-call id. Text, because not every subject is a row.
- requested_by: The person who asked, referencing people.id, when the flow knows them.
- approver_person_id: The person who must decide, as the flow resolved it, referencing people.id. Null with approver_permission null means any admin.
- approver_permission: The permission whose holders may decide ("reimbursements.check"), when the request waits on a role rather than a person; null for a request addressed to a person or to any admin.
- state: Where the request stands. Valid values: [pending, approved, rejected, cancelled]
- decided_by: The person who decided or withdrew it, referencing people.id, when known.
- decided_at: When it was decided or withdrawn.
- reason: The decider's note, when the flow asks for one.
- metadata: The line the lists show (`label`) and any flow detail worth keeping with the decision.
- created_at: When the request was raised.
- updated_at: When the row last changed; maintained by a trigger.
Evidence: <generated line>

### company_os.reimbursement_claims
One row is: one claim — a team member's request to be paid back for money they spent on Edge8's behalf, moving as one thing through checking, approval and payment.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: the Reimbursements entity's claim-lifecycle module (entities/reimbursements), the only writer: the owner's moves (create, submit, withdraw, resubmit, delete a never-submitted draft), the checker's and the approver's decisions, the payment-run cron and the payer's moves. Nothing else writes it; the assistants' SQL roles are revoked.
Usage: My claims, the To check and To approve queues, the payment run, the month-end export and a trip's cost, all inside the Reimbursements entity.
Reuse: any request to be paid back for a personal outlay on company business. A paid claim becomes an expense in the books, which is QuickBooks' `expenses` mirror, not this table.
Do not: call it an expense, write it from outside entities/reimbursements, delete a claim that was ever submitted (a trigger refuses it; receipts are kept 10 years), or copy bank details onto it (they live on people_sensitive).
Columns:
- id: Primary key.
- person_id: The person who claims and is paid back (company_os.people); their bank details are on people_sensitive.
- team_member_id: The employment (company_os.team_members) the claim was made under, so a claim stays attributable after the person leaves.
- title: The claim's name as its owner wrote it ("Australia trip – taxis").
- trip_event_id: The trip the claim belongs to, an events row; null when it names none.
- status: Where the claim stands; changed only by the claim-lifecycle module. Valid values: [draft, submitted, checked, sent_back, rejected, approved, in_run, paid]
- submitted_at: When the claim was last submitted; null while it was never submitted. A never-submitted draft is the only claim that may be deleted.
- checked_at: When a checker confirmed it.
- checked_by: The person (company_os.people) who checked it.
- approved_at: When it was approved; the payment run's cut-off is read against this.
- approved_by: The person (company_os.people) who approved it.
- approved_total_vnd: The approved items' total in whole VND, frozen at approval; the payment run reads it and never recomputes it.
- in_run_at: When a payment run took the claim.
- paid_at: When the payment covering it was recorded.
- payment_run_id: The payment run (reimbursement_payment_runs) that took the claim; null until then.
- payment_id: The reimbursement payment (reimbursement_payments) that paid it; null until then.
- metadata: Flow detail worth keeping with the claim that has no column of its own.
- created_at: When the claim was started.
- updated_at: When the row last changed; maintained by a trigger.
Evidence: <generated line>

### company_os.reimbursement_claim_items
One row is: one claim item — one receipt inside a claim: what was bought, where, when, from whom, its category, the amount in its original currency, and its value in VND.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: the Reimbursements entity only: the owner adds and edits items while the claim is a draft or sent back; the AI receipt reading fills ai_reading and ai_flags; a checker declines an item.
Usage: the claim screens, the checker's line-by-line view, the approved total, the month-end export.
Reuse: every receipt of a claim, whatever its currency or country.
Do not: store a rate anywhere but on the item (the rate is a stored fact per item, so a later rates change moves no claim), or delete an item of a claim that was ever submitted (a trigger refuses it; mark it removed instead).
Columns:
- id: Primary key.
- claim_id: The claim (reimbursement_claims) the item belongs to; deleted with a deletable draft.
- position: The item's order within its claim.
- description: What was bought, as the owner wrote it; required when the category is other.
- seller: Who sold it, as the owner or the AI reading wrote it.
- bought_on: The date of the purchase, which the VND rate is read for.
- category: The item's category. Valid values: [transport, flights, accommodation, meals_travel, client_entertainment, software, equipment, training_events, other]
- bought_in_vietnam: Whether the item was bought in Vietnam, which requires a red invoice; the app defaults it to true for VND.
- amount_cents: The amount paid in the item's currency, in minor units (whole dong for VND, a zero-decimal currency).
- currency: The currency it was paid in, lowercase ISO 4217 ("vnd", "aud").
- amount_vnd: The item's value in whole VND; null while no rate is known.
- fx_rate: VND per one unit of the currency that amount_vnd was computed with; 1 for VND.
- fx_source: Where the rate came from. Valid values: [none, techcombank, vietcombank, manual, card]
- fx_as_of: The date the rate is for.
- charged_vnd: What the owner's card actually charged in VND, when they entered it; it wins over the rate.
- lost_receipt_note: The owner's written explanation for a receipt lost abroad; never allowed on an item bought in Vietnam.
- ai_reading: The AI receipt reading's structured output (amount, currency, date, seller, category, red-invoice buyer and tax code); a suggestion, never a decision.
- ai_flags: Warnings for the checker. Valid values: [buyer_not_organisation, buyer_tax_code_differs, unreadable, possible_duplicate, older_than_90_days, not_a_red_invoice]
- duplicate_of_item_id: The earlier item (reimbursement_claim_items) this one looks like a duplicate of, when flagged.
- declined_at: When a checker or the approver declined this item; it stays on the claim and leaves the approved total.
- declined_by: The person (company_os.people) who declined it.
- decline_reason: Why it was declined.
- removed_at: When the owner took this item off a claim that had already been submitted; it stays on the claim, out of every total, because nothing ever submitted is deleted. Null while it counts.
- removed_by: The person (company_os.people) who took the item off.
- remove_reason: Why the owner took it off, in their words.
- rebill: Whether the item is to be rebilled to a client; a tag for filtering and the export, nothing more.
- rebill_company_id: The client (company_os.companies) to rebill, when rebill is set.
- created_at: When the item was added.
- updated_at: When the row last changed; maintained by a trigger.
Evidence: <generated line>

### company_os.reimbursement_files
One row is: one stored document — a receipt or red invoice on a claim item, or a bank receipt on a reimbursement payment — in the private reimbursement-receipts bucket.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: the Reimbursements entity's upload actions, the only writer: a row is inserted unconfirmed when its upload starts and confirmed only after the server has read the stored object (a red invoice must be a PDF); a daily sweep removes unconfirmed rows older than a day with their objects.
Usage: the claim screens and the checker's view (through 60-second signed URLs), the paid email's link, the month-end export.
Reuse: any document attached to a claim item or a reimbursement payment.
Do not: serve an object without the app's permission check, keep a bank receipt anywhere else, or delete a file of a claim that was ever submitted, or any bank receipt (a trigger refuses it; documents are kept 10 years; mark it replaced instead).
Columns:
- id: Primary key.
- kind: What the document is. Valid values: [receipt, red_invoice, bank_receipt, bank_deduction]
- claim_item_id: The claim item (reimbursement_claim_items) a receipt or red invoice belongs to; null for a bank receipt.
- payment_id: The reimbursement payment (reimbursement_payments) a bank receipt belongs to; null otherwise.
- storage_path: The object's path in the reimbursement-receipts bucket; unique.
- filename: The name it was uploaded with, as people see it.
- mime_type: The MIME type the server read from the stored object on confirm.
- size_bytes: The stored object's size in bytes as the server read it on confirm.
- sha256: The object's SHA-256, for duplicate detection.
- page_count: For a PDF, its number of pages, when known.
- uploaded_by: The person (company_os.people) who uploaded it.
- confirmed_at: When the server confirmed the stored object; null while an upload is unfinished, and such rows are never shown.
- replaced_at: When the owner set this receipt or red invoice aside in favour of another on a claim that had already been submitted; it stays, shown as replaced, because nothing ever submitted is deleted. Null while it is current.
- replaced_by: The person (company_os.people) who set it aside.
- created_at: When the row was inserted, which is when its upload started.
Evidence: <generated line>

### company_os.reimbursement_claim_events
One row is: one transition of one claim — submitted, withdrawn, checked, sent back, rejected, approved, taken into a run, paid or returned to approved — with who did it and why.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the claim-lifecycle module, in the same step as the transition it records. Append-only: a trigger refuses any update, and any delete except the cascade of a deletable draft.
Usage: a claim's history on its screens; the record of who checked and who approved.
Reuse: the complete history of a claim. Who was asked to decide, and what is waiting on whom, is company_os.approvals.
Do not: edit or delete a row, or treat it as the claim's state (reimbursement_claims.status is the state; this table is why).
Columns:
- id: Primary key.
- claim_id: The claim (reimbursement_claims) that moved.
- from_status: The status it left; null for a claim's first event. Valid values: [draft, submitted, checked, sent_back, rejected, approved, in_run, paid]
- to_status: The status it reached. Valid values: [draft, submitted, checked, sent_back, rejected, approved, in_run, paid]
- actor_person_id: The person (company_os.people) who moved it; null for the payment-run cron.
- reason: The reason given when the move needs one (sent back, rejected, returned to approved).
- declined_item_ids: The items declined in this decision, if any.
- metadata: Detail of the move: the approved total at approval, the run, the payment.
- created_at: When the move happened.
Evidence: <generated line>

### company_os.reimbursement_payment_runs
One row is: one payment run — the list of everyone to pay back, built at 08:00 Vietnam time on the 1st or the 15th from the claims approved before its cut-off.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: the Reimbursements entity's payment-run builder, called by its cron and by the payer's "Build the run for a date" action; run_date is unique, so building twice is harmless.
Usage: Finance's payment run screens, the run-built and run-paid notices, the month-end export.
Reuse: the twice-monthly reimbursement run. Payroll runs are payroll_runs_sensitive.
Do not: put bank details on it (they are read live from people_sensitive while paying), or build a run with no claims (there is none and no notice).
Columns:
- id: Primary key.
- run_date: The day the run is for, the 1st or the 15th; unique, the idempotency key.
- cutoff_at: 00:00 Asia/Ho_Chi_Minh on run_date; claims approved before it are in the run.
- built_at: When the run was built.
- status: Where the run stands. Valid values: [open, paid]
- claims_count: How many claims the run took.
- people_count: How many people it pays.
- total_vnd: What it pays in total, in whole VND.
- notified_at: When the run-built notice went to accounting@ and the Lark Operations chat; null until then.
- paid_at: When the last payment in it was recorded.
- created_at: When the row was inserted.
Evidence: <generated line>

### company_os.reimbursement_payments
One row is: one reimbursement payment — one bank transfer that pays one person for their claims in one run, recorded with the bank's receipt and the VND actually sent.
Bucket: transactional · Spend
Tier: 3 support
Status: active
Origin: the payment-run builder creates one per person (to_pay); the payer records it paid, one at a time, with that person's bank receipt.
Usage: Finance's run screen, the paid email, the month-end export.
Reuse: any transfer paying back approved claims.
Do not: store a full account number (only the bank name and last four digits, as a masked snapshot), or mark it paid without a bank receipt.
Columns:
- id: Primary key.
- run_id: The payment run (reimbursement_payment_runs) it belongs to.
- person_id: The person (company_os.people) it pays.
- amount_vnd: What is owed: the sum of that person's claims' approved_total_vnd in the run, whole VND.
- paid_vnd: The VND actually sent, as Finance entered it from the bank receipt.
- status: Where it stands. Valid values: [to_pay, paid]
- paid_at: When it was recorded paid.
- paid_by: The person (company_os.people) who recorded it.
- bank_receipt_file_id: The bank's receipt for the transfer (reimbursement_files).
- bank_name_snapshot: The bank paid into, as it was when paid.
- bank_account_last4: The last four digits of the account paid into, as it was when paid.
- created_at: When the row was inserted.
Evidence: <generated line>

### company_os.reimbursement_fx_rates
One row is: one day's selling rate of one currency in VND from one source, used to value claim items bought abroad.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: the Reimbursements entity's rate lookups (Techcombank's selling transfer rate first, Vietcombank's for a currency or a day Techcombank cannot answer; each answer kept as it is fetched, and by the daily 07:30 cron) and a checker's manual entry.
Usage: valuing a claim item in VND on its purchase date; the item keeps the rate it was valued at.
Reuse: historical VND rates by date. Today's USD reporting rate is company_os.fx_rates.
Do not: use it for USD reporting, or edit a rate an item already used (items store their own rate).
Columns:
- rate_date: The day the rate is for.
- currency: The currency, lowercase ISO 4217.
- source: Who published the rate. Valid values: [techcombank, vietcombank, manual]
- rate_vnd: VND per one unit of the currency (the bank's selling rate).
- fetched_at: When the rate was fetched or entered.
- entered_by: The person (company_os.people) who entered a manual rate; null for a fetched one.
Evidence: <generated line>

### company_os.time_off
One row is: one leave request with type, dates, and approval state.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: team leave requests and HR entry.
Usage: leave views and balance math (8,605 reads).
Evidence: rows 309 · reads 8,605 · inserts 310 (stamped 28 Aug 2026)

### company_os.leave_adjustments
One row is: one manual adjustment to a person's leave balance.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: HR adjustments.
Usage: balance math (396 reads).
Evidence: rows 52 · reads 396 · inserts 60 (stamped 28 Aug 2026)

### company_os.applications
One row is: one candidate's application to one requisition, through the funnel.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: careers site applications and sourcing.
Usage: the ATS core (9,915 reads); stage moves log to `application_stage_log`.
Columns:
- chain_step: The step the hiring chain (Z.9) runs next for this application, or waits at; null when the application is not in a chain run. Valid values: [screen, triage, draft-invite, draft-decline, message-ready, send, interviewing, ask-decision, decision-ready, decide, closed].
- chain_started_at: When this application's chain run started; part of every step's tick, so a run started again reaches its first step anew.
- chain_error: Why the driver stopped the run after three failed attempts at one step; null while the run is healthy. Retry clears it.
- chain_proposal: A recruiter's proposed decision waiting for the approver, as {outcome, reason, proposedBy}; outcome is hired or rejected. Null when no decision is proposed.
- ai_screen_flags: What the resume pre-check and the screening model found in the candidate's own documents that reads as instructions to a reader or as hidden text, as an array of {source, kind, quote}; null before a screen. A flag holds the application for a person; it never advances or declines it.
Evidence: rows 319 · reads 9,915 · inserts 329 (stamped 28 Aug 2026)

### company_os.candidate_messages
One row is: one email the hiring chain drafted for one candidate on one application — an interview invitation, a decline, or a hire or rejection decision — from draft through a person's approval to send.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: Z.9 hiring chain. Drafted from templates by its draft steps (entities/hiring), edited and approved by holders of hiring.approve, sent once by its send step through sendTransactionalEmail.
Usage: the Candidate messages card on the application page; the send step's claim; the Shadow panel on the requisition page reads the shadow rows.
Reuse: every message the system sends a candidate. A sent email is also logged to interactions as before; this table holds the draft, its approval and the send claim.
Do not: draft from resume text (the templates interpolate only allowed facts); send a row that is not approved at its current version; use email_messages, which belongs to the personal email agent.
Columns:
- id: Primary key.
- application_id: The application the message is about.
- person_id: The candidate's person row, when there is one.
- kind: Valid values: [invite, decline, decision_hire, decision_reject].
- stage_id: The interview stage an invitation is for; null for other kinds.
- mode: Valid values: [shadow, live]. shadow rows are what a run in shadow mode would have sent; they are never approved or sent.
- status: Valid values: [pending, approved, sending, sent, withdrawn, failed]. pending waits for the approver; approved may be sent; sending is claimed by a send step; sent went out; withdrawn was not sent (Don't send, a closed requisition, an archived application); failed could not be sent for a reason retrying cannot fix.
- to_email: The address the message goes to, read from the candidate's person row when drafted.
- subject: The email subject.
- body_md: The message body as it will be sent (Markdown), after any edit by the approver.
- drafted_body_md: The body as the chain drafted it, kept beside what went out.
- version: A hash of recipient, subject and body; the approval is for this version, and the send step refuses any other.
- send_key: The effect's idempotency key, hiring:msg:<application>:<kind>[:<stage>], also sent as Resend's Idempotency-Key; one live message in flight per key.
- provider_ref: Resend's message id once sent; null otherwise.
- run_tick: The chain step's tick that drafted the row.
- error: Why the last send failed; null otherwise.
- approved_by: The person who approved it.
- approved_at: When it was approved.
- claimed_at: When a send step claimed it.
- sent_at: When it was sent; set exactly when status is sent.
- created_at: Row insert time.
- updated_at: Last change.

### company_os.hiring_shortlists
One row is: one shortlist the hiring chain proposed for one requisition in one round — each screened application in an advance, decline or hold lane — decided once by the approver.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: Z.9 hiring chain's shortlist step (a rule over the stored AI rating and flags, no model call); lane edits by the approver; the apply step marks it applied.
Usage: the shortlist review on the requisition page; the Shadow panel compares shadow rounds with what the recruiter did.
Reuse: the one record of proposed shortlists. Stage moves still log to application_stage_log.
Do not: treat a lane as a decision before the shortlist is approved; store resume text in items.
Columns:
- id: Primary key.
- job_requisition_id: The requisition the shortlist is for.
- round: 1 for the first shortlist of a requisition, one more for each after it.
- mode: Valid values: [shadow, live]. shadow rows are what a run in shadow mode would have proposed; they are never approved or applied.
- status: Valid values: [proposed, approved, rejected, withdrawn, applied]. proposed waits for the approver; applied once its lanes moved the applications.
- items: The lanes, as an array of {application_id, lane, rating, flags, reason}; lane is advance, decline or hold.
- version: A hash of the round and every item's application and lane; the approval is for this version.
- created_at: Row insert time.
- decided_at: When it was approved, rejected, withdrawn or applied.

### company_os.application_stages
One row is: one stage instance in one application's funnel.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: ATS stage moves.
Usage: funnel views (11,676 reads).
Evidence: rows 286 · reads 11,676 · inserts 286 (stamped 28 Aug 2026)

### company_os.job_requisitions
One row is: one open or closed hiring requisition.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: hiring flows.
Usage: 37,881 reads — the public careers site makes this the third-hottest table in the database.
Columns:
- chain_step: The step the hiring chain (Z.9) runs next for this requisition, or waits at; null when it is not in a chain run. Valid values: [ask-open, open-ready, open, collecting, shortlist, shortlist-ready, apply-shortlist, closed].
- chain_started_at: When this requisition's chain run started; part of every step's tick.
- chain_error: Why the driver stopped the run after three failed attempts at one step; null while the run is healthy. Retry clears it.
Evidence: rows 57 · reads 37,881 · inserts 60 (stamped 28 Aug 2026)

### company_os.interviews
One row is: one scheduled interview for one application.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: ATS scheduling.
Usage: interview kits and calendars.
Evidence: rows 10 · reads 726 · inserts 17 (stamped 28 Aug 2026)

### company_os.interview_interviewers
One row is: one interviewer on one interview.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: ATS scheduling.
Usage: interview kits.
Evidence: rows 22 · reads 623 · inserts 35 (stamped 28 Aug 2026)

### company_os.interview_scorecards
One row is: one interviewer's scorecard for one interview.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: interviewer submissions.
Usage: hiring decisions (704 reads).
Evidence: rows 12 · reads 704 · inserts 15 (stamped 28 Aug 2026)

### company_os.scorecard_scores
One row is: one dimension score on one scorecard.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: interviewer submissions.
Usage: scorecard rendering.
Evidence: rows 48 · reads 294 · inserts 56 (stamped 28 Aug 2026)

### company_os.offers
One row is: one formal offer extended to a candidate.
Bucket: transactional · People operations
Tier: 3 support
Status: waiting
Origin: will be written by the offer flow; 319 applications processed without a recorded offer suggests offers happen off-system today. TODO(owner)
Usage: none yet.
Evidence: rows 0 · reads 153 · inserts 0 (stamped 28 Aug 2026)

### company_os.onboarding_plans
One row is: one onboarding plan for one new team member.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: HR onboarding flows.
Usage: onboarding views (949 reads).
Evidence: rows 11 · reads 949 · inserts 14 (stamped 28 Aug 2026)

### company_os.onboarding_tasks
One row is: one task inside one onboarding plan.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: plan templates and HR edits.
Usage: onboarding checklists.
Evidence: rows 52 · reads 508 · inserts 128 (stamped 28 Aug 2026)

### company_os.performance_reviews
One row is: one performance review record for one team member in one cycle.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: review cycles.
Usage: review views (753 reads).
Evidence: rows 47 · reads 753 · inserts 57 (stamped 28 Aug 2026)

### company_os.survey_responses
One row is: one person's response session to one survey.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: survey submissions.
Usage: pulse reporting (3,775 reads).
Evidence: rows 314 · reads 3,775 · inserts 318 (stamped 28 Aug 2026)

### company_os.survey_answers
One row is: one answer to one field within one response.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: survey submissions.
Usage: pulse reporting (2,433 reads).
Evidence: rows 1,115 · reads 2,433 · inserts 1,124 (stamped 28 Aug 2026)

### company_os.survey_assignments
One row is: one survey assigned to one person, open until they answer it.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: "Assign to" on a survey's builder page; created 3 Oct 2026 (`20261003140000_survey_assignments`) for the post-retreat team survey.
Usage: the "Open surveys" block on the /team home, the assignee list on the builder, and the daily survey-reminders cron ask "what is still open for this person"; the submit API closes the row when the signed-in respondent matches.
Reuse: who owes a survey only. The answers stay in `survey_responses` and `survey_answers`; performance reviews keep their own rows in `performance_reviews`. One survey serves many events: `cohort_slug` names the event, the same value `survey_responses.cohort_slug` carries.
Do not: assign the same person the same survey twice for one event (unique on survey_id, person_id, cohort_slug, nulls not distinct).
Columns:
- id: Primary key.
- survey_id: The survey assigned, referencing surveys.id; deleting the survey deletes its assignments.
- person_id: The person who owes it, referencing people.id; matched against the signed-in respondent when they submit.
- cohort_slug: The event the survey is about (events.slug), the same value survey_responses.cohort_slug carries; null for a survey not tied to an event. The portal and reminder links add it as ?cohort=.
- assigned_by: Email of the admin who assigned it.
- assigned_at: When it was assigned.
- due_on: Optional date it is due; shown to the person and in the reminder.
- completed_at: When the person submitted a response; null while it is open.
- response_id: The response that closed it, referencing survey_responses.id; null for an anonymous survey, so the assignment never de-anonymizes the answer.
- last_reminded_at: When the reminder cron last emailed the person about it.
- reminder_count: How many reminder emails have listed it.
Evidence: rows 5 · inserts 5 (stamped 3 Oct 2026)

### company_os.ddl_log
One row is: one schema change that reached production, with the migration that declared it.
Bucket: log · Platform
Tier: 3 support
Status: active
Origin: the `edge8_ddl_guard` event triggers (`20261003160000_ddl_guard`), after three migrations in eight days reached production from files no pull request had carried. A DDL command on `company_os`, `public` or `htt` is refused unless the session declares the migration it applies, and an allowed one is written here.
Usage: read by a human asking who changed the schema and under which migration; nothing in the app reads it.
Reuse: never written by application code; `scripts/apply-migration.mjs` is the one door that declares a migration.
Evidence: rows 0 · inserts 0 (stamped 3 Oct 2026)

### company_os.ddl_proof_abort
One row is: never kept. A transaction that declared itself a proof (`edge8.proof = on`) and ran a schema change inserts here, and a deferred constraint trigger raises at commit, so the transaction can only roll back.
Bucket: log · Platform
Tier: 3 support
Status: active
Origin: `20261003160000_ddl_guard`, so the rolled-back proofs CLAUDE.md requires, and the db-review packet's trial run, work with the guard in place without giving anyone a way to keep a change.
Usage: nothing reads it; its only job is to be written in a transaction that is about to be refused.
Evidence: rows 0 · inserts 0 (stamped 3 Oct 2026)

### company_os.goals
One row is: one quarterly FAST goal for a team member, laddered to the Eight Edges tree, with member-authored measures.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows; renamed from `coaching_goals` 28 Aug 2026 (the legacy empty `goals` table was dropped and this promoted to the name).
Usage: coaching workspace and goal reviews (985 reads).
Reuse: individual goals live here; company-level objectives are `objectives` + `key_results`.
Evidence: rows 15 · reads 985 · inserts 49 (stamped 28 Aug 2026)

### company_os.coaching_goal_comments
One row is: one comment on one FAST goal.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching UI — shipped and working; zero comments ever left.
Usage: goal detail reads it (411 reads).
Evidence: rows 0 · reads 411 · inserts 0 (stamped 28 Aug 2026)

### company_os.coaching_checkins
One row is: one coaching check-in record.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows.
Usage: coaching timeline (735 reads).
Evidence: rows 8 · reads 735 · inserts 8 (stamped 28 Aug 2026)
Reuse: read it for what the member wrote before a 1-1, and for the coach's note back.
Do not: write message_markdown — the AI check-in essay it held is retired (K.15).
Columns:
- id: Synthetic primary key.
- coaching_profile_id: The coaching profile this check-in belongs to; cascades on delete.
- sent_at: When the row was opened for the upcoming 1-1, and the stamp that makes the link-only nudge once per cycle.
- message_markdown: The retired mid-cycle check-in message; nullable and no longer written, kept so old rows stay readable.
- responded_at: When the member last saved a non-empty answer; null while the form is untouched.
- moved_md: What the member wrote moved since the last 1-1, verbatim; null when they wrote nothing.
- stuck_md: What the member wrote is stuck, verbatim; null when they wrote nothing.
- talk_md: What the member wants to talk about in the 1-1, verbatim; null when they wrote nothing.
- coach_note_md: The coach note back on this pre-meeting form; visible to the member as soon as it is written.
- created_at: When the row was created.

### company_os.coaching_commitments
One row is: one commitment made in coaching, tracked to completion.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching one-on-ones.
Usage: commitment follow-up (946 reads).
Evidence: rows 51 · reads 946 · inserts 55 (stamped 28 Aug 2026)
Columns:
- ask_now_sent_at: When the member last used "Ask now" on this blocked commitment to reach their coach; null until they ever have. One send per card per Saigon day is enforced against it (K.22).

### company_os.coaching_commitment_history
One row is: one recorded change to one coaching commitment — a reword or a board move.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: the commitment board on /team/my-coaching and the coach profile page.
Usage: the "changed N×" count on a commitment card, and the audit trail behind a target that moved.
Reuse: read it to show how a commitment's wording or status got where it is.
Do not: read it for the current wording or status — coaching_commitments holds those.
Columns:
- id: Synthetic primary key.
- commitment_id: The coaching commitment this change was made to; cascades on delete.
- changed_by: team_members.id of whoever made the change; null for a cron or backfill.
- changed_at: When the change was written.
- title_before: The wording before a reword; null when the change was a move.
- title_after: The wording after a reword; null when the change was a move.
- status_before: The status before a move; null when the change was a reword.
- status_after: The status after a move; null when the change was a reword.

### company_os.coaching_context
One row is: one standing context note for one person's coaching.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coach entry.
Usage: coaching prep.
Evidence: rows 6 · reads 137 · inserts 6 (stamped 28 Aug 2026)

### company_os.coaching_one_on_ones
One row is: one coaching one-on-one session record.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows (the legacy one_on_ones tables were dropped 27 Aug 2026).
Usage: coaching workspace (3,053 reads).
Evidence: rows 27 · reads 3,053 · inserts 27 (stamped 28 Aug 2026)
Columns:
- prep_member_edits: The members amendments to the shared prep as {"struck": [...], "added": [...]}; null when nothing changed. The coachs prep is never rewritten by it (K.21).
- held_source: How a held 1-1 was held: meeting (null on older rows) or written, when the pre-meeting answers plus the coach's reply counted as the 1-1 (K.35).
- coach_voltage_md: The coach's one-line private note on their own energy before the 1-1; coach-tier only, never selected for the member, cleared when the meeting is marked held (K.23).
- starts_at: The Saigon wall-clock start time, set from the profile preference when the row is scheduled; null when the meeting has a date but no time (K.34).
- led_by: The team member who led this session when it was not the profile's coach (a dotted-line or skip-level leader); null means the coach led it.
- kind: What kind of session this was: one_on_one, or goals_check (a short session on the member's goals that does not count toward the 1-1 rhythm).
- moved_from: The date this 1-1 sat on before its last move; null on a 1-1 that was never moved, and overwritten by each move (K.33).
- move_reason: The one line the coach wrote for why this 1-1 moved; null on a 1-1 that was never moved (K.33).
- marked_held_on: The business date the coach marked this 1-1 held by answering that it happened; null while it is not held, when a recording or the written exchange marked it held (those prove the day), and on 1-1s marked held before 27 Sep 2026. Held late is marked_held_on after held_on, written by the coach's own answer, never by a routine (A.31, ADR-0010).

### company_os.coaching_priorities
One row is: one current priority for one person in coaching.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows.
Usage: coaching prep (609 reads).
Evidence: rows 9 · reads 609 · inserts 9 (stamped 28 Aug 2026)

### company_os.coaching_talking_points
One row is: one talking point queued for one person's next one-on-one.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: coaching flows.
Usage: session prep.
Evidence: rows 1 · reads 174 · inserts 1 (stamped 28 Aug 2026)

### company_os.coaching_member_notes
One row is: one note the member wrote for themselves between 1-1s — a win, a moment, something worth remembering.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: the member's History tab (K.19).
Usage: the brag document, and the draft offered under "What moved" on the next 1-1 form.
Evidence: new table (K.19, 17 Sep 2026)
Reuse: read it for what the member noticed between meetings, in their own words.
Do not: use it for agenda items (coaching_talking_points) or for the pre-meeting form (coaching_checkins); and never slice it by person as a metric.
Columns:
- id: Synthetic primary key.
- coaching_profile_id: The coaching profile whose member wrote this note; cascades on delete.
- body: What the member wrote, verbatim, one to a thousand characters.
- created_at: When the note was written, which is what orders the list and decides whether it is newer than the last 1-1.
- archived_at: When the member tidied the note away; null while it is live. Archived rather than deleted so the brag document keeps what it already quoted.

### company_os.coaching_noticed
One row is: one sentence somebody wrote about a specific piece of work a person did, tied to a company value.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: a coach's profile page for a person they coach (L.4).
Usage: that person's own growth timeline and their brag document. Nowhere else.
Evidence: new table (L.4, 18 Sep 2026)
Reuse: read it for what has been said about ONE person's work, by that person's coaching profile id.
Do not: count it, sum it, rank it, aggregate it across people, put it on a dashboard, join it to a review cycle, or build any query that answers "who has the most". This table exists to be read by the person it is about and nobody else; a leaderboard over it is the failure mode it was designed against, and the wanting is the bug. There is deliberately no reader here that takes a list of profile ids.
Columns:
- id: Synthetic primary key.
- coaching_profile_id: The coaching profile of the person the sentence is about; cascades on delete.
- written_by: The team member who wrote it. Shown to the receiver so a kind sentence has an author, never grouped on.
- value_id: The company value the behaviour showed, from core_values. Nullable so retiring a value never deletes the sentences written under it.
- body: The sentence, in the writer's own words. Names a behaviour and a piece of work, not a trait.
- subject: What the work was, so the sentence has something to point at; optional.
- noticed_on: The Saigon date it was written, which is where it sits on the timeline.
- created_at: Insert timestamp.
- archived_at: When it was tidied away; null while live. Archived rather than deleted so a brag document keeps what it already quoted.

### company_os.kudos
One row is: one thank-you one teammate gave another — a line saying what they appreciated, shown on the team Home's board for the month it was given.
Bucket: transactional · People operations
Tier: 3 support
Status: active
Origin: the Kudos card on the team Home (/team), written by the person giving it (TH.1.8). Peer to peer; a coach's note about a coached person's work is coaching_noticed, not this.
Usage: the team Home's board for the current Saigon month and the keepsake page for each past month; the receiver's inbox note (kind kudos.received).
Reuse: read it for a month's board (given_on within the month, newest first) or for what one person was thanked for, shown to everyone in the company.
Do not: count it, sum it, rank it, aggregate it by person, build a "most thanked" or "most giving" list, put it on a dashboard, or join it to a review or a goal. Ranking people on recognition received reduces how much they help each other (Evans, Presslee and Vandenberg); the board is a wall of thanks, never a score. There is deliberately no reader here that groups by person.
Columns:
- id: Synthetic primary key.
- from_person_id: The person who gave the kudos; their face and name sit beside the note.
- to_person_id: The person thanked, who gets an inbox note. Never the same person as from_person_id.
- body: The thank-you, in the giver's own words, one line of up to 280 characters.
- given_on: The Saigon date it was given, which decides the month's board it sits on.
- created_at: Insert timestamp; orders the board, newest first.
- archived_at: When it was taken down; null while live. Archived rather than deleted, so a month's keepsake page stays honest about what was there.
- archived_by: The person who took it down — the giver, or an admin.

### Other · Plans & designs

### company_os.strategies
One row is: one company strategy document record.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: leadership planning.
Usage: strategy surfaces (187 reads).
Evidence: rows 1 · reads 187 · inserts 2 (stamped 28 Aug 2026)

### company_os.objectives
One row is: one company objective in the OKR tree.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: OKR planning.
Usage: OKR views (890 reads); key results ladder to it.
Evidence: rows 4 · reads 890 · inserts 10 (stamped 28 Aug 2026)

### company_os.key_results
One row is: one measurable key result under one objective.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: OKR planning; progress logs to `kr_logs`. The `metrics`/`metric_readings` tables were dropped 27 Aug 2026; measurement lives in KR values.
Usage: 6 tables reference it; OKR views (935 reads).
Evidence: rows 20 · reads 935 · inserts 35 (stamped 28 Aug 2026)

### company_os.client_roadmap_groups
One row is: one grouping on one client's roadmap.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: delivery planning.
Usage: client roadmap rendering (956 reads).
Evidence: rows 7 · reads 956 · inserts 7 (stamped 28 Aug 2026)

### company_os.client_roadmap_overview
One row is: one client roadmap's overview block.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: delivery planning.
Usage: client roadmap rendering.
Evidence: rows 2 · reads 385 · inserts 2 (stamped 28 Aug 2026)

### company_os.program_plans
One row is: one AI program's plan document record.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: program setup.
Usage: program surfaces.
Evidence: rows 1 · reads 142 · inserts 1 (stamped 28 Aug 2026)

### htt.project_goals
One row is: one goal set for a tracked project in the token tracker.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: tracker flows.
Usage: project summary generation.
Evidence: rows 49 · reads 15 · inserts 56 (stamped 28 Aug 2026)

### company_os.event_agenda_blocks
One row is: one agenda block within one event's schedule.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: event planning.
Usage: agenda rendering (1,552 reads).
Evidence: rows 47 · reads 1,552 · inserts 61 (stamped 28 Aug 2026)

### company_os.event_agenda_staff
One row is: one staff assignment to one agenda block.
Bucket: other · Plans & designs
Tier: 3 support
Status: hold
Origin: created 1 Aug 2026; never written; event pages query it (693 reads). Finish the feature or remove the code path and drop. TODO(owner)
Usage: queried on event pages against empty.
Evidence: rows 0 · reads 693 · inserts 0 (stamped 28 Aug 2026)

### company_os.event_talks
One row is: one link between an event and a talk on its program.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: event planning.
Usage: event program rendering.
Evidence: rows 12 · reads 136 · inserts 12 (stamped 28 Aug 2026)

### company_os.ideas
One row is: one captured idea in the R&D funnel.
Bucket: other · Plans & designs
Tier: 3 support
Status: active
Origin: team submissions.
Usage: idea review (903 reads).
Evidence: rows 12 · reads 903 · inserts 12 (stamped 28 Aug 2026)

### company_os.idea_reactions
One row is: one person's reaction to one idea — an admire, a me-too, a skip, or a check-in answer on a learning they said they would try.
Bucket: transactional · Plans & designs
Tier: 3 support
Status: active
Origin: the /team/ideas deck and spark page (ID.2.6, ID.2.9), through the ideas entity's writers. Service role only; the assistants' SQL roles are revoked.
Usage: the deck (what a person has already answered), the spark page (who admires it), Your sparks (what came back on your ideas).
Reuse: any one-tap answer a person gives to an idea. A written reply is a build (idea_builds), not a reaction.
Do not: count reactions per person into any view, rank ideas or people by them, or show a skip to anyone; a skip exists only so the deck stops serving that idea. Withdraw by archiving, never by deleting.
Columns:
- id: Primary key.
- idea_id: The idea reacted to (company_os.ideas).
- person_id: The person who reacted (company_os.people).
- kind: What the reaction says: admire thanks the author; me_too is "I have hit this too" on an idea to build and "I will try this" on a learning; skip only stops the deck serving the idea and is never shown to anyone; held, trying and unstuck answer the check-in on a learning. Valid values: [admire, me_too, skip, held, trying, unstuck]
- created_at: When the reaction was made.
- archived_at: When the reaction was withdrawn; null while it stands. Only one live reaction of each kind per person and idea.
- archived_by: Who withdrew it (company_os.people).
Evidence: <generated line>

### company_os.idea_builds
One row is: one line a teammate added to an idea — their own case, a twist, or what they would try.
Bucket: transactional · Plans & designs
Tier: 3 support
Status: active
Origin: the spark page's Build on it and the deck (ID.2.7), through the ideas entity's writers. Service role only; the assistants' SQL roles are revoked.
Usage: the spark page's builds thread; the first build moves a spark to Echoed.
Reuse: any written reply on an idea. A comment on a Workboard card is task_comments.
Do not: hard-delete a build (archive it), or count builds per person.
Columns:
- id: Primary key.
- idea_id: The idea built on (company_os.ideas).
- person_id: The person who wrote the build (company_os.people).
- body: The build as written, 1 to 500 characters.
- created_at: When it was posted.
- archived_at: When it was taken down; null while it shows.
- archived_by: Who took it down (company_os.people).
Evidence: <generated line>

### Other · Content & knowledge

### company_os.documents
One row is: one stored document reference (file metadata, not the file itself).
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: document upload flows.
Usage: 4 tables reference it; document lists (1,081 reads).
Evidence: rows 288 · reads 1,081 · inserts 291 (stamped 28 Aug 2026)

### company_os.library_documents
One row is: one document published to the private workflows library — the gated internal library at /workflows/private, one row per document per brand.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: the library publisher (entities/library) — an admin action or its CLI, which uploads the body to the `library` Storage bucket and writes this row. Nothing else writes it; publishing is an upload, never a deploy.
Usage: the three brand index pages and the document route under /workflows/private read it; `getDocumentedWorkflowsTotal` counts the workflow-category rows.
Reuse: any document published to the private library goes here, whatever the brand. A document attached to a person, company or program is a different grain and belongs in `documents` or `program_documents`.
Do not: use for public marketing content (that is `marketing_content`), for a file attached to a spine entity (`documents`), or for the assistant's company facts (`company_information`). Do not hard-delete a row; set `archived_at`.
Columns:
- id: Primary key.
- slug: URL segment identifying the document within its brand, lowercase and extension-less; the canonical URL is /workflows/private/<brand>/<slug>. Unique per brand.
- brand: Which of the private libraries the document belongs to — one per brand the company operates. The column's check constraint carries the list; it is not repeated here because this file is mirrored publicly.
- title: The name people see in the index and the browser tab.
- description: One sentence shown under the title on the index page, and the text the index search matches.
- category: The index tab the document appears under. Valid values: [plan, workflow, docs, prototype, data]
- tags: Free labels for filtering, in addition to the single category.
- storage_path: Path of the document body inside the private `library` Storage bucket. The bytes never live in the repo.
- content_hash: Hash of the stored body, used as the cache-busting query value so a republished document is fetched fresh while an unchanged one stays cacheable.
- byte_size: Size of the stored body in bytes, after the publisher unpacks any self-extracting bundle and extracts inlined data URIs.
- visibility: Who may read the document once the library itself is unlocked. Valid values: [gated, staff]
- sort_order: Position in its brand's index, highest first; replaces position in the old TypeScript array, which is what made every publish conflict.
- published_at: When the document was first published.
- updated_at: When the row last changed; maintained by a trigger.
- published_by: The person who published it, referencing people.id.
- archived_at: When the document was unpublished. A non-null value hides it from every index and from the document route; rows are never hard-deleted.
- archived_by: The person who unpublished it, referencing people.id.
Evidence: <generated line>

### company_os.notifications
One row is: one fact that matters to one person, in their inbox — a card of theirs finished or set aside by someone else, a subtask ticked on their card, their leave approved, a hire on their requisition, a deal they own won, an invoice of a company they own paid.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the notifications entity's subscribers to the event catalogue (S.3). Nothing else writes it; the publisher states the fact and the subscriber decides who it matters to.
Usage: /team/inbox and /admin/inbox read a person's rows, unread first.
Reuse: anything a person should find waiting for them when they next look, raised from a catalogue event. Add the event (or an optional field on it) rather than writing this table from another entity.
Do not: push anything to chat or email from these rows (the inbox is a page people choose to open), count them into a badge, or write a row the subscriber did not decide on.
Columns:
- id: Primary key.
- person_id: The person the fact matters to, referencing people.id.
- kind: What kind of fact it is. Valid values: [card.completed, card.set_aside, subtask.done, leave.approved, leave.withdrawn, hire.made, deal.won, invoice.paid, idea.reacted, idea.built, idea.picked_up, claim.decided, claim.paid, idea.shipped, kudos.received]
- title: The sentence the inbox shows.
- body: A second line when the fact has one (the leave's dates, the amount).
- admin_href: Where the item opens on the admin surface.
- team_href: Where the item opens on the team surface.
- event_key: What the row dedupes on within its kind (the card, the request, the deal), so a fact announced twice lands once.
- created_at: When the fact was written to the inbox.
Evidence: <generated line>

### company_os.notification_reads
One row is: one inbox item its person has read.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the inbox pages' Mark read, Mark all read, and opening an item (S.3).
Usage: the inbox splits a person's rows into unread and read by it.
Do not: create a row for anyone but the item's own person.
Columns:
- notification_id: The item that was read, referencing notifications.id; one read per item.
- person_id: The person who read it, referencing people.id; always the item's own person.
- read_at: When it was read.
Evidence: <generated line>

### company_os.notification_prefs
One row is: one person's choice about one kind of inbox item.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: the "What lands here" list on the inbox pages (S.3).
Usage: the subscribers skip writing a kind its person muted.
Reuse: per-person inbox preferences only. The Lark DM opt-out stays on people.lark_dm_opt_out, because that governs pushes and the inbox never pushes.
Columns:
- person_id: The person, referencing people.id.
- kind: The inbox kind. Valid values: [card.completed, card.set_aside, subtask.done, leave.approved, leave.withdrawn, hire.made, deal.won, invoice.paid, idea.reacted, idea.built, idea.picked_up, claim.decided, claim.paid, idea.shipped, kudos.received]
- muted: True when this kind should not land in the person's inbox.
- updated_at: When the choice last changed; maintained by a trigger.
Evidence: <generated line>

### company_os.company_information
One row is: one general company reference fact (slug, title, category, body, tags) surfaced to the /team assistant.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: `scripts/sync-team-knowledge.ts` and admin edits; renamed from `team_knowledge` 28 Aug 2026.
Usage: the /team assistant queries it by name in literal SQL — rename coupling is real.
Evidence: rows 5 · reads 104 · inserts 5 (stamped 28 Aug 2026)

### company_os.books
One row is: one book in the publishing effort.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: publishing flows.
Usage: book tooling (176 reads).
Evidence: rows 4 · reads 176 · inserts 4 (stamped 28 Aug 2026)

### company_os.book_chapters
One row is: one chapter of one book.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: publishing flows.
Usage: book tooling.
Evidence: rows 71 · reads 36 · inserts 133 (stamped 28 Aug 2026)

### company_os.program_documents
One row is: one document attached to an AI program.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: program flows.
Usage: program surfaces (445 reads).
Evidence: rows 13 · reads 445 · inserts 13 (stamped 28 Aug 2026)

### company_os.client_status_reports
One row is: one client company's weekly status report for one ISO week — the facts it was drafted from, the page the client would see, where its run is, and whether a person released it to the client's portal.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: Z.12 (Automation Plan R4, 2026-10-09); Z.12.1 (2026-10-09). Written only by entities/client-programs: the weekly opener inserts one row per active client company and week, the client-status tick driver advances it (ADR 0015: the run's step lives in the owner's table) through gather, draft and check to ready, and the actions on the client's Weekly status page edit it or draft it again. Since Z.12.1 nothing opens an approval for it and nothing releases it: the account owner shares the draft with the client themselves, so the steps ask, release, released and rejected and the columns released_at and released_by are no longer written.
Usage: the Weekly status tab of the team client hub (read, edit, draft again); the Z.15.2 watchdog check. The client portal reads nothing from it since Z.12.1.
Reuse: the one record of a client's weekly status page. The unique (company_id, week) is the run's idempotency key (status:<company>:<week>), so a re-run of the opener opens nothing new.
Do not: store a token, hour or money figure, an assignee or a card description in facts, ai_draft or body_html; serve a row to a client from the app (the account owner shares the draft); open an approval for it; publish it to library_documents or link it from program_documents (the retired customer-status path).
Columns:
- id: Primary key.
- company_id: The client company the report is for.
- week: The ISO week the report covers, in Saigon time, as YYYY-Www (2026-W41); unique with company_id, so one report per client per week.
- step: Where the weekly run is (ADR 0015). gather, draft, check, ask and release are advanced by the tick driver; ready waits on a person's decision; released is shown in the client's portal; rejected and superseded are never shown; stopped carries its error until a person drafts again or uses the plain report. Valid values: [gather, draft, check, ask, ready, release, released, rejected, superseded, stopped]
- started_at: The run's epoch, part of every step's tick key; reset when a person drafts again, so a fresh run gets fresh ticks.
- facts: The client-safe facts the draft is written from (card titles, lanes, done dates, roadmap status and client priority), parsed through an allowlist; never a token, hour or money figure, an assignee or a description.
- ai_draft: The model's structured output exactly as returned, kept so an approver's edit can be learned from; null for a plain report or before the draft step.
- body_html: The page the client would see once released, rendered from a fixed template; an approver's edit replaces only its narrative sections.
- version: The content hash of company, week, title and body_html that the open approval names; the release goes ahead only when the approved version equals it.
- edited_by: The person who last edited the narrative before release; null when nobody did.
- edited_at: When the narrative was last edited; null when nobody did.
- error: Why the run stopped (the failed check rule or the last step's error); required when step is stopped, cleared when a person drafts again.
- released_at: When the page was released to the client's portal; set exactly when step is released.
- released_by: The person whose approval released the page.
- created_at: When the opener inserted the row.
- updated_at: When the row last changed, stamped by the writer.

### company_os.meeting_followups
One row is: one client meeting's meeting-to-actions run — where it is, the follow-up email the model drafted and the copy a person approves, who approves it, and whether it was sent.
Bucket: transactional · Client delivery & work
Tier: 3 support
Status: active
Origin: Z.13 (Automation Plan R5, 2026-10-09). Written only by entities/crm: the crm driver opens one row per ready client meeting (on conflict (meeting_id) do nothing) and advances it one step per tick (ADR 0015: the run's step lives in the owner's table); the meeting page's actions start, edit, approve and reject it. The send decides through kernel/approvals (subject meeting_followup).
Usage: the client meeting page's Actions and follow-up panel; the crm driver's due list and its 7-day expiry sweep; Settings -> Agents through the step runs it records.
Reuse: the one follow-up per meeting. Z.10 (R2, sales meetings) shares it: the first chain to open a meeting's row is the only one that can send its follow-up.
Do not: send a follow-up except from the send step after the approval of the row's current version; choose a recipient outside the company's CRM contacts; overwrite ai_subject or ai_body_md.
Columns:
- id: Primary key.
- meeting_id: The client meeting the run is for; unique, so one run and one follow-up per meeting. Deleted with the meeting.
- mode: The mode the run opened in, from the meeting-actions routine's switch (Z.17). A shadow run proposes its items and closes shadowed after the draft: it never files, asks or sends, and a later switch to live does not change it. Valid values: [shadow, live]
- step: Where the run is (ADR 0015). gather, extract, draft, ask and send are advanced by the crm driver; ready waits on the approver; sent, rejected, expired, shadowed, skipped and stopped are final until a person retries. Valid values: [gather, extract, draft, ask, ready, send, sent, rejected, expired, shadowed, skipped, stopped]
- started_at: The run's epoch, part of every step's tick key; reset by Retry, so a retried step is a new tick.
- error: Why the run stopped (the driver's give-up reason after three failed attempts); required when step is stopped.
- skip_reason: Why the run closed without doing anything (no transcript, the meeting archived); required when step is skipped.
- transcript_sha256: The SHA-256 of the transcript the run read, so a later reader can tell whether the transcript changed after the run.
- contact_ids: The company's contacts (people ids) with an email that the run gathered, the only people the follow-up may be sent to.
- commitments: Any price, date or scope Edge8 stated in the meeting, as the extractor quoted it, shown beside the draft for the approver to check.
- ai_subject: The model's draft subject, exactly as returned; never edited.
- ai_body_md: The model's draft body in Markdown, exactly as returned; never edited, so the distance to what was sent stays on record.
- subject: The subject the approver reads, edits and approves.
- body_md: The body in Markdown the approver reads, edits and approves.
- to_person_ids: The recipients (people ids), always a subset of contact_ids; matched to the attendees by exact folded name, or ticked by the approver.
- version: The content hash of from, to, subject and body that the open approval names; the send goes ahead only when the approved version equals it.
- approver_person_id: The person asked to approve: the meeting's owner when one resolves and holds crm.calls; null when any holder of crm.calls may.
- shadow_verdict: A person's verdict on a shadow run's draft: had it been live, would they have sent it. Valid values: [would_send, would_not]
- send_claimed_at: When the send step claimed the send; set before the email goes, cleared if it fails, so two attempts never send twice.
- sent_at: When the follow-up was sent; set exactly when step is sent.
- created_at: When the driver or a person opened the run.
- updated_at: When the row last changed, stamped by the house trigger.

### company_os.gallery_photos
One row is: one photo in the company gallery.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: gallery uploads.
Usage: gallery surfaces (1,178 reads).
Evidence: rows 36 · reads 1,178 · inserts 37 (stamped 28 Aug 2026)

### company_os.gallery_photo_people
One row is: one person tagged in one gallery photo.
Bucket: other · Content & knowledge
Tier: 3 support
Status: active
Origin: gallery tagging.
Usage: gallery filtering.
Evidence: rows 1 · reads 162 · inserts 1 (stamped 28 Aug 2026)

### Other · Logs, audit & telemetry

### company_os.audit_log
One row is: one audited admin action (who did what to which record).
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: written by admin mutations; append-only.
Usage: audit review (964 rows and counting).
Evidence: rows 964 · reads 269 · inserts 965 (stamped 28 Aug 2026)

### company_os.portal_assume_sessions
One row is: one assume-identity session by an admin in the portal.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: portal assume flows; append-only.
Usage: security review.
Evidence: rows 65 · reads 553 · inserts 65 (stamped 28 Aug 2026)

### company_os.application_stage_log
One row is: one logged stage transition of one application.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: ATS stage moves; append-only.
Usage: funnel analytics.
Evidence: rows 269 · reads 783 · inserts 270 (stamped 28 Aug 2026)

### company_os.task_stage_log
One row is: one logged stage move of one task.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: board moves; append-only.
Usage: cycle-time analytics (3,431 reads).
Evidence: rows 103 · reads 3,431 · inserts 103 (stamped 28 Aug 2026)

### company_os.deal_stage_log
One row is: one logged stage move of one deal.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: every deal stage change in code (board drag, detail form, bulk edit, the lead hand-off that creates a deal); append-only. Seeded once per live deal when the table was created (kind seed), so aging is measured from that moment and never guessed backwards.
Usage: the Revenue hub's Pipeline tab (aging in stage, conversion by stage) and the deal detail's stage history. Never grouped by moved_by for a figure.
Reuse: any question of the form "how long has this deal been where it is" or "how many deals passed through stage X" reads this log. The pattern is task_stage_log and application_stage_log.
Do not: infer stage history from deals.updated_at or from lifecycle_transitions (that table is company lifecycle, not deal stage).
Columns:
- id: Primary key.
- deal_id: FK to deals; the deal that moved.
- from_stage_id: FK to pipeline_stages; the stage the deal left (null when the deal was created into to_stage_id).
- to_stage_id: FK to pipeline_stages; the stage the deal entered.
- kind: What produced the row. Valid values: [move, create, seed]
- moved_at: When the deal entered to_stage_id; aging in stage is measured from the latest row per deal.
- moved_by: Audit label of the admin or routine that moved the deal; never used for a metric.
- note: Free-text note on the move, e.g. the seed marker or the bulk edit that produced it.
Evidence: rows 0 · reads 0 · inserts 0 (created 13 Sep 2026)

### company_os.revenue_targets
One row is: one company-level target for one metric in one period.
Bucket: master · Reference & rules
Tier: 3 support
Status: active
Origin: set by an admin on the Revenue hub's Overview (Targets card); one row per metric and period, upserted.
Usage: the Revenue hub's tiles show the period's figure against it ("vs target"). The figure is the company's, never a person's: there is no owner column and none may be added.
Reuse: any "are we on plan" question on the hub reads this. Do not put a target in key_results (OKRs are objectives with check-ins, not the tile comparison) or in a constant in code.
Do not: add a per-person target; the CEO rule is that no metric describes a person.
Columns:
- id: Primary key.
- metric: Which figure the target is for. Valid values: [won_usd, invoiced_usd, inquiries, meetings]
- period_kind: The period the target covers. Valid values: [month, quarter, year]
- period_start: First day of the period.
- amount: The target: whole USD for money metrics, a count otherwise.
- note: Why this number, in a sentence.
- created_by: Audit label of the admin who set it; never used for a metric.
- created_at: When the target was first set.
- updated_at: When the target was last changed.
Evidence: rows 0 · reads 0 · inserts 0 (created 13 Sep 2026)

### company_os.revenue_snapshots
One row is: one nightly reading of the revenue figures.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the revenue-snapshot cron (00:30 UTC) upserts one row per day from the same aggregates the hub renders.
Usage: the Pipeline tab's "open pipeline over time" chart; history starts at the first row and the chart says so.
Reuse: any "how has X moved over weeks" question about pipeline, receivables or inquiries reads this rather than re-deriving from deals.updated_at.
Do not: backfill it from guesses; a reading is what the figures were that night.
Columns:
- id: Primary key.
- taken_on: The day the reading is for (UTC); one row per day, the routine upserts.
- open_deals: Open, unarchived deals at the time.
- open_usd_cents: Their USD value.
- open_weighted_usd_cents: Their USD value weighted by probability.
- won_mtd_usd_cents: USD won so far in the calendar month of taken_on.
- receivable_cents: Open invoice balance at the time.
- overdue_cents: Of which past due.
- inquiries_30d: Inquiries received in the 30 days before taken_on.
- by_stage: JSON array of {stage, count, usd} at the time, for a stacked history later.
- cash_90d_cents: Expected cash over the 90 days after taken_on: invoice balances already due, plus the recurring run rate repeated for three months, plus open deals expected to close in the window weighted by probability.
- created_at: When the row was written.
Evidence: rows 0 · reads 0 · inserts 0 (created 13 Sep 2026)

### company_os.account_health_snapshots
One row is: one nightly health reading of one client account.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the account-health cron (19:30 UTC) upserts one row per current client per day, from four company-level signals: days since the last meeting, overdue invoices, roadmap moves in the last 30 days and days since the last portal sign-in.
Usage: the Revenue "Accounts needing attention" screen lists each account's latest reading, lowest score first.
Reuse: any "how healthy is this client, and how has that moved" question reads this rather than re-deriving from meetings and invoices.
Do not: add a person column or slice a reading by owner; the reading describes the account, never a person. Do not backfill it from guesses; a reading is what the signals were that night.
Columns:
- id: Primary key.
- company_id: The client account, referencing companies.id; deleting the company deletes its readings.
- taken_on: The business day (Saigon calendar) the reading is for; one row per company per day, the routine upserts.
- signals: The inputs the score was computed from, as JSON: daysSinceMeeting, neverMet, overdueInvoices, roadmapMoves30d, portalSignInDays, portalNeverSignedIn. A null signal could not be computed and cost the score nothing.
- score: Health from 0 to 100, higher is healthier; computed by crm's scoreHealth from the signals.
- created_at: When the row was written.
Evidence: rows 0 · reads 0 · inserts 0 (created 25 Sep 2026)

### company_os.lifecycle_transitions
One row is: one logged lifecycle change of a person (candidate to hire, active to alumni).
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: people lifecycle flows; append-only.
Usage: people history (1,222 reads).
Evidence: rows 70 · reads 1,222 · inserts 104 (stamped 28 Aug 2026)

### company_os.kr_logs
One row is: one progress log entry on one key result.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: OKR check-ins; append-only.
Usage: KR history.
Evidence: rows 6 · reads 15 · inserts 6 (stamped 28 Aug 2026)

### htt.sync_runs
One row is: one run of the nightly GitHub sync with its outcome.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the sync job; append-only.
Usage: sync health monitoring (613 runs).
Evidence: rows 613 · reads 623 · inserts 613 (stamped 28 Aug 2026)

### company_os.routine_runs
One row is: one execution of one scheduled routine (a Vercel cron or a Mac mini launchd job) with its outcome, result and AI token usage.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: kernel/audit/routine-runs.ts (withRoutineRun wraps every Vercel cron handler) and scripts/routine-run-record.mjs (Mac mini launchd jobs). Append-only; nothing else writes it.
Usage: Settings → Agents (list and per-routine run history). Kernel-owned so any host can write it through the kernel helper.
Reuse: any new scheduled routine records its runs here through withRoutineRun (Vercel) or routine-run-record.mjs (Mac mini). Do not add a sibling per routine.
Do not: use for user-facing audit of admin actions (that is audit_log) or for the HTT GitHub sync's own counters (htt.sync_runs keeps those; the wrapper records the same run at the routine grain).
Columns:
- routine_id: Stable routine key: the cron path for Vercel routines (e.g. /api/cron/probation-reviews/) or mac-mini:<job> for launchd jobs.
- host: Where the run executed. Valid values: [vercel, mac-mini]
- status: Outcome. running until finished_at is set; skipped when the routine returned a skipped reason (missing config, nothing due). Valid values: [running, ok, skipped, error]
- started_at: When the run began.
- finished_at: When the run ended; null while running or if the process died.
- duration_ms: finished_at minus started_at in milliseconds.
- summary: One human line describing what the run did, derived from its result.
- result: The JSON body the routine returned (its own counters and notes).
- error: Error message when status is error.
- log: Captured log lines for the run, newline separated (Mac mini jobs paste their output here).
- ai_calls: Number of model calls made during the run.
- ai_input_tokens: Sum of input tokens across the run's model calls.
- ai_output_tokens: Sum of output tokens across the run's model calls.
- ai_cache_read_tokens: Sum of prompt-cache read tokens across the run's model calls.
- ai_cache_write_tokens: Sum of prompt-cache write tokens across the run's model calls.
- created_at: Row insert time.
Evidence: rows 0 · reads 0 · inserts 0 (stamped 5 Sep 2026)

### company_os.routine_config
One row is: one scheduled routine's switch — live, shadow or paused, and why it was paused; a routine with no row is live.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: Y.7 (Automation Plan, Stage 1). Read by withRoutineRun (kernel/audit/routine-runs.ts) on every scheduled tick.
Usage: pause a routine without a deploy; a paused routine records a skipped run that names the reason. Put a routine that declares shadow support into shadow, where it runs and records what it would have done without acting (Z.17).
Reuse: the one switch per routine. The approver of a routine is the holder of its RBAC role (Settings -> Access), not a column here.
Do not: add an approver or override column; grant it to the chat agents' roles.
Columns:
- routine_id: The routine's id, the cron path vercel.json schedules it on (e.g. /api/cron/payment-run/); the same string routine_runs.routine_id holds.
- mode: Valid values: [live, paused, shadow]. paused makes withRoutineRun record a skipped run naming paused_reason instead of doing the work; shadow runs the work as a routine_runs row with mode shadow and records each outward effect in automation_effects instead of acting (Z.17).
- paused_reason: Why the routine is paused, in a sentence; required while mode is paused, and copied into each skipped run's reason.
- updated_by: The person who last set the switch; null when set by a migration or a script.
- updated_at: When the switch was last set.

### company_os.event_deliveries
One row is: one subscriber's run of one published event — which event, which entity, whether it succeeded and why not; never the payload.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: Y.86 (decision Y.83). Written by kernel/events/bus.ts after each handler, its only writer. Append-only.
Usage: the watchdog (Z.15.7) checks every published event reached every subscriber; a dropped effect shows without reading audit_log.
Reuse: the one record of event delivery. Failures are also audited, as before.
Do not: store the payload; let a failed write fail the publisher.
Columns:
- id: Primary key.
- event_name: The event's catalogue name (kernel/events/catalogue.ts), e.g. board.card.completed.
- event_id: One id per publish call, shared by every subscriber's row for it, so the rows of one event group together.
- subscriber: The entity whose handler ran (the name it subscribed under).
- ok: True when the handler returned; false when it threw.
- error: The handler's error message when ok is false; null otherwise.
- duration_ms: Milliseconds the handler took.
- delivered_at: When the handler finished (row insert time).

### company_os.event_outbox
One row is: one bus event a database transaction recorded, waiting to be published (or published) after that transaction committed.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: Z.9 (decision 13, plan G9). Written inside RPCs that record a fact and its event together, first company_os.record_application_decision (candidate.hired); published and marked by kernel/events.
Usage: makes an event follow its write exactly once: never announced for a write that rolled back, never lost when the process dies between the write and the publish.
Reuse: any event whose fact is written by an RPC. Events published from application code after a write keep publishing directly.
Do not: store personal data in payload (ids only, as the catalogue's payloads are); delete rows to republish.
Columns:
- id: Primary key.
- event_name: The event's catalogue name (kernel/events/catalogue.ts), e.g. candidate.hired.
- dedupe_key: What makes the event one fact, e.g. the application id for candidate.hired; unique with event_name.
- payload: The event's payload as the catalogue defines it.
- created_at: When the transaction recorded it.
- claimed_at: When a publisher last claimed it; a claim older than a few minutes may be taken again.
- attempts: How many times it has been claimed for publishing.
- published_at: When it was published; null while pending.
- last_error: Why the last publish failed; null otherwise.

### company_os.automation_effects
One row is: one external effect a routine claimed before acting, of a kind the provider cannot dedupe (a Lark post, a publish, an outbound webhook), and what became of it; or, from a run in shadow mode, one it would have made.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: Z.1 (plan B3, narrowed by decision Y.82). Claimed through company_os.claim_effect; written by kernel/audit/effects.ts.
Usage: makes a Lark post, publish or webhook at-most-once across retries; the reaper turns a claim its run left behind into unknown for a person to decide. In a shadow run it records what the effect would have been instead (Z.17).
Reuse: the one ledger for provider-undedupable effects. Email keeps its domain claims and the Resend key; database effects keep their RPC claims.
Do not: record emails or database writes here; store a message body or personal data in detail.
Columns:
- id: Primary key.
- key: The effect's idempotency key, <entity>:<effect>:<subject>[:<period>]; unique, so an effect is claimed once. A shadow row's key is shadow:<key>, so it never occupies the live key.
- routine_id: The routine that claimed it (a routine_runs routine id).
- run_id: The run that last claimed it; null when that run row is gone.
- kind: Valid values: [lark, publish, webhook]. Email and database effects keep their own claims (decision Y.82).
- status: Valid values: [claimed, done, released, unknown, shadow]. claimed while the effect is under way; done with its provider reference; released when the code saw it fail (claimable again); unknown when its run ended without saying, for a person to decide; shadow when a run in shadow mode recorded it instead of acting (nothing was sent).
- attempt: How many times the key has been claimed; a released key claimed again counts up.
- claimed_at: When the latest claim was made.
- done_at: When it was marked done; null otherwise.
- provider_ref: The provider's reference for the effect (a Lark message id, a published URL); null when the provider gives none.
- detail: Small facts about the effect (a target, a count, a payload hash); never a message body or personal data.
- summary: One line, at most 500 characters, saying what the effect carried and where (e.g. Lark DM to the revenue approver: proposal ready to review); required on a shadow row, where it is the record of what would have been sent. Never a message body.

### company_os.notification_queue
One row is: one notice the notification router did not send at once, either held through quiet hours or waiting for its recipient's morning digest, and what became of it.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: Z.7 (Automation Plan B1/D, notification router v1). Written only by kernel/messaging/router.ts: notify() queues a digest kind, or an immediate kind that lands in quiet hours (Asia/Ho_Chi_Minh business time) and is not urgent; the morning flush routine sends what is due through the effect ledger and marks each row.
Usage: lets a notice wait for the next working window without being lost, and lets digest kinds reach a person as one message per working morning. Every send it makes still claims its key in automation_effects first, so a retried flush never sends twice.
Reuse: the one queue for deferred Lark notices. The in-app inbox (company_os.notifications) is a separate page a person chooses to open and is never pushed from here.
Do not: queue a message carrying a sign-in link (a credential); write rows from anywhere but the router; delete rows to resend (a released effect key is how a send is retried).
Columns:
- id: Primary key.
- kind: The router kind that queued it (the registry in kernel/messaging/router.ts), e.g. ops.qbo-token-expiring.
- channel: Valid values: [lark_dm, lark_chat, email]. How it is delivered: a Lark direct message, a post to a Lark group chat, or an email.
- recipient: Who receives it: an email address for lark_dm and email, or the chat's name (ops, revenue, product, eo, coaching) for lark_chat.
- person_id: The recipient's person, referencing people.id, when the address resolves to one; null for a group chat or an address with no person.
- subject: One line saying what the notice is about; the digest lists it, and the log's subject comes from it.
- message: The notice itself as JSON: {"text": "..."} for a text message or {"card": {...}} for a Lark card.
- urgency: Valid values: [normal, urgent]. What the caller asked for; an urgent notice is never held for quiet hours.
- reason: Valid values: [digest, held]. digest when its kind is delivered in the morning digest; held when an immediate kind landed in quiet hours.
- dedupe_key: The caller's idempotency key for the notice; unique, so the same notice queued twice is one row. A held row is sent under this key in automation_effects.
- deliver_after: The earliest moment it may be sent: the start of the next working window for a held row, the next working morning for a digest row.
- status: Valid values: [queued, sent, skipped, failed]. queued until the flush handles it; sent when it was delivered; skipped when delivery was declined on purpose (the recipient opted out of Lark DMs, or the chat is not configured); failed when the flush gave up after repeated failures.
- attempts: How many times the flush has tried to send it.
- sent_at: When it was delivered; set exactly when status is sent.
- carried_by: The automation_effects key of the send that delivered it: its own dedupe key for a held row, the digest's key (messaging:digest:<recipient>:<date>) for a digest row.
- error: Why the last attempt failed or was skipped; null otherwise.
- created_at: When notify() queued it.

### company_os.ai_calls
One row is: one model call made through the kernel/ai gateway — its site, data class, provider, model, tokens, latency and outcome, never its prompt or completion.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: kernel/ai/gateway.ts through kernel/ai/calls.ts, its only writer (Z.6). Append-only.
Usage: the per-call baseline for model routing (plan Part C): cost per feature, latency, and the before-and-after of a model change. Kernel-owned so every entity's calls land in one place.
Reuse: every model call goes through the gateway and gets its row here; routine_runs keeps its per-run token sums alongside. Do not add a per-feature usage table.
Do not: store prompt or completion text, or anything personal; the input is kept only as a hash. Do not relax a route by editing class: the rule lives in kernel/ai/routing.ts.
Columns:
- id: Primary key.
- created_at: When the call finished (row insert time).
- site: The call site name, the same string logAiUsage logs and modelFor keys its env override off (e.g. resume-screen, writer-letter-gather).
- class: The data class the call site declared at call time. Valid values: [S, C, B, A]. S sensitive (official Anthropic API only), C confidential, B internal output, A public output. The routing rule lives in kernel/ai/routing.ts, not here.
- provider: The host that served the call. Valid values: [anthropic, openrouter, google]. anthropic is api.anthropic.com; google is the Gemini image API.
- model: The model id sent on the request, in the provider's own spelling.
- input_tokens: Uncached input tokens from the response usage; null when the call failed before a response.
- output_tokens: Output tokens (thinking included) from the response usage; null when the call failed before a response.
- cache_read_tokens: Prompt-cache read tokens from the response usage; null when the provider reports none.
- cache_write_tokens: Prompt-cache write tokens from the response usage; null when the provider reports none.
- cost_usd: Cost in USD as the provider reported it (OpenRouter returns usage.cost); null until the versioned price table prices the tokens.
- latency_ms: Wall-clock milliseconds from request to response (or to the error), measured by the gateway.
- prompt_version: The call site's prompt version constant, bumped when its prompt changes, so an eval can tell prompt changes from model changes.
- input_hash: sha256 (hex) of the request's messages; matches identical inputs without storing them.
- run_id: The routine_runs row the call ran under; null until the run handle (triggerRoutine) lands.
- ok: True when the provider returned usable output; false on an error, a refusal or a max_tokens cut-off.
- error_kind: Why ok is false. Valid values: [refusal, max_tokens, timeout, connection, rate_limit, api_error, unknown]. Null when ok.
Evidence: rows 0 · reads 0 · inserts 0 (stamped 28 Sep 2026)

### company_os.sync_packets
One row is: one integration sync packet record.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: integration jobs.
Usage: sync debugging. TODO(owner): confirm which integrations still write here.
Evidence: rows 3 · reads 117 · inserts 4 (stamped 28 Aug 2026)

### company_os.assistant_conversations
One row is: one conversation session with an in-app AI assistant.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: assistant runtime.
Usage: assistant history views.
Evidence: rows 30 · reads 370 · inserts 34 (stamped 28 Aug 2026)

### company_os.coaching_trends
One row is: one derived trend summary over coaching data — rebuildable.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: derivation job.
Usage: coaching dashboards.
Evidence: rows 5 · reads 250 · inserts 5 (stamped 28 Aug 2026)

### company_os.idea_trend_reports
One row is: one derived report of the themes across the team's sparks, made by Claude — rebuildable.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the idea-themes routine each morning (W.189; before 8 Oct 2026 the weekly ideas digest wrote plain sentences).
Usage: the newest row: "What the team keeps raising" on /team/ideas and the Innovation cockpit's "Trends across ideas" card.
Do not: rank people by the themes they appear in; a theme is ordered by how many different people raised it. themes is an array of {kind, title, gist, ideaIds, relatedIds, repeats} since W.189 and of strings before; readers go through entities/ideas/lib/themes.ts, which reads both.
Evidence: rows 1 · reads 13 · inserts 1 (stamped 28 Aug 2026)

### company_os.marketing_recaps
One row is: one derived, rebuildable monthly marketing recap with Claude content suggestions.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the monthly marketing-recap cron.
Usage: the Content recommendations page (/admin/revenue/marketing/recaps) and the monthly Lark post.

### htt.project_summaries
One row is: one generated summary of a tracked project — rebuildable.
Bucket: other · Logs, audit & telemetry
Tier: 3 support
Status: active
Origin: the regenerate-summary job.
Usage: tracker reporting.
Evidence: rows 38 · reads 56 · inserts 42 (stamped 28 Aug 2026)

### Other · System config & plumbing

### company_os.access_codes
One row is: one gated content scope's current shared access code (the private library, a client's scope documents).
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: Workspace → Access codes (any admin) through kernel/identity/access-codes.ts. Nothing else writes it.
Usage: the unlock server actions read a scope's code on every attempt through resolveAccessCode, falling back to the scope's env var while no row exists, so a change takes effect with no deploy.
Reuse: any new code-gated content scope stores its code here under its access-gate scope string. Do not add an env var per scope.
Do not: store credentials, API keys or anything that identifies a person; hash the code (the super admin reads it back to send to a client); log the code or copy it into audit_log; read it from the assistant (RLS on, no policies, revoked from the chatbot roles).
Columns:
- scope: The access-gate scope the code unlocks, the same string signGate and verifyGate take (e.g. private-library). Primary key: one current code per scope.
- code: The shared code a visitor types, in plain text so a super admin can read it back to send to a client.
- updated_at: When the code was last set.
- updated_by: Email of the super admin who last set the code.
Evidence: rows 0 · reads 0 · inserts 0 (stamped 19 Sep 2026)

### company_os.qbo_connection
One row is: one QuickBooks OAuth connection with live access and refresh tokens.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: QBO connect flow.
Usage: the QBO sync reads it. Holds live credentials — RLS lockdown is mandatory; never widen read access.
Evidence: rows 2 · reads 164 · inserts 2 (stamped 28 Aug 2026)

### company_os.lark_user_connections
One row is: one team member's connected Lark account, with the live user access and refresh tokens.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: the coach's Connect Lark button on their coaching page (OAuth), from 9 Oct 2026.
Usage: the coaching minutes cron reads it to search and export that person's own 1-1 recordings, which the Edge8 tenant app cannot list or read. Holds live credentials — RLS lockdown is mandatory; never widen read access.
Reuse: the one place a person's Lark user token lives. Do not put user tokens in env vars or on team_members.

### company_os.integration_sources
One row is: one configured external integration source.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: integration setup.
Usage: sync jobs read their config here.
Evidence: rows 10 · reads 144 · inserts 10 (stamped 28 Aug 2026)

### company_os.admins
One row is: one admin of the console, with the person behind it, who granted it, and whether they may see sensitive data (`can_view_sensitive`, the Super Admin level).
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: Settings → Admins (`entities/company-os/routes/admin/(dashboard)/settings/admins`), through `kernel/identity/writes.ts` (`insertAdmins`, `updateAdmins`); every write lands in `audit_log`.
Usage: `isAdminEmail` in `kernel/identity/admin-auth.ts` on every admin request (3,367 reads).
Reuse: **this is the only register of admins.** The `ADMIN_ALLOWLIST` env var is bootstrap for a fresh deployment with no rows and nothing more: an env admin has no `person_id`, no audit row and no Super Admin level (B.28, 3 Oct 2026: an admin with no identity behind him). Never grant admin by SQL insert or by editing the env; use the screen, and empty the allowlist once rows exist.
Evidence: rows 6 · reads 3,367 · inserts 8 (stamped 3 Oct 2026)

### company_os.access_roles
One row is: one role a person can hold — a named bundle of permissions (Team member, Manager, Revenue, Admin) — either granted by a person or implied by a fact the data already records (ADR 0013).
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: seeded by migration 20261006150000_access_tables with the ten roles that reproduce today's access; later roles, such as a one-person role for a single duty, are created in Settings → Access (AC.17) through `kernel/identity/writes.ts`.
Usage: the access resolver in `kernel/identity` (AC.4) reads it on every signed-in request.
Reuse: the only register of access roles. A job role the company sells hours of is `capacity_roles`; a seat in the org chart is `positions`; a contact's role at a client is `person_companies.role`. None of those decide what anyone may see.
Do not: delete a role (archive it); grant a role by SQL insert (use Settings → Access); or create a role per person where an existing bundle fits.
Columns:
- id: Primary key.
- key: The role's stable key, which code and declarations name (team-member, finance); lower-case words joined by hyphens, unique.
- name: The role's name as Settings → Access shows it.
- description: One sentence saying what holding the role means.
- kind: Whether a person is given the role (granted) or holds it because of a fact about them, such as employment type or having direct reports (implied). Valid values: [granted, implied]
- created_at: When the role was created.
- archived_at: When the role was retired. Null while it is live; an archived role grants nothing.
- archived_by: The person (company_os.people) who retired it; null while it is live or when a migration retired it.

### company_os.access_role_permissions
One row is: one permission one role holds, with how far it reaches (own, team, clients, all).
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: `npm run access:sync` (AC.4), which inserts each declared permission's default holders the first time that pair is ever seen, and Settings → Access (AC.17), which adds and revokes pairs. Both through `kernel/identity/writes.ts`.
Usage: the access resolver (AC.4) unions a person's roles' live rows into the permissions they hold on each request.
Reuse: the only record of what a role may do. The permissions themselves are declared in code, in each entity's `permissions.ts`; this table holds which role has which.
Do not: delete a row (revoke it, so the sync never re-adds a pair someone removed on purpose); store a permission key no entity declares (it grants nothing and check:access reports it); or give a person a permission directly (make a one-person role).
Columns:
- id: Primary key.
- role_id: The role (company_os.access_roles) that holds the permission.
- permission: The permission's key as an entity declares it (boards.open, team.enter): owner, a dot, and a name.
- scope: How far the permission reaches for a holder of this role. Valid values: [own, team, clients, all]
- created_at: When the role was given the permission.
- created_by: The person (company_os.people) who added it in Settings → Access; null when the sync added it from the declared defaults.
- revoked_at: When the role lost the permission. Null while it holds it; a revoked pair is kept so the sync never adds it back.
- revoked_by: The person (company_os.people) who revoked it; null while it is live.

### company_os.access_role_assignments
One row is: one person holding one granted role, with who granted it and why. Grants have no end date: one ends when it is revoked or when the person leaves the team.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: Settings → Access (AC.17) and the team invite's Roles field (AC.18), through `kernel/identity/writes.ts`; every write also lands in `audit_log`. Admin and Super Admin are read from `company_os.admins` until AC.20 folds that table in.
Usage: the access resolver (AC.4) reads a person's live assignments on every signed-in request.
Reuse: the only record of granted roles. An implied role (Team member, Contractor, Manager, Coach, Hiring manager, Client user) is never assigned: it follows the fact that implies it.
Do not: delete a row (revoke it); assign an implied role; grant by SQL insert; or add an end date — access ends with the person's team status, the same way for every kind of member.
Columns:
- id: Primary key.
- person_id: The person (company_os.people) who holds the role.
- role_id: The granted role (company_os.access_roles) they hold.
- granted_by: The person (company_os.people) who granted it; null only for a row a migration wrote while folding an older register in.
- reason: Why the role was granted, in the granter's words; required.
- created_at: When the role was granted.
- revoked_at: When the grant was revoked. Null while it is live.
- revoked_by: The person (company_os.people) who revoked it; null while it is live.
- revoke_reason: Why the grant was revoked; set exactly when revoked_at is.

### company_os.portal_members
One row is: one person's membership and role in the portal.
Bucket: other · System config & plumbing
Tier: 3 support
Status: active
Origin: portal administration.
Usage: access control (977 reads).
Evidence: rows 15 · reads 977 · inserts 15 (stamped 28 Aug 2026)

---

## Dropped by design

### company_os.platform_identities
One row is: one mapping between a person or company here and their identity on an external platform.
Bucket: master · Customers & partners
Tier: 1 spine
Status: dead
Origin: DROPPED 27 Aug 2026 in the redundancy cleanup (zero code references at the time). The design intent stands: recreate this table when the AIO bridge is built, rather than adding external-id columns to spine tables.
Usage: none — does not exist.
Evidence: dropped (stamped 28 Aug 2026)

## Graveyard

Executed 27 Aug 2026 (`drop_redundant_tables_cleanup_20260827`, approved by engineering leadership; archives of non-empty tables in schema `graveyard_20260827`): the content system (6 tables + pillar_channels), one_on_ones + one_on_one_sessions, skills + person_skills + person_relationships, touchpoints, stage_templates + stage_template_stages, requisition_loop_interviewers, platform_identities, rate_limit_log, ai_screen_corrections, brand_contacts, metrics + metric_readings, six htt tables (goal_events, pr_attribution_overrides, roi_actuals, scenarios, survey_invitations, work_sessions), the entire agents schema, and the legacy public schema (19 tables, 5 views). The auth signup trigger `handle_new_user` went with it — new auth signups no longer auto-create an employees row.

Executed 28 Aug 2026 (pending deploy where noted): `marketing_calendar` → `marketing_content` (applied; compat view since dropped); `meeting_notes` dropped, folded into `meetings` as source='notes' rows; `meeting_links` → `meeting_associations`; `team_knowledge` → `company_information`; `compensation` → `compensation_sensitive`; legacy `goals` dropped and `coaching_goals` promoted to `goals`.

Executed 28 Aug 2026, applied directly (not in migration history): `campaigns` dropped (superseded by `marketing_campaigns`); the meeting_notes fold and meeting_links rename were also applied directly — their migration files no-op safely on deploy.

Written 25 Sep 2026, pending apply (`20260925100000_capacity_model`, card S.7): `availability_blocks` dropped. It modelled availability per person, which the capacity model deliberately does not (roles and hours, never people), and no code read it; `capacity_roles` and `capacity_commitments` replace it. Its three production rows are recorded by id in the migration.

Superseded, still present because code references them — remove the code paths, then drop: `tags` + `taggables`.

On hold, re-verdict with owners: `marketing_pillars`, `requisition_loop_steps`, `event_agenda_staff`.
