import { describe, expect, it } from "vitest";
import { audienceRulesSchema, matchAudience, relationshipOf, type AudienceFacts } from "./audiences";

// A small world: a team member, a client contact, a prospect by deal, a
// prospect by company, and a network contact who carries a tag.
const facts: AudienceFacts = {
  people: [
    { id: "team", isTeam: true },
    { id: "client", isTeam: false },
    { id: "deal", isTeam: false },
    { id: "atProspectCo", isTeam: false },
    { id: "student", isTeam: false },
  ],
  currentClientIds: new Set(["clientCo"]),
  links: [
    { personId: "client", companyId: "clientCo" },
    { personId: "atProspectCo", companyId: "prospectCo" },
    { personId: "student", companyId: "clientCo2" },
    { personId: "team", companyId: "clientCo" },
  ],
  openDeals: [
    { personId: "deal", companyId: null },
    { personId: null, companyId: "prospectCo" },
  ],
  tagsByPerson: new Map([
    ["student", new Set(["labs"])],
    ["client", new Set(["labs", "vip"])],
  ]),
};

const rules = (r: object) => audienceRulesSchema.parse(r);

describe("relationshipOf", () => {
  it("ranks team over client, client over prospect, prospect over network", () => {
    expect(relationshipOf("team", true, facts)).toBe("team");
    expect(relationshipOf("client", false, facts)).toBe("client");
    expect(relationshipOf("deal", false, facts)).toBe("prospect");
    expect(relationshipOf("atProspectCo", false, facts)).toBe("prospect");
    expect(relationshipOf("student", false, facts)).toBe("network");
  });
});

describe("matchAudience", () => {
  it("with no rules is everyone loaded", () => {
    expect(matchAudience(rules({}), facts)).toHaveLength(5);
  });

  it("matches any listed relationship", () => {
    expect(matchAudience(rules({ relationships: ["client", "prospect"] }), facts)).toEqual(["client", "deal", "atProspectCo"]);
  });

  it("ANDs a tag with a company", () => {
    expect(matchAudience(rules({ tagIds: [uuid("labs")], companyIds: [] }), withUuidTags())).toEqual(["client", "student"]);
    expect(
      matchAudience(rules({ tagIds: [uuid("labs")], companyIds: [uuid("clientCo")] }), withUuidTags()),
    ).toEqual(["client"]);
  });

  it("removes anyone carrying an excluded tag", () => {
    expect(matchAudience(rules({ tagIds: [uuid("labs")], excludeTagIds: [uuid("vip")] }), withUuidTags())).toEqual(["student"]);
  });
});

// The schema wants uuids; map the readable ids above onto stable fake ones.
function uuid(name: string): string {
  const hex = Buffer.from(name).toString("hex").padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${hex}`;
}
function withUuidTags(): AudienceFacts {
  return {
    ...facts,
    links: facts.links.map((l) => ({ ...l, companyId: uuid(l.companyId) })),
    currentClientIds: new Set([...facts.currentClientIds].map(uuid)),
    openDeals: facts.openDeals.map((d) => ({ ...d, companyId: d.companyId ? uuid(d.companyId) : null })),
    tagsByPerson: new Map([...facts.tagsByPerson].map(([p, tags]) => [p, new Set([...tags].map(uuid))])),
  };
}
