# ADR 0032 — A need between entities is a `requires` edge only when the dependent cannot work without it

Date: 2026-10-29. Status: proposed. Extends ADR 0004 (`requires` edges) and ADR 0001 (one
deployment per client), and gives ADR 0026 the definition of a slot that it lacked.

Both architects of the 29 October review found this independently, and both named it the
missing root rule.

## Context

ADR 0004 made `requires` the edge that decides what a deployment installs. `check:requires`
fails a door that is reached but not declared, and the install order is derived from the
edges. Nothing says **which** needs should be a `requires` edge. So every need became one, the
first time someone imported a door.

The result is measured in `deployments/minimal.json`, "a client who bought the Workboard". It
installs 11 of the 27 entities: billing, boards, client-programs, company-os, contacts, crm,
finance, htt, ideas, org and portal. `htt` is internal, so the smallest client build carries
Edge8's own telemetry.

The file's comment explains the chain (`minimal.json:5-7`). The edges behind it mostly carry
very little:

| Edge | What it carries | Kind of need |
|---|---|---|
| boards → crm | four meeting-action symbols on one line (`boards/lib/meeting-cards.ts:7`) | a write-back to crm |
| crm → org | `surveyResponsesOfPerson` (`crm/lib/contacts.ts:2`) | an optional panel on the contact page |
| crm → finance | `pastDueInvoicesOf`, `isCollectible` (`crm/lib/account-health.ts:7`) | an optional health signal |
| crm → billing | commissions, bookings and orders on the contact and company pages (`crm/lib/affiliates.ts:1`, `contacts.ts:1`, `companies.ts:1`) | optional panels, plus affiliate redemption |
| portal → htt | `listDeliveredAdditionHours` (`portal/lib/hub-tokens.ts:37`), excused in `check-requires.mjs:50-58` | an optional band |
| hiring → org | `coreValuesForScorecard` (`hiring/lib/interview-panelist.ts:1`) | a lookup |
| reimbursements → org | `legalEntityEditHref`, `redInvoiceBuyerEntity` (`reimbursements/lib/red-invoice-buyer.ts:14`) | a lookup and a link |

Each edge installs a whole entity and everything that entity requires. A CRM without finance
still makes sense, and so does a Workboard without a CRM. The graph says otherwise.

Splitting the hubs alone does not fix this. Moving meetings out of crm (backlog H3) cuts one
edge. The company page still wants invoices, whichever entity owns meetings.

## Decision

A need from entity A on entity B is one of four kinds, and the kind decides the mechanism:

1. **A hard need**: A cannot do its job without B. This is a `requires` edge and a door import.
   Example: crm grants a portal role through company-os.
2. **An optional enrichment**: A's page is better with B's data, and complete without it. This
   is a **slot** (ADR 0026). B provides it, A's page takes it, and a deployment without B shows
   the fallback. Examples: invoices on the company page, survey answers on the contact page,
   the Human Tokens band.
3. **A write-back or a reaction**: something A did should change B's data. This is an **event**
   A publishes and B subscribes to (ADR 0027), or a command on B's door when the edge already
   runs from B to A. Example: boards' meeting cards. crm does not require boards today, so crm
   files meeting actions through a boards command, and boards drops its edge to crm without
   making a cycle.
4. **A need across a deployment boundary**: A and B are in different applications. This is a
   **contract** (a view, an intake row or a public endpoint), never an import (ADR 0034).

A small lookup that sits on the wrong side (a scorecard's core values, a link helper) moves to
the entity that uses it, or to the kernel when it is truly shared and names no entity.

**The size of `deployments/minimal.json` measures this ADR.** Each change it leads to is judged
by the entities it removes from that file's closure. A new `requires` edge states which of the
four kinds it is, in the manifest beside the edge, and `check:requires` refuses an edge without
one.

## Alternatives rejected

- **Split the hub entities first.** A split does not remove an enrichment edge. Meetings out of
  crm (H3) stays the fallback for any write-back whose reversal would make a cycle. Org's split
  (H4) is about org's own size (26 tables), not about closure, because org requires only
  `ideas`.
- **Accept the closure and call `minimal.json` "the Workboard plus its context".** That gives
  up ADR 0001's promise for every client who buys less than the catalogue.
- **Make every cross-entity need a slot.** A hard need hidden behind a fallback fails silently
  in a deployment that lacks the provider. The edge is the honest form of a hard need.

## Consequences

- `boards → crm` reverses, `crm → org`, `crm → finance` and `portal → htt` become slots, and the
  two lookups move. The first measurement after those changes is what `minimal.json` closes over.
- `crm → billing` is mixed. The panels become slots, and affiliate redemption is decided on its
  card.
- Khoa decided on 2026-10-29 that the Human Tokens model is an Edge8 overlay (ADR 0031,
  "Decided"). So the band is not the only `htt` slot. crm's token and hours admin and the Team
  hub's hours and PR story become `htt` slots too.
- The `portal → htt` exception in `check-requires.mjs` closes when the band becomes a slot. That
  is also one of the three blockers in ADR 0031.
- The comment at the top of `minimal.json` is rewritten from the measurement, not by hand.

## What would reopen it

A deployment that must ship with an enrichment that cannot fail silently, such as a page whose
legal or financial content would be wrong without the provider. That need is a hard need, and it
should be declared as one.
