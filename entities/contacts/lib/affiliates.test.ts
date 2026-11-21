import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The affiliates questions and commands contacts' door answers (A.64). Each
// row is the query a caller in another entity built by hand before A.64.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  affiliateCodeDetailsOf,
  affiliateCodesOfCompany,
  affiliateCodesOfPeople,
  affiliateCodesOfPerson,
  affiliateCodesOfPersonOrCompanies,
  affiliateCodesStartingWith,
  affiliateHolders,
  affiliateRate,
  allAffiliates,
  createAffiliateCode,
  deactivateAffiliateCodesOf,
  reactivateAffiliateCode,
} from "./affiliates";

beforeEach(() => resetQueries());

const OLDEST_FIRST = { ascending: true };
const DETAILS = "id, code, program_type, active, stripe_coupon_id, created_at";

const reads: [string, () => Promise<unknown>, Step[]][] = [
  // crm activate a person / a company.
  ["affiliateCodesOfPerson", () => affiliateCodesOfPerson("p1"), [["select", "id, code, active"], ["eq", "person_id", "p1"]]],
  ["affiliateCodesOfCompany", () => affiliateCodesOfCompany("c1"), [["select", "id, code, active"], ["eq", "company_id", "c1"]]],
  // portal referrals: the person's codes and their companies'.
  [
    "affiliateCodesOfPersonOrCompanies (with companies)",
    () => affiliateCodesOfPersonOrCompanies("p1", ["c1", "c2"]),
    [["select", "id, code, active"], ["or", "person_id.eq.p1,company_id.in.(c1,c2)"]],
  ],
  [
    "affiliateCodesOfPersonOrCompanies (no companies)",
    () => affiliateCodesOfPersonOrCompanies("p1", []),
    [["select", "id, code, active"], ["or", "person_id.eq.p1"]],
  ],
  // crm company 360: the contacts' codes, and who referred the company.
  ["affiliateCodesOfPeople", () => affiliateCodesOfPeople(["p1"]), [["select", "person_id, code, active"], ["in", "person_id", ["p1"]]]],
  [
    "affiliateHolders",
    () => affiliateHolders(["a1"]),
    [["select", "code, people(display_name, preferred_name, full_name, email), companies(name)"], ["in", "id", ["a1"]]],
  ],
  // crm affiliate groups.
  [
    "allAffiliates",
    () => allAffiliates(),
    [
      [
        "select",
        "id, code, program_type, active, stripe_coupon_id, created_at, person_id, company_id, people(id, display_name, preferred_name, full_name, email, archived_at), companies(id, name, archived_at)",
      ],
      ["order", "created_at", OLDEST_FIRST],
    ],
  ],
  // crm affiliate 360, by company or by person.
  ["affiliateCodeDetailsOf (company)", () => affiliateCodeDetailsOf({ companyId: "c1" }), [["select", DETAILS], ["order", "created_at", OLDEST_FIRST], ["eq", "company_id", "c1"]]],
  ["affiliateCodeDetailsOf (person)", () => affiliateCodeDetailsOf({ personId: "p1" }), [["select", DETAILS], ["order", "created_at", OLDEST_FIRST], ["eq", "person_id", "p1"]]],
  // crm new-code collision check.
  ["affiliateCodesStartingWith", () => affiliateCodesStartingWith("ACME"), [["select", "code"], ["ilike", "code", "ACME%"]]],
  // billing fulfilment: the commission rate.
  ["affiliateRate", () => affiliateRate("a1"), [["select", "id, rate"], ["eq", "id", "a1"], ["maybeSingle"]]],
];

describe("affiliates questions (A.64)", () => {
  it.each(reads)("%s asks exactly what its callers asked", async (_name, ask, steps) => {
    await ask();
    expect(queries).toEqual([{ table: "affiliates", steps }]);
  });
});

describe("affiliates commands (A.64)", () => {
  it("createAffiliateCode inserts the row it is given", async () => {
    const row = { code: "ACME", company_id: "c1", program_type: "commission", rate: 0.1, active: true };
    await createAffiliateCode(row);
    expect(queries).toEqual([{ table: "affiliates", steps: [["insert", row]] }]);
  });

  it("reactivateAffiliateCode turns one code on, by id", async () => {
    await reactivateAffiliateCode("a1");
    const [query] = queries;
    expect(query.steps[0]).toEqual(["update", { active: true, updated_at: expect.any(String) }]);
    expect(query.steps.slice(1)).toEqual([["eq", "id", "a1"]]);
  });

  it.each([
    ["person", { personId: "p1" }, ["eq", "person_id", "p1"]],
    ["company", { companyId: "c1" }, ["eq", "company_id", "c1"]],
  ] as const)("deactivateAffiliateCodesOf a %s turns off only its active codes and answers their ids", async (_kind, holder, scope) => {
    await deactivateAffiliateCodesOf(holder);
    const [query] = queries;
    expect(query.table).toBe("affiliates");
    expect(query.steps[0]).toEqual(["update", { active: false, updated_at: expect.any(String) }]);
    expect(query.steps.slice(1)).toEqual([scope, ["eq", "active", true], ["select", "id"]]);
  });
});
