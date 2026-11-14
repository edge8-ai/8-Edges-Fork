import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The deal, lead, pipeline and inquiry questions crm's door answers (A.63).
// Each row is the query a caller in another entity built by hand before A.63.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  dealCountInStage,
  dealsReferredBy,
  dealsWonBetween,
  liveDealFigures,
  liveDeals,
  openDealContactsPage,
  openPipelineAmounts,
  ownedDealsWithNextStepBy,
} from "./deals";
import { leadCountBetween, leadsCreatedSince } from "./leads";
import { firstActivePipeline, pipelineStageNames } from "./pipelines";
import { latestRetreatInquiry, markInquiryWon, portalInquiriesOf, recordInquiry } from "./inquiries";

beforeEach(() => resetQueries());

const FROM = "2026-10-01T00:00:00+07:00";
const TO = "2026-10-31T23:59:59.999+07:00";
const CHAT_DEAL = "title, status, stage_id, owner_id, company_id, amount_cents, currency, amount_usd_cents, expected_close_date, closed_at";
const REFERRED = "id, title, status, archived_at, referrer_id, affiliate_id, companies!company_id(name)";
const NEWEST = { ascending: false };

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // company-os admin dashboard.
  ["liveDealFigures", () => liveDealFigures(2000), "deals", [["select", "status, amount_usd_cents, created_at, closed_at"], ["is", "archived_at", null], ["limit", 2000]]],
  // company-os Admin Home's follow-ups: a null next_step_date never satisfies lte.
  [
    "ownedDealsWithNextStepBy",
    () => ownedDealsWithNextStepBy("p1", "2026-11-03"),
    "deals",
    [
      ["select", "id, title, amount_usd_cents, stage_id, next_step, next_step_date"],
      ["eq", "owner_id", "p1"],
      ["eq", "status", "open"],
      ["is", "archived_at", null],
      ["lte", "next_step_date", "2026-11-03"],
      ["order", "next_step_date"],
      ["limit", 50],
    ],
  ],
  ["leadsCreatedSince", () => leadsCreatedSince("2026-07-19", 1000), "lead", [["select", "created_at"], ["gte", "created_at", "2026-07-19"], ["limit", 1000]]],
  // team chat companyTotals and customersAndProspects.
  ["openPipelineAmounts", () => openPipelineAmounts(), "deals", [["select", "amount_usd_cents"], ["eq", "status", "open"], ["is", "archived_at", null]]],
  ["dealsWonBetween", () => dealsWonBetween(FROM, TO), "deals", [["select", "company_id"], ["eq", "status", "won"], ["gte", "closed_at", FROM], ["lte", "closed_at", TO]]],
  [
    "leadCountBetween",
    () => leadCountBetween(FROM, TO),
    "lead",
    [["select", "id", { count: "exact", head: true }], ["gte", "created_at", FROM], ["lte", "created_at", TO]],
  ],
  // team chat listDeals: unfiltered, then every filter in the order it applied them.
  ["liveDeals (unfiltered)", () => liveDeals({}, 50), "deals", [["select", CHAT_DEAL], ["is", "archived_at", null], ["order", "created_at", NEWEST], ["limit", 50]]],
  [
    "liveDeals (filtered)",
    () => liveDeals({ companyId: "c1", titleContains: "50%_off", status: "won" }, 50),
    "deals",
    [
      ["select", CHAT_DEAL],
      ["is", "archived_at", null],
      ["eq", "company_id", "c1"],
      ["ilike", "title", "%50\\%\\_off%"],
      ["eq", "status", "won"],
      ["order", "created_at", NEWEST],
      ["limit", 50],
    ],
  ],
  ["pipelineStageNames", () => pipelineStageNames(["s1", "s2"]), "pipeline_stages", [["select", "id, name"], ["in", "id", ["s1", "s2"]]]],
  // campaigns audience facts, one page.
  [
    "openDealContactsPage",
    () => openDealContactsPage(0, 999),
    "deals",
    [["select", "person_id, company_id"], ["eq", "status", "open"], ["is", "archived_at", null], ["order", "id"], ["range", 0, 999]],
  ],
  // portal Build Your Team request.
  [
    "firstActivePipeline",
    () => firstActivePipeline(),
    "pipelines",
    [["select", "id, pipeline_stages(id, position)"], ["eq", "active", true], ["order", "created_at"], ["limit", 1], ["maybeSingle"]],
  ],
  ["dealCountInStage", () => dealCountInStage("s1"), "deals", [["select", "id", { count: "exact", head: true }], ["eq", "stage_id", "s1"]]],
  // portal referrals: the person alone, then with companies and affiliate codes.
  ["dealsReferredBy (person)", () => dealsReferredBy({ personId: "p1", companyIds: [], affiliateIds: [] }), "deals", [["select", REFERRED], ["or", "referrer_id.eq.p1"], ["order", "created_at", NEWEST]]],
  [
    "dealsReferredBy (all three)",
    () => dealsReferredBy({ personId: "p1", companyIds: ["c1", "c2"], affiliateIds: ["a1"] }),
    "deals",
    [["select", REFERRED], ["or", "referrer_id.eq.p1,referrer_company_id.in.(c1,c2),affiliate_id.in.(a1)"], ["order", "created_at", NEWEST]],
  ],
  // site contact route, retreats sign-up, portal general request (which now reads the id back too).
  ["recordInquiry", () => recordInquiry({ person_id: "p1", type: "consultation", source: "portal" }), "inquiries", [["insert", { person_id: "p1", type: "consultation", source: "portal" }], ["select", "id"], ["single"]]],
  // portal listPortalInquiriesForActor.
  [
    "portalInquiriesOf",
    () => portalInquiriesOf("p1", 5),
    "inquiries",
    [["select", "id, subject, status, created_at"], ["eq", "person_id", "p1"], ["eq", "source", "portal"], ["order", "created_at", NEWEST], ["limit", 5]],
  ],
  // billing Stripe fulfilment, the retreat inquiry step.
  [
    "latestRetreatInquiry",
    () => latestRetreatInquiry("p1"),
    "inquiries",
    [["select", "id, status, metadata"], ["eq", "person_id", "p1"], ["eq", "type", "retreat"], ["order", "created_at", NEWEST], ["limit", 1], ["maybeSingle"]],
  ],
  [
    "markInquiryWon",
    () => markInquiryWon("i1", { order_id: "o1" }),
    "inquiries",
    [["update", { status: "won", metadata: { order_id: "o1" } }], ["eq", "id", "i1"], ["neq", "status", "won"]],
  ],
];

describe("deal, lead, pipeline and inquiry questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
