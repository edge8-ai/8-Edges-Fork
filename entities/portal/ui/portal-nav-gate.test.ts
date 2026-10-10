// The portal's entitlement rule, pinned. The bug this exists for is real: after
// the nav rows became per-entity contributions (RS-14), rows a client was not
// entitled to were dropped from the sidebar instead of muted, so a client who
// had not bought Invoices saw a portal with a hole in it rather than a portal
// with a row waiting to light up. The difference is one `filter` versus one
// `map`, it typechecks either way, and nothing but a test can tell them apart.
import { describe, expect, it } from "vitest";
import type { NavSection } from "@/kernel/shell/nav";
import { entitlementKeys, gateByEntitlement } from "./portal-nav-gate";

// The shape app/nav.ts composes: the five gated rows the design doc names,
// plus the two rows every portal member gets regardless.
const SECTIONS: NavSection[] = [
  {
    section: null,
    groups: [
      {
        label: "Company",
        items: [
          { label: "Home", href: "/portal", ico: "\u25cb", enabled: true },
          { label: "Requests", href: "/portal/requests", ico: "\u25cb", enabled: true },
          { label: "Team", href: "/portal/team", ico: "\u25cb", enabled: true, when: "team" },
          { label: "Invoices", href: "/portal/invoices", ico: "\u25cb", enabled: true, when: "invoices" },
          { label: "Users", href: "/portal/users", ico: "\u25cb", enabled: true, when: "users" },
          { label: "Company Profile", href: "/portal/company", ico: "\u25cb", enabled: true, when: "companyProfile" },
        ],
      },
      {
        label: "Delivery",
        items: [
          { label: "Board", href: "/portal/board", ico: "\u25cb", enabled: true, when: "board" },
          { label: "Roadmap", href: "/portal/roadmap", ico: "\u25cb", enabled: true, when: "roadmap" },
        ],
      },
    ],
  },
];

const NOTHING = {
  team: false,
  timeOff: false,
  invoices: false,
  users: false,
  companyProfile: false,
  meetings: false,
  board: false,
  roadmap: false,
  tokens: false,
};
const EVERYTHING = Object.fromEntries(Object.keys(NOTHING).map((k) => [k, true]));

const rows = (groups: ReturnType<typeof gateByEntitlement>) =>
  groups.flatMap((g) => g.items.map((i) => ("label" in i ? i.label : "")));
const live = (groups: ReturnType<typeof gateByEntitlement>) =>
  groups.flatMap((g) => g.items.filter((i) => "enabled" in i && i.enabled).map((i) => ("label" in i ? i.label : "")));

describe("the portal entitlement gate", () => {
  it("keeps every row for a client entitled to nothing, muting rather than dropping", () => {
    const gated = gateByEntitlement(SECTIONS, entitlementKeys(NOTHING));
    expect(rows(gated)).toEqual([
      "Home",
      "Requests",
      "Team",
      "Invoices",
      "Users",
      "Company Profile",
      "Board",
      "Roadmap",
    ]);
    // Only the two ungated rows stay live; the shell still looks complete.
    expect(live(gated)).toEqual(["Home", "Requests"]);
  });

  it("lights every row up for a client entitled to everything", () => {
    const gated = gateByEntitlement(SECTIONS, entitlementKeys(EVERYTHING));
    expect(live(gated)).toEqual(rows(gated));
  });

  it("lights exactly the rows the client holds, and no neighbour", () => {
    const gated = gateByEntitlement(SECTIONS, entitlementKeys({ ...NOTHING, invoices: true, board: true }));
    expect(live(gated)).toEqual(["Home", "Requests", "Invoices", "Board"]);
  });

  it("keeps Users and Company Profile for an admin and mutes them for a contributor", () => {
    // `users` and `companyProfile` both follow adminCompanyScope, so a
    // contributor holds neither and an admin holds both.
    const admin = live(gateByEntitlement(SECTIONS, entitlementKeys({ ...NOTHING, users: true, companyProfile: true })));
    expect(admin).toContain("Users");
    expect(admin).toContain("Company Profile");
    const contributor = live(gateByEntitlement(SECTIONS, entitlementKeys(NOTHING)));
    expect(contributor).not.toContain("Users");
    expect(contributor).not.toContain("Company Profile");
  });

  it("never invents a row the deployment did not install", () => {
    // A key held but never contributed must not conjure a row: the entity list
    // decides which rows exist, the entitlements only decide which are live.
    const gated = gateByEntitlement(SECTIONS, entitlementKeys({ ...EVERYTHING, timeOff: true, tokens: true }));
    expect(rows(gated)).not.toContain("Time Off");
    expect(rows(gated)).not.toContain("Tokens");
  });

  it("reads a row with no `when` as open to every member", () => {
    expect(live(gateByEntitlement(SECTIONS, new Set()))).toEqual(["Home", "Requests"]);
  });
});
