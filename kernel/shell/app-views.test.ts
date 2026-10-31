import { describe, expect, it } from "vitest";
import { appViews } from "./app-views";

// The apps the account menu switches between (TH.29), in one order everywhere,
// and only the ones this person may enter.
describe("the apps in the account menu", () => {
  it("lists Team, Admin then Client Hub for an admin, marking the one you are in", () => {
    const may = { team: true, admin: true, client: "/admin/client-hubs" };
    for (const here of ["team", "admin"] as const) {
      const views = appViews(here, may);
      expect(views.map((v) => v.key)).toEqual(["team", "admin", "client"]);
      expect(views.filter((v) => v.current).map((v) => v.key)).toEqual([here]);
    }
  });

  it("gives a member Team alone", () => {
    expect(appViews("team", { admin: false, client: null }).map((v) => v.key)).toEqual(["team"]);
  });

  it("gives a client the Client Hub alone, at their portal", () => {
    expect(appViews("client", {})).toEqual([{ key: "client", label: "Client Hub", href: "/portal", icon: "briefcase", current: true }]);
  });

  it("opens the Client Hub where the layout says, which for staff is the list of clients", () => {
    const hub = appViews("admin", { team: true, client: "/admin/client-hubs" }).find((v) => v.key === "client");
    expect(hub?.href).toBe("/admin/client-hubs");
  });

  it("leaves out an app you may not enter, and never the one you are in", () => {
    expect(appViews("team", { team: false, admin: false }).map((v) => v.key)).toEqual(["team"]);
    expect(appViews("admin", { team: false, admin: false }).map((v) => v.key)).toEqual(["admin"]);
  });

  it("links Team and Admin to their homes", () => {
    expect(appViews("team", { admin: true }).map((v) => v.href)).toEqual(["/team", "/admin"]);
  });
});
