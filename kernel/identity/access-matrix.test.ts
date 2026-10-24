import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildAccess, type AccessFacts } from "@/kernel/identity/access";
import { registerAccessContributions, resetAccessContributions } from "@/kernel/identity/access-contributions";
import type { RolePermission, Scope } from "@/kernel/identity/access-model";

// AC.5: the resolver itself, over every signed-in page, for every kind of person
// who signs in today. Each persona's facts go through buildAccess with the
// permission source access:sync will write (each atom's declared default
// holders), and the answer must equal who passes the page's code gates today.
// scripts/access-today.test.mjs checks the declarations against the code; this
// checks that the resolver, the entities' facts and the declarations together
// give the same answer. Only the database read is left out.

type Today = { compareWithToday: unknown; PERSONAS: Record<string, string[]> };

const root = path.resolve(__dirname, "../..");

afterEach(() => resetAccessContributions());

/** The facts each persona's registers hold, and the entity facts registered for them. */
function personaFacts(roles: readonly string[]): { facts: AccessFacts; implied: string[] } {
  const onTeam = roles.includes("team-member") || roles.includes("contractor");
  return {
    facts: {
      personId: "p-1",
      teamMemberId: onTeam ? "tm-1" : null,
      isAdmin: roles.includes("admin"),
      isSuperAdmin: roles.includes("super-admin"),
      employmentType: roles.includes("contractor") ? "contract" : onTeam ? "full_time" : null,
      directReportPersonIds: roles.includes("manager") ? ["p-report"] : [],
      isApprover: roles.includes("approver"),
      isPortalMember: roles.includes("client-user"),
      portalCompanyIds: roles.includes("client-user") ? ["c-acme"] : [],
      // Revenue is a grant since AE.3, as every role an admin hands out is.
      assignedRoles: roles.includes("revenue") ? [{ role: "revenue", because: "was granted it" }] : [],
    },
    // Coach and Hiring manager come from the entities, as they will at runtime.
    implied: roles.filter((r) => r === "coach" || r === "hiring-manager"),
  };
}

describe("the resolver against today", () => {
  it("gives every persona exactly the signed-in pages today's code gates give them", async () => {
    const { loadManifest } = await import(path.join(root, "scripts/entity-manifest.mjs"));
    const { declarationsOf, holderGrants, signedInRoutes, PUBLIC, SURFACE_ENTER } = await import(path.join(root, "scripts/access-declarations.mjs"));
    const { chainOf, gatesIn, passes, PERSONAS } = (await import(path.join(root, "scripts/access-today.mjs"))) as Today & {
      chainOf: (root: string, target: string, key: string) => string[];
      gatesIn: (src: string) => string[];
      passes: (gate: string, roles: string[], holders: Map<string, string[]>) => boolean;
    };
    const fs = await import("node:fs");
    const { readTodayBaseline } = await import(path.join(root, "scripts/access-today.mjs"));
    const baseline = readTodayBaseline(root) as { pages?: Record<string, string[]> } | null;

    const manifest = loadManifest(root);
    const included = new Set(Object.keys(manifest.entities));
    const declarations = declarationsOf(root, manifest, included) as {
      owner: string;
      holders: Record<string, string>;
      routes: Record<string, string>;
    }[];
    // The rows access:sync writes: every atom's declared default holders.
    const rows: RolePermission[] = declarations.flatMap((d) =>
      Object.entries(d.holders).flatMap(([permission, value]) =>
        (holderGrants(value) as { role: string; scope: Scope }[]).map((g) => ({ role: g.role, permission, scope: g.scope })),
      ),
    );
    const source = async (roles: readonly string[]) => rows.filter((r) => roles.includes(r.role));
    const holderRoles = new Map<string, string[]>();
    for (const r of rows) holderRoles.set(r.permission, [...(holderRoles.get(r.permission) ?? []), r.role]);
    const atomOf = new Map(declarations.flatMap((d) => Object.entries(d.routes).map(([k, a]) => [`${d.owner} ${k}`, a] as const)));

    const disagreements: string[] = [];
    for (const [persona, roles] of Object.entries(PERSONAS)) {
      const { facts, implied } = personaFacts(roles);
      registerAccessContributions([
        { impliers: implied.map((role) => ({ role, because: "test", holds: async () => true })) },
      ]);
      const access = await buildAccess(facts, source);
      for (const route of signedInRoutes(root, manifest, included) as { entity: string; key: string; appPath: string }[]) {
        const atom = atomOf.get(`${route.entity} ${route.key}`);
        if (!atom) continue;
        const surface = /^routes\/(admin|team|portal)\//.exec(route.key)![1] as keyof typeof SURFACE_ENTER;
        const resolved = atom === PUBLIC || (access.may(SURFACE_ENTER[surface]) && access.may(atom));
        // Today is the frozen record (scripts/access-today-baseline.json) for a
        // page it knows, and the page's own gates otherwise.
        const recorded = baseline?.pages?.[route.appPath] as string[] | undefined;
        const gates = chainOf(root, manifest.entities[route.entity].target, route.key).flatMap((f) => gatesIn(fs.readFileSync(f, "utf8")));
        const today = recorded ? recorded.includes(persona) : gates.every((g) => passes(g, roles, holderRoles));
        if (resolved !== today) disagreements.push(`${route.appPath} ${persona}: today ${today}, resolver ${resolved}`);
      }
      resetAccessContributions();
    }
    // The listed differences (scripts/access-today.mjs INTENDED_DIFFERENCES)
    // are the only ones, and each only refuses.
    const { isIntended } = (await import(path.join(root, "scripts/access-today.mjs"))) as { isIntended: (p: string, persona: string) => boolean };
    const unexpected = disagreements.filter((d) => !isIntended(d.split(" ")[0], d.split(" ")[1].replace(/:$/, "")));
    expect(unexpected).toEqual([]);
    for (const d of disagreements) expect(d).toMatch(/today true, resolver false$/);
  });
});
