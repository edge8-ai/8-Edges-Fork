# edge8-web — ubiquitous language

The glossary for the product and its architecture. Terms only; implementation lives in
`docs/engineering/` and decisions in `docs/adr/`.

## Architecture terms

**Entity** — The unit of installation. One folder under `entities/`, one manifest entry,
one set of owned tables, two doors. An entity is either present in a deployment or absent;
there is no smaller switchable unit. Replaces the earlier "module" concept, which was a
sub-division inside an entity and is retired.

**Kernel** — Shared code every entity may use and no entity owns: identity, data access,
messaging, audit, config, UI primitives, AI helpers, and the shells. The kernel knows no
entity by name.

**Door** — An entity's public import surface: `index.ts` for the server and `client.ts` for
the browser. The only paths another entity or the composition root may import.

**Mandatory set** — The entities every deployment must include. Currently the kernel and
Contacts. Other entities may hard-depend on the mandatory set without declaring it.

**Optional entity** — Any entity outside the mandatory set. May be absent from a deployment.

**Catalogue** — `entities.manifest.json`: every entity that exists in the repo, its tables,
and its hard dependencies. Describes what *can* be installed.

**Deployment file** — The build-time list of which catalogue entities one deployment
includes. One deployment serves one client; there is no per-tenant switching at runtime.
Must be closed under hard dependencies.

**Self-hosted** — The client runs their deployment on their own Vercel and Supabase accounts
and owns the code copy and the data. Edge8 supports on request and never operates it.

**Upstream** — Edge8's private repository, where the code is made right first. Clients never
see it.

**Product repository** — The separate repository clients can access. Edge8 hand-ports chosen
portable entities into it per release. Nothing is automated between upstream and product.

**Portable** — An entity Edge8 may port to the product repository. A portable entity never
requires an internal one.

**Internal** — An entity that stays in upstream: Edge8's own business, or work not yet
released.

**Port** — Copying one or more portable entities from upstream into the product repository,
by hand, after deciding exactly what goes.

**Install** — Taking a fresh copy of the code, a deployment file and a new Supabase project
to a running instance, by following the generated setup checklist.

**Layer** — An entity's position in the dependency order, derived from its hard dependencies
rather than assigned by hand. The kernel is the floor; the mandatory set sits on it.

**Hard dependency** — Entity A *requires* entity B when A's feature is meaningless without
B. Declared in the manifest. A may import B's doors directly. A deployment that includes A
must include B.

**Soft effect** — Something that happens in entity B *because* of an action in entity A,
where A remains meaningful without B. Expressed as an event A emits and B subscribes to.
A never imports B for a soft effect.

**Event** — A named, past-tense fact one entity publishes (`coaching.session.completed`).
Handlers run in-process during the same request; a handler failure is logged and never
fails the publisher. An event is always something that *has happened* and is never a
thing anyone can move: an entry in somebody's calendar is not an event, however the
calendar vendor names it.

**Surface** — An area of the product with its own shell: Public, Admin, Team hub, Portal. A surface
is not an entity and owns no tables.

**Shell** — The kernel-owned frame of a surface: layout, sidebar, guard, home page. A shell
renders whatever the installed entities contribute.

**Contribution** — What an entity offers to a shell: navigation items, dashboard cards and
detail-page tabs, each with a group, a weight and the permission a viewer needs. Pages are
contributed by placement, not registration: a file under the entity's `routes/<surface>/`
tree. The entity that owns a table owns every contribution that writes it.

**Permission** — The smallest thing a person can be allowed to do or see, named by the entity
that offers it ("approve reimbursements", "see the coaching roster"). Code asks about
permissions and about nothing else: never "is this person a coach", never "is this an admin".
_Avoid_: "capability" and "entitlement" for this — both were earlier names for the same idea.

**Role** — A named bundle of permissions a person holds. Baseline roles follow the person's
employment type (Team member, Contractor); module roles are granted and are named after the
module they open (Revenue, Operations, Company, Finance); Admin and Super Admin are roles too;
a one-person role exists for a single duty ("Reimbursement approver"). A person may hold
several; what they may do is the union. A role only ever adds — there is no role that takes a
permission away — so "why can Anna see this" always has a one-line answer.

**Relationship** — A fact about the organisation that the data already records: who reports
to whom, who coaches whom, who is assigned to which client. A relationship *scopes* a
permission (a Manager sees *their* reports' time off) and may *imply* a role (someone with
direct reports is a Manager without anyone granting it). A relationship is never granted or
revoked by hand; the org data changes and the implication follows.

**Scope** — How far a permission reaches: *own* (my records), *team* (my reports'), *clients*
(the clients I am assigned to), *all*. A role grants a permission together with its scope
("Manager: see time off, team"), and the scope is turned into actual people and companies by
the relationships. A page never widens a scope on its own.

**Implied role** — A role a person holds because of a fact about them, not because anyone gave
it: the baseline from their employment type (Team member, Contractor), and from relationships
Manager (someone reports to them), Coach (they coach someone), Hiring manager (they own an
open requisition). It cannot be revoked in Settings; it goes when the fact goes.

**Grant** — Giving a person a role, by someone who holds that role and may manage access.
Every grant and revoke is recorded with who, whom, which role and why. A grant has no end
date: it lasts until it is revoked or until the person leaves the team, when every role goes
with them. A permission is never granted on its own: a one-person role is made instead, so
every "why can he" has the same shape of answer.

**Actor** — The signed-in person as the code sees them for one request: who they are, the
roles they hold and why, and what each permission reaches. Every page and action asks the
actor; nothing asks a table.

**Access declaration** — What an entity says about itself in access terms: the permissions it
offers, each with a plain sentence, the pages and actions each one covers, and the
relationships that imply a role. The sidebar, search, the assistant and notifications all
read the same declaration, so none of them can disagree with the page.

**Employment type** — How a team member is engaged: full-time, part-time, intern, contract.
A fact about the person that HR owns. It sets which baseline role they hold and nothing else;
what a person may see beyond the baseline is a matter of granted roles, not of type.

**Contractor** — A team member whose employment type is contract: a contract accountant, a
marketing freelancer on a long engagement. A contractor is onboarded like anyone else and
holds the Contractor baseline role, which opens less than Team member does; every further
module is granted to them the way it is granted to a full-timer. The engagement has no end
date: it ends when either side ends it, and access ends with the person's status.
_Avoid_: "outsider" and "external user". Both named a separate kind of person with their own
surface; there is one kind of person on the team, and type is a fact, not a boundary.

**Search contribution** — One kind of record an entity lets the global search find (S.1):
a kind, the surfaces it answers on, and a searcher that receives the **search actor** (the
surface's guard answer, tagged with its surface) and applies the same gate as the screen a
hit opens on. The entity that owns that screen owns the contribution, even when another
entity owns the table: crm contributes people, company-os contributes invoices. Exported
as `searchContributions` from the entity's `index.ts` and composed into the generated
`app/search.ts`. A searcher whose read fails reports the kind as failed, never as empty.

**Inbox** — Each person's page of what changed on their work since they last looked
(`/team/inbox`, `/admin/inbox`; the notifications entity, S.3). It is filled only by
subscribing to catalogue events, one row per person a fact matters to, never for a fact the
person caused. It is a page people choose to open: no counts, no badges, and nothing it holds
is ever pushed to chat or email. Distinct from a notification in the Lark sense, which is a push.

**Approval** — A request for somebody's decision and its outcome, kept by the kernel's approvals
primitive (`kernel/approvals`, S.5) whatever flow raised it: a leave request, a contractor
estimate or submitted work, an assistant action. Each flow keeps its own state and decides who
may approve; the approval records who was asked (`approver_person_id`, null meaning any admin),
who answered and how. What is **waiting on** a person is their pending approvals, plus the
unassigned ones for an admin. A new flow adds a subject type rather than a fourth implementation.
Leave is always decided by somebody else, except for whoever **leads the organisation** (an
active team member with no manager above them, the CEO): nobody is above them to ask, so their
leave waits on them and they decide it. The rule reads the org chart, never a name.

**Withdrawn leave** — Approved leave that is later cancelled or denied. Its approval keeps the
decision it had and gains the reversal as a newer row, because a subject's answer is its latest
approval row; the fact `leave.withdrawn` is stated once, so the requester's inbox no longer
reads as approved. Distinct from a *cancelled request*, withdrawn before anyone decided it,
which states nothing. A 1-1 coaching moved off the leave stays where it was moved.

**Public shell** — The kernel-owned frame for the unauthenticated web: home, sign-in, auth
callback. Site, when included, contributes the marketing home in place of the default.

**Entity environment** — The environment variables an entity declares in the catalogue.
A deployment validates the union over its included entities and nothing more.

**People** — A kernel table, not an entity's. Identity needs it to resolve who is signed in,
so the kernel keeps the writer and Contacts is the screen owner over it.

**Person name** — Three questions, each with one answer in `kernel/config/people-name.ts`
(S.14). The *display name* (`personName`) is what a list, card or record shows: `display_name`
first, because it alone is reliably Given + Family. The *greeting name* (`greetingName`) is
what a person is addressed by: a one-word nickname they asked for (or, when they asked for the
whole of their `display_name`, its first word), then their given name
(`first_name`, or the first word of `display_name`), then the caller's word ("there") — never a
full name or an email. The *legal
name* (`legalName`) is `full_name` as recorded, in whatever order it was given — right for the
directory, wrong for sorting. A screen calls one of the three and never spells its own chain;
`people-name.scope.test.ts` bans any that does.

**Composition root** — `app/`. The only place that knows which entities a deployment
includes; it registers their contributions and mounts their routes, APIs and crons.

## Product terms

**Contacts** — The entity holding people, companies and brands, and the relationships between
them. Mandatory, because every other entity hangs data off a person or a company.

**Company OS** — Historical name for the admin application. After the split it names no
entity; the code it held becomes the entities below, each contributing to the Admin surface.

**CRM** — Pipelines, deals, calls and scorecards for selling. Requires Contacts.

**Deal** — One possible sale to one client, sitting in exactly one stage of the pipeline.
Where it sits is the whole truth about it: whether it is open, won or lost is read off the
stage, never recorded beside it.

**Stage** — A column of the pipeline. Two are closing stages, Won and Lost; every other
stage is open. A deal in an open stage is open, whatever else is written about it.

**Closing a deal** — Moving it into Won (with the final amount) or Lost (with a reason).
Closing has consequences a stage move alone does not: a won client becomes a customer and
the win is announced; a lost person falls back to nurture unless another live deal stands.
_Avoid_: "marking a deal won" as though the mark and the move were two things.

**Reopening a deal** — Moving a Won or Lost deal back to an open stage. It is an open deal
again, and the person is back on an open deal; a lost reason no longer applies.

**Handoff** — An SDR passing a qualified lead to a closer as a new deal, pending until the
closer answers. Accepted, it is an ordinary open deal. Rejected, it is not a loss: the
closer declined to take it on, which says nothing about whether the client would buy. The
deal is set aside and the person goes back to the SDR queue as connected.

**Lead** — A person the SDRs are working, one per person at most: *connected* (in the SDR
queue), *open deal* (a deal stands), *nurture* (no live deal, kept warm) or
*disqualified*. A customer has no lead.

**Hiring** — Candidates, applications and stages. Requires Contacts.

**Boards** — Work boards, columns and cards (tasks). Requires Contacts.

**Business date** — The calendar date in Saigon. Every reading of "today", and of the day
something happened, is a business date, wherever the code that reads it runs: a server
elsewhere or a browser in another country still gets Saigon's date. The business date
turns over at midnight in Saigon. It is a calendar date, not a working day: weekends are
business dates like any other.

**Overdue** — A card that is still open and whose due date is before today's business date,
counted in calendar days. A card due today is not
overdue until tomorrow; a card due on a Saturday is overdue from the Sunday. Open means open
as the card's lane shows it: a card sitting in a done lane is done, whatever else its row
says, so it is never overdue. Every screen, figure and message that calls a card overdue
means exactly this; a card with no due date is never overdue, only undated.

**Internal board** — A board that belongs to no client: Edge8's own work. Where a card's
client would be named, an internal board's card reads "Internal". Not the same thing as an
internal card.

**Internal card** — A card the client never sees, on whichever board it sits, including a
client's own board. Whether a card is internal says who may read it; whether its board is
internal says whose work it is. The two are independent.

**Deliverable** — A file or a link attached to a card as what its work produced: a
screenshot, a PDF, a video, a design or a document link. A card's PR is not a deliverable; it
is a field of its own, one per card. Deliverables are the team's: the client portal never
shows them, or their number, whether or not the card is internal.
_Avoid_: "attachment" for the PR, or for a file on a person or a company (`documents`).

**Campaigns** — Email campaigns, letters, blog and marketing digests. Requires Contacts.

**Org** — The company itself: directory, departments, positions, goals and OKRs, values,
strategies, surveys, workplace equipment, and the capacity model.

**Capacity role** — A kind of work the company sells hours of ("Senior engineer"), with the
hours per week it can give from a given date on. Its supply is those hours every week from
then, and none before. A capacity role is never a person, and capacity is never measured
per person: the question is what a role can take, not how busy somebody is. It may point at
an org-chart position, but it is not one.

**Commitment** — Hours per week of one capacity role already promised, to a client or to
internal work, from a start date to an end date or open-ended. It counts in every week its
dates touch. A role's free hours in a week are its supply minus its commitments; a *fit
check* asks whether new work would push any week of its span below zero, and by how much
at worst. Not a coaching commitment, which is a promise a person makes in a 1-1.

**Finance** — Bookkeeping: invoices, QuickBooks, contractor payments, vendors, FX, products
and orders. Distinct from Billing, which is the Stripe-facing side of taking money.

**Reimbursements** — Claims, their checking and approval, and the payment runs that pay them
back. Its own entity, apart from Finance, because a claim names a trip and Retreats already
depends on Finance. Its screens sit in the Finance group of the menus, and the team member's
own claims sit under Me.

**Claim** — A request from one team member to be paid back for money they spent on Edge8's
behalf. It holds one or more claim items, may name the trip it belongs to, and moves as one
thing through two decisions and then payment: someone whose role allows checking (Finance, or
the CEO as the employer) *checks* it, then the CEO *approves* it, and it is paid as one amount in VND (the
approved items' total) in the next payment run. The member may change or withdraw it until
it is checked; after approval it is locked, and only being sent back reopens it. No employee
checks their own claim. The CEO, as the employer, is exempt and may check and approve any
claim, the CEO's own included; a stand-in approver would not inherit that.
_Avoid_: "expense" for a claim — an expense is a line in the company's books.

**Claim item** — One receipt inside a claim: what was bought, where, when, from whom, its
category, the amount in the currency it was paid in, and its value in VND: Techcombank's
selling rate on the day it was bought (Vietcombank's for a currency Techcombank does not
list), unless the member enters what their card actually charged. While no bank has a rate
for the day the item is "rate pending", and a checker enters the rate by hand. Each item can be declined
on its own, with a reason, so one bad receipt does not hold up the rest. An item bought
abroad with no receipt carries a written explanation instead; an item bought in Vietnam has
no such way out (see red invoice).

**Red invoice** — The VAT invoice (hoá đơn đỏ) a Vietnamese seller issues to Edge8 by name
and tax code. Every claim item bought in Vietnam must carry one as a PDF (the seller's
e-invoice or a scan; a photo is not enough), or the claim cannot be submitted: it is a legal
requirement, not a preference. An invoice made out to the employee personally is not a red
invoice for this purpose.

**Checked** — The first decision on a claim: Finance or the CEO confirmed the
documents are in order and the total is right. Only a checked claim reaches the CEO.
Distinct from *approved*, which is the CEO's decision that Edge8 will pay.

**Sent back** — A claim the checker or the CEO returned to its owner to fix and submit
again, its history kept. Distinct from *rejected*, which ends the claim with a reason, and
from a *declined item*, which removes one receipt while the rest of the claim goes on.

**Payment run** — The list of everything to pay back, made on the 1st and the 15th of each
month from the claims approved since the last run, grouped by person with their bank
details. Finance pays from it. It is read where Finance signs in, never sent as an
attachment, because it carries bank details. A claim approved after the cut-off waits for
the next run.

**Reimbursement payment** — One bank transfer that pays one person for one or more approved
claims, recorded with the bank's receipt and the VND amount actually sent. A claim is
*paid* when the payment that covers it is recorded. The CEO's authorisation of the transfer
happens in the bank, not in the product.

**Ideas** — Ideas, issues, trend reports and agent sync packets. Internal.

**Client Programs** — Roadmaps, backlogs and AI programs delivered to a client. Contributes
to both the Admin and Portal surfaces.

**Retreats** — Trips and, after the split, the events, agendas and talks that used to sit in
Company OS. Internal.

**Trip** — A named journey or event people travel for ("Australia – EO Melbourne, Oct
2026"), held by Retreats. Claims from several people can name the same trip, so what a trip
cost is the sum of its paid claims. Any team member may add a trip while making a claim.
_Avoid_: "event" when talking to a person about a trip — Event already names an
architecture fact.

**Team** — The employee-facing entity: reviews, directory view, profile. Owns the admin
screens for those subjects too. Its former modules are entities that require it:

**Coaching** — One-on-ones, commitments, recaps. Requires Team.

**1-1 schedule** — A profile's booked 1-1, the 1-1 awaiting an answer, and the suggested
date, read and changed together as one thing, so none of the three can disagree with the
others.

**Booked 1-1** — A 1-1 a person put on a day: the coach, the member naming the day of
their first 1-1, or the member through a date the coach confirmed. It is the only thing
that says when the next 1-1 is. No routine books one.

**Suggested date** — The day the product would propose for the next 1-1 when none is
booked: the last held or skipped 1-1's day plus the cadence, on that 1-1's weekday — or
on the weekday it was moved from, because a move is a one-off and the rhythm is the day
the pair agreed. When that day has already gone by, it is the soonest such weekday from
today, never a whole cadence later. It steps over approved leave. It is shown as a suggestion and never
mistaken for a booking; the member can propose it and the coach can book it. Someone who
has never had a 1-1 gets no suggested date; their first one is agreed with them.
_Avoid_: "next 1-1" for a suggested date — the next 1-1 is a booked one.

**Meeting outcome** — What became of one 1-1, as a single fact rather than the two
columns behind it: *held*, *booked*, *passed unheld* (a booked 1-1 whose day went by with
nobody marking it held or skipped — the passing day is the fact, nothing stamps it) or
*skipped*. A 1-1 the coach marks held after its day has passed is recorded as late at
that moment, by the coach's own answer, so *held late* is a separate
question and deliberately not a fifth outcome — the month's held count reads
`outcome === "held"`, and splitting that value would drop those meetings out of it.

There is no calendar hold: the product never puts a 1-1 in anyone's calendar
(ADR-0009, withdrawn 2026-09-25).

**Onboarding** — Journeys, plans, cycles. Requires Team.

**Time Off** — Requests, balances, leave policies. Requires Team.

**Portal** — Client membership and entitlements. The pages a client sees are contributions
from other entities to the Portal surface.
