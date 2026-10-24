import { describe, expect, it } from "vitest";

// SR.2.3. Pages in the global search, as the approved prototype shows them
// (https://claude.ai/artifact/CsTNGcjhg3oqFKW6dKHk3H): this deployment's own
// navigation, ranked by name, then group and path, each page held to its own
// declared permission before it is ranked. Tested against the real navigation
// and permission registry, so the cases are the pages that ship.
import { ADMIN_NAV, TEAM_NAV } from "@/app/nav";
import { PERMISSIONS } from "@/app/permissions";
import type { AdminUser } from "@/kernel/identity/admin-auth";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import type { SearchActor } from "@/kernel/identity/search-actor";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { pagesContribution } from "@/kernel/shell/search-pages";

registerPermissionRegistry(PERMISSIONS);

const everything = { may: () => true };
const admin = (may: (p: string) => boolean = everything.may): SearchActor => ({
  surface: "admin",
  admin: { id: "u1", email: "a@x.test" } as AdminUser,
  access: { may },
});
const team = (may: (p: string) => boolean = everything.may): SearchActor => ({
  surface: "team",
  team: { personId: "p1", teamMemberId: "tm1", isAdmin: false } as TeamActor,
  access: { may },
});
const pages = pagesContribution({ admin: ADMIN_NAV, team: TEAM_NAV });
const titles = async (actor: SearchActor, terms: string[]) => (await pages.search(actor, terms, 5)).map((h) => h.title);

const DEPLOYMENT = process.env.EDGE8_DEPLOYMENT ?? "edge8";
const describeEdge8 = DEPLOYMENT === "edge8" ? describe : describe.skip;

describeEdge8("the Pages contribution", () => {
  it("answers on the admin and team surfaces, opening on each surface's home", () => {
    expect(pages.kind).toBe("page");
    expect(pages.opens).toEqual({ admin: "/admin", team: "/team" });
  });

  it("offers the time off pages for 'time off', as the prototype does", async () => {
    expect(await titles(admin(), ["time", "off"])).toEqual(["Time Off History", "Requests", "Policies"]);
    expect(await titles(team(), ["time", "off"])).toEqual(["Time Off"]);
  });

  it("shows where a page sits and links to it", async () => {
    const [hit] = await pages.search(team(), ["time", "off"], 5);
    expect(hit).toEqual({ id: "/team/time-off", title: "Time Off", detail: "My Work · /team/time-off", href: "/team/time-off" });
  });

  it("forgives a typo, and finds nothing for a page the surface does not have", async () => {
    expect(await titles(team(), ["payrol"])).toEqual(["Payroll"]);
    expect(await titles(admin(), ["payrol"])).toEqual([]);
  });

  it("never offers a page the person may not open, and fills the five from pages they may", async () => {
    const noTimeOff = (p: string) => p !== "time-off.manage";
    const shown = await titles(admin(noTimeOff), ["time", "off"]);
    expect(shown).not.toContain("Time Off History");
    expect(shown).not.toContain("Requests");
    expect(await titles(team((p) => p !== "time-off.mine"), ["time", "off"])).toEqual([]);
  });

  it("returns at most the limit, in rank order", async () => {
    const hits = await pages.search(admin(), ["cockpit"], 2);
    expect(hits).toHaveLength(2);
  });
});
