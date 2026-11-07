import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The smaller questions and commands org's door answers (A.67): the handbook,
// the core values, the equipment register, the legal entities and the lead
// qualification. Each row is the query a caller in another entity built by hand
// before A.67, step for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import { coreValueTitles, coreValuesForScorecard, taggableCoreValues } from "./core-values-read";
import { equipmentCosts, fileEquipmentRequest } from "./equipment-requests";
import { handbookPagesMatching, handbookTitles } from "./handbook";
import { legalEntityCountries, redInvoiceBuyerEntity } from "./legal-entities";
import { savePersonQualification } from "./person-qualifications";

beforeEach(() => resetQueries());

const LIVE: Step = ["is", "archived_at", null];
const REQUEST = { person_id: "p1", type: "laptop", reason: "Mine broke", needed_by: null };
const QUALIFICATION = { person_id: "p1", goal: "Grow", plan: null, challenge: null, timeline: null, budget: null, authority: null };

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // team assistant searchHandbook, no query.
  ["handbookTitles", () => handbookTitles(), "company_information", [["select", "slug, title, category"], LIVE, ["order", "title"], ["limit", 200]]],
  // team assistant searchHandbook, two terms: each must match the title or the body.
  [
    "handbookPagesMatching",
    () => handbookPagesMatching(["leave", "policy"]),
    "company_information",
    [
      ["select", "slug, title, category, body, updated_at"],
      LIVE,
      ["or", "title.ilike.*leave*,body.ilike.*leave*"],
      ["or", "title.ilike.*policy*,body.ilike.*policy*"],
      ["order", "updated_at", { ascending: false }],
      ["limit", 5],
    ],
  ],
  // hiring interview scorecard.
  ["coreValuesForScorecard", () => coreValuesForScorecard(), "core_values", [["select", "title, description"], ["order", "sort_order", { ascending: true }]]],
  // coaching noticed sentences.
  ["coreValueTitles", () => coreValueTitles(["v1"]), "core_values", [["select", "id, title"], ["in", "id", ["v1"]]]],
  ["taggableCoreValues", () => taggableCoreValues(), "core_values", [["select", "id, title, sort_order"], ["order", "sort_order"]]],
  // company-os operations cockpit.
  ["equipmentCosts", () => equipmentCosts(), "equipment", [["select", "cost_vnd"]]],
  // team equipment request, through teamInsertOwn.
  ["fileEquipmentRequest", () => fileEquipmentRequest(REQUEST), "equipment_requests", [["insert", REQUEST], ["select", "id"], ["maybeSingle"]]],
  // reimbursements red invoice buyer.
  [
    "redInvoiceBuyerEntity",
    () => redInvoiceBuyerEntity(),
    "legal_entities",
    [
      ["select", "slug, name, legal_name, tax_id, registered_address"],
      ["eq", "base_currency", "vnd"],
      ["eq", "active", true],
      ["order", "slug"],
      ["limit", 1],
    ],
  ],
  // finance payroll.
  ["legalEntityCountries", () => legalEntityCountries(), "legal_entities", [["select", "id, country"]]],
  // crm saveQualification.
  [
    "savePersonQualification",
    () => savePersonQualification(QUALIFICATION),
    "person_qualifications",
    [["upsert", QUALIFICATION, { onConflict: "person_id" }]],
  ],
];

describe("org door questions and commands", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
