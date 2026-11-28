import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The person_companies questions and commands contacts' door answers (A.64).
// Each row is the query a caller in another entity built by hand before A.64,
// so a change here is a change in what that caller reads. The links decide
// which client contacts a person or a portal user is shown (the 2026-10-12
// incident, PR #2120), so every filter is pinned, and so is the absence of
// one: no question here filters archived or do-not-contact people.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  companiesOfPerson,
  companyIdsOfPerson,
  companyLinksOfPerson,
  contactIdsOfCompanies,
  contactLinkAt,
  contactLinksOfCompany,
  contactsOfCompanies,
  firstContactOfCompany,
  linkPersonToCompany,
  linkPersonToCompanyOnce,
  linkedPersonIdsAt,
  mainCompanyOfPerson,
  personCompanyLinkIds,
  personCompanyLinksPage,
  personCompanyTitle,
  primaryCompanyIdsOfPerson,
  primaryCompanyLinkOfPerson,
  setPersonCompanyTitle,
} from "./person-companies";

beforeEach(() => resetQueries());

const CONTACT_LINK =
  "person_id, company_id, title, role, is_primary, end_date, people:people!person_id(id, display_name, preferred_name, full_name, email, first_name, last_name, archived_at, do_not_contact)";
const PRIMARY_FIRST = { ascending: false };

const reads: [string, () => Promise<unknown>, Step[]][] = [
  // crm company 360, proposal and affiliate pickers, hub team (crm and team),
  // meeting-actions picker, org survey list, team assistant (both tools).
  ["contactLinksOfCompany", () => contactLinksOfCompany("c1"), [["select", CONTACT_LINK], ["eq", "company_id", "c1"]]],
  // crm inquiry chain: duplicates at the matched company.
  ["linkedPersonIdsAt", () => linkedPersonIdsAt("c1", ["p1", "p2"]), [["select", "person_id"], ["eq", "company_id", "c1"], ["in", "person_id", ["p1", "p2"]]]],
  // crm assume-as-client.
  [
    "firstContactOfCompany",
    () => firstContactOfCompany("c1"),
    [["select", "person_id"], ["eq", "company_id", "c1"], ["order", "is_primary", PRIMARY_FIRST], ["limit", 1], ["maybeSingle"]],
  ],
  // company-os: the client manager must be a contact at this client.
  ["contactLinkAt", () => contactLinkAt("c1", "p1"), [["select", "person_id"], ["eq", "company_id", "c1"], ["eq", "person_id", "p1"], ["maybeSingle"]]],
  // portal invite (portal users, crm portal-invite).
  ["personCompanyLinkIds", () => personCompanyLinkIds("p1", "c1"), [["select", "id"], ["eq", "person_id", "p1"], ["eq", "company_id", "c1"], ["limit", 1]]],
  // portal profile: the job title.
  [
    "personCompanyTitle",
    () => personCompanyTitle("p1", "c1"),
    [["select", "id, title"], ["eq", "person_id", "p1"], ["eq", "company_id", "c1"], ["limit", 1], ["maybeSingle"]],
  ],
  // crm affiliate list: primary contacts of several companies.
  [
    "contactsOfCompanies",
    () => contactsOfCompanies(["c1", "c2"]),
    [["select", "company_id, is_primary, people(id, email, archived_at)"], ["in", "company_id", ["c1", "c2"]]],
  ],
  // boards Workboard: who is linked where, nothing about the person.
  ["contactIdsOfCompanies", () => contactIdsOfCompanies(["c1"]), [["select", "person_id, company_id"], ["in", "company_id", ["c1"]]]],
  // crm lifecycle bump and inquiry chain context.
  ["companyIdsOfPerson", () => companyIdsOfPerson("p1"), [["select", "company_id"], ["eq", "person_id", "p1"]]],
  // portal referrals: companies the person is primary contact of.
  [
    "primaryCompanyIdsOfPerson",
    () => primaryCompanyIdsOfPerson("p1"),
    [["select", "company_id"], ["eq", "person_id", "p1"], ["eq", "is_primary", true], ["not", "company_id", "is", null]],
  ],
  // crm inquiry chain: does the person have a primary company yet.
  ["primaryCompanyLinkOfPerson", () => primaryCompanyLinkOfPerson("p1"), [["select", "id"], ["eq", "person_id", "p1"], ["eq", "is_primary", true], ["limit", 1]]],
  // crm affiliate portal access.
  [
    "mainCompanyOfPerson",
    () => mainCompanyOfPerson("p1"),
    [
      ["select", "company_id, is_primary"],
      ["eq", "person_id", "p1"],
      ["not", "company_id", "is", null],
      ["order", "is_primary", PRIMARY_FIRST],
      ["limit", 1],
      ["maybeSingle"],
    ],
  ],
  // assistant AI-journey prefill: no order, primary picked in code.
  ["companiesOfPerson", () => companiesOfPerson("p1"), [["select", "is_primary, companies(id, name, industry)"], ["eq", "person_id", "p1"]]],
  // crm contact 360.
  [
    "companyLinksOfPerson",
    () => companyLinksOfPerson("p1"),
    [["select", "company_id, title, role, is_primary, companies(id, name)"], ["eq", "person_id", "p1"], ["order", "is_primary", PRIMARY_FIRST]],
  ],
  // campaigns audience builder.
  ["personCompanyLinksPage", () => personCompanyLinksPage(0, 999), [["select", "person_id, company_id, end_date"], ["order", "id"], ["range", 0, 999]]],
];

describe("person_companies questions (A.64)", () => {
  it.each(reads)("%s asks exactly what its callers asked", async (_name, ask, steps) => {
    await ask();
    expect(queries).toEqual([{ table: "person_companies", steps }]);
  });
});

describe("person_companies commands (A.64)", () => {
  it("linkPersonToCompany inserts the pair in a role", async () => {
    await linkPersonToCompany("p1", "c1", "employee");
    expect(queries).toEqual([{ table: "person_companies", steps: [["insert", { person_id: "p1", company_id: "c1", role: "employee" }]] }]);
  });

  it("linkPersonToCompanyOnce upserts on the pair and ignores a second link", async () => {
    await linkPersonToCompanyOnce("p1", "c1", true);
    expect(queries).toEqual([
      {
        table: "person_companies",
        steps: [["upsert", { person_id: "p1", company_id: "c1", is_primary: true }, { onConflict: "person_id,company_id", ignoreDuplicates: true }]],
      },
    ]);
  });

  it("setPersonCompanyTitle writes the title and the time, on one link", async () => {
    await setPersonCompanyTitle("l1", "CTO");
    const [query] = queries;
    expect(query.table).toBe("person_companies");
    expect(query.steps[0][0]).toBe("update");
    expect(query.steps[0][1]).toEqual({ title: "CTO", updated_at: expect.any(String) });
    expect(query.steps.slice(1)).toEqual([["eq", "id", "l1"]]);
  });
});
