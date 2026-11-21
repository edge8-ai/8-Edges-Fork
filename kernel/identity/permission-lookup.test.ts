import { describe, expect, it } from "vitest";

import { mayOpenPath, permissionForPath } from "@/kernel/identity/permission-lookup";

// A sidebar row links to a URL; the registry keys pages by URL pattern. This is
// the one place the two meet, so a row can be shown only to someone who may
// open the page it points at.
const routes = {
  "/team/workboard": "surface.team",
  "/team/directory": "team.directory",
  "/team/clients/[companyId]": "team.clients",
  "/team/coaching/[profileId]": "coaching.roster",
  "/team/login": "public",
};

describe("permissionForPath", () => {
  it("finds a page's permission by its exact path, ignoring the query", () => {
    expect(permissionForPath(routes, "/team/directory")).toBe("team.directory");
    expect(permissionForPath(routes, "/team/workboard?view=calendar")).toBe("surface.team");
  });

  it("matches a route parameter to one path segment, never more", () => {
    expect(permissionForPath(routes, "/team/clients/c-123")).toBe("team.clients");
    expect(permissionForPath(routes, "/team/clients/c-123/roadmap")).toBeNull();
  });

  it("prefers the exact page over a pattern", () => {
    expect(permissionForPath({ ...routes, "/team/coaching/new": "team.directory" }, "/team/coaching/new")).toBe("team.directory");
  });

  it("is null for a path no declaration names", () => {
    expect(permissionForPath(routes, "/team/nowhere")).toBeNull();
  });
});

describe("mayOpenPath", () => {
  const holds = (...held: string[]) => (p: string) => held.includes(p);

  it("opens a page whose permission the person holds, and refuses one they lack", () => {
    expect(mayOpenPath(routes, holds("team.clients"), "/team/clients/c-1")).toBe(true);
    expect(mayOpenPath(routes, holds("surface.team"), "/team/clients/c-1")).toBe(false);
  });

  it("reads an absolute URL by its path", () => {
    expect(mayOpenPath(routes, holds("team.directory"), "https://edge8.test/team/directory?x=1")).toBe(true);
    expect(mayOpenPath(routes, holds(), "https://edge8.test/team/directory")).toBe(false);
  });

  it("is closed by default: an undeclared page, or no link at all, is refused even to someone holding everything", () => {
    const everything = () => true;
    expect(mayOpenPath(routes, everything, "/team/nowhere")).toBe(false);
    expect(mayOpenPath(routes, everything, null)).toBe(false);
    expect(mayOpenPath(routes, everything, "")).toBe(false);
  });

  it("opens a public page to anyone", () => {
    expect(mayOpenPath(routes, holds(), "/team/login")).toBe(true);
  });
});
