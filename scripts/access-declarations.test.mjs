import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ATOM, declarationsOf, holderGrants, parsePermissions, signedInRoutes, validateDeclarations } from "./access-declarations.mjs";
import { addedEntries, checkAccess } from "./check-access.mjs";
import { generate, renderPermissions } from "./gen-deployment.mjs";

// The access declaration (ADR 0013) is what every guard, sidebar row, search
// hit and assistant tool will read, so the rules it obeys are pinned here
// against fixture trees: an atom belongs to the entity that names it, a route or
// action may only point at an atom that exists, two owners never share a key,
// and a deployment without an entity has none of its atoms. The check on top
// is what makes "closed by default" a red build rather than a sentence.

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const KERNEL = `export const permissions: EntityPermissions = {
  permissions: {
    "surface.admin": "Enter the Admin view",
    "surface.team": "Enter the Team view",
    "surface.portal": "Enter the client portal",
  },
  holders: {
    "surface.admin": "admin",
    "surface.team": "team-member, contractor",
    "surface.portal": "client-user",
  },
  routes: {},
  actions: {},
  implies: {},
};
`;

/** A roles section, one block per bundle, or nothing when `roles` is absent. */
function rolesSection(roles) {
  if (roles === undefined) return [];
  const blocks = Object.entries(roles).map(([key, r]) =>
    [`    ${JSON.stringify(key)}: {`, ...Object.entries(r).map(([f, v]) => `      ${JSON.stringify(f)}: ${JSON.stringify(v)},`), "    },"].join("\n"),
  );
  return [blocks.length ? `  roles: {\n${blocks.join("\n")}\n  },` : "  roles: {},"];
}

function declaration({ permissions = {}, holders, roles, routes = {}, actions = {}, implies = {} }) {
  const held = holders ?? Object.fromEntries(Object.keys(permissions).map((k) => [k, "admin"]));
  const section = (name, entries) => {
    const lines = Object.entries(entries).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    return lines.length ? `  ${name}: {\n${lines.join("\n")}\n  },` : `  ${name}: {},`;
  };
  return [
    'import type { EntityPermissions } from "@/kernel/identity/permission-declaration";',
    "",
    "/** @generator */",
    "export const permissions: EntityPermissions = {",
    section("permissions", permissions),
    section("holders", held),
    ...rolesSection(roles),
    section("routes", routes),
    section("actions", actions),
    section("implies", implies),
    "};",
    "",
  ].join("\n");
}

/** A tree with a manifest, one deployment per entry, and the files given (path → body). */
function fixture(entities, deployments, files = {}, { overlay = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "access-"));
  temps.push(root);
  const manifest = {
    kernel: { target: "kernel", current: ["kernel"], tables: [] },
    entities: Object.fromEntries(
      Object.keys(entities).map((n) => [
        n,
        { target: `entities/${n}`, current: [`entities/${n}`], tables: [], portability: "portable", requires: [], ...entities[n] },
      ]),
    ),
  };
  const write = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  write("entities.manifest.json", JSON.stringify(manifest, null, 2));
  for (const [name, list] of Object.entries(deployments)) {
    write(`deployments/${name}.json`, JSON.stringify({ name, entities: list }, null, 2));
  }
  write("kernel/identity/permissions.ts", KERNEL);
  for (const [rel, body] of Object.entries(files)) write(rel, body);
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  if (overlay) fs.mkdirSync(path.join(root, ".github/fork-overlay"), { recursive: true });
  return { root, manifest };
}

const PAGE = "export default function Page() { return null; }\n";
const ACTIONS = '"use server";\nexport async function moveCard() {}\nexport async function createBoard() {}\n';

/** A boards entity with two admin pages, a team page, a sign-in page and one action file. */
function boardsTree(decl, extra = {}) {
  return {
    "entities/boards/routes/admin/(dashboard)/boards/page.tsx": PAGE,
    "entities/boards/routes/admin/(dashboard)/edges/workboard/page.tsx": PAGE,
    "entities/boards/routes/team/(dashboard)/my-week/page.tsx": PAGE,
    "entities/boards/routes/admin/(auth)/login/page.tsx": PAGE,
    "entities/boards/lib/move-card.ts": ACTIONS,
    "entities/boards/permissions.ts": declaration(decl),
    ...extra,
  };
}

const BOARDS = {
  permissions: { "boards.open": "Open the Workboard", "boards.manage": "Create and configure boards" },
  routes: {
    "routes/admin/(dashboard)/boards/page": "boards.manage",
    "routes/admin/(dashboard)/edges/workboard/page": "boards.open",
    "routes/team/(dashboard)/my-week/page": "surface.team",
    "routes/admin/(auth)/login/page": "public",
  },
  actions: { "lib/move-card": "boards.open", "lib/move-card#createBoard": "boards.manage" },
  implies: {},
};

describe("parsePermissions", () => {
  it("reads every section of the declaration format, empty sections included", () => {
    const parsed = parsePermissions(declaration(BOARDS));
    expect(parsed.problems).toEqual([]);
    expect(parsed.permissions).toEqual(BOARDS.permissions);
    expect(parsed.holders).toEqual({ "boards.open": "admin", "boards.manage": "admin" });
    expect(parsed.routes).toEqual(BOARDS.routes);
    expect(parsed.actions).toEqual(BOARDS.actions);
    expect(parsed.implies).toEqual({});
  });

  it("refuses a line it cannot read rather than skipping it, so a reformatted file fails loudly", () => {
    const src = declaration(BOARDS).replace(
      '    "boards.open": "Open the Workboard",',
      '    "boards.open":\n      "Open the Workboard",',
    );
    expect(parsePermissions(src).problems.join(" ")).toMatch(/not in the declaration format/);
  });

  it("refuses a file without the declaration at all", () => {
    expect(parsePermissions("export const x = 1;\n").problems.join(" ")).toMatch(/no `export const permissions/);
  });

  it("allows comments between entries, which is where a declaration explains itself", () => {
    const src = declaration(BOARDS).replace(
      '    "boards.open": "Open the Workboard",',
      '    // Every board, read only.\n    "boards.open": "Open the Workboard",',
    );
    expect(parsePermissions(src).problems).toEqual([]);
  });
});

describe("validateDeclarations", () => {
  const validate = (files, entities = { contacts: {}, boards: {} }) => {
    const { root, manifest } = fixture(entities, { edge8: Object.keys(entities) }, files);
    return validateDeclarations(root, declarationsOf(root, manifest, new Set(Object.keys(entities))));
  };

  it("passes a declaration whose routes and actions all point at atoms that exist", () => {
    expect(validate(boardsTree(BOARDS))).toEqual([]);
  });

  it("refuses an atom that does not start with its owner's name", () => {
    const problems = validate(boardsTree({ ...BOARDS, permissions: { ...BOARDS.permissions, "cards.move": "Move cards" } }));
    expect(problems.join(" ")).toMatch(/boards: atom "cards\.move" must start with "boards\."/);
  });

  it("refuses an entity declaring an atom the kernel owns", () => {
    const tree = boardsTree(BOARDS);
    tree["entities/contacts/permissions.ts"] = declaration({ permissions: { "surface.team": "Again" } });
    expect(validate(tree).join(" ")).toMatch(/"surface\.team" is declared by both kernel and contacts/);
  });

  it("refuses a kernel atom named in an installed entity's namespace, so ownership reads off the key", () => {
    const { root, manifest } = fixture({ contacts: {}, boards: {} }, { edge8: ["contacts", "boards"] }, boardsTree(BOARDS));
    fs.writeFileSync(path.join(root, "kernel/identity/permissions.ts"), KERNEL.replace('"surface.portal": "Enter the client portal",', '"surface.portal": "Enter the client portal",\n    "boards.archive": "Archive any board",').replace('"surface.portal": "client-user",', '"surface.portal": "client-user",\n    "boards.archive": "admin",'));
    const problems = validateDeclarations(root, declarationsOf(root, manifest, new Set(["contacts", "boards"])), Object.keys(manifest.entities));
    expect(problems.join(" ")).toMatch(/kernel: atom "boards\.archive" uses the boards entity's namespace/);
  });

  // AE.1: an atom that differs between seeing and controlling is a pair.
  // Holding manage reaches view (kernel/identity/access-model.ts), so a manage
  // with no view would imply an atom nobody declares.
  it("passes a view and manage pair, each with its own holders", () => {
    const permissions = { ...BOARDS.permissions, "boards.settings.view": "See board settings", "boards.settings.manage": "Change board settings" };
    const holders = { "boards.open": "admin", "boards.manage": "admin", "boards.settings.view": "team-member", "boards.settings.manage": "admin" };
    expect(validate(boardsTree({ ...BOARDS, permissions, holders }))).toEqual([]);
  });

  it("refuses a manage atom whose view is not declared", () => {
    const permissions = { ...BOARDS.permissions, "boards.settings.manage": "Change board settings" };
    expect(validate(boardsTree({ ...BOARDS, permissions })).join(" ")).toMatch(
      /boards: atom "boards\.settings\.manage" has no "boards\.settings\.view" — a manage atom implies its view/,
    );
  });

  it("refuses a third part other than view or manage", () => {
    const permissions = { ...BOARDS.permissions, "boards.settings.edit": "Edit board settings" };
    expect(validate(boardsTree({ ...BOARDS, permissions })).join(" ")).toMatch(/atom "boards\.settings\.edit" is not of the form/);
  });

  it("refuses a route that names an atom nobody declares", () => {
    const routes = { ...BOARDS.routes, "routes/admin/(dashboard)/boards/page": "boards.delete" };
    expect(validate(boardsTree({ ...BOARDS, routes })).join(" ")).toMatch(/boards\/page names "boards\.delete", which no one declares/);
  });

  it("refuses a route that names another entity's atom, so no entity decides another's visibility", () => {
    const tree = boardsTree({ ...BOARDS, routes: { ...BOARDS.routes, "routes/team/(dashboard)/my-week/page": "contacts.read" } });
    tree["entities/contacts/permissions.ts"] = declaration({ permissions: { "contacts.read": "Read contacts" } });
    expect(validate(tree).join(" ")).toMatch(/my-week\/page names "contacts\.read", which belongs to contacts/);
  });

  it("refuses a route that names another surface's enter permission", () => {
    const routes = { ...BOARDS.routes, "routes/team/(dashboard)/my-week/page": "surface.admin" };
    expect(validate(boardsTree({ ...BOARDS, routes })).join(" ")).toMatch(/a \/team route cannot require "surface\.admin"/);
  });

  it("refuses a route key that is not a page this entity has", () => {
    const routes = { ...BOARDS.routes, "routes/admin/(dashboard)/gone/page": "boards.open" };
    expect(validate(boardsTree({ ...BOARDS, routes })).join(" ")).toMatch(/gone\/page is not a page this entity has/);
  });

  it("refuses an action file that does not exist, or an export it does not have", () => {
    const actions = { ...BOARDS.actions, "lib/nope": "boards.open", "lib/move-card#deleteBoard": "boards.manage" };
    const problems = validate(boardsTree({ ...BOARDS, actions })).join(" ");
    expect(problems).toMatch(/lib\/nope is not a server-action file this entity has/);
    expect(problems).toMatch(/lib\/move-card has no export deleteBoard/);
  });

  it("refuses an action file that is not a server-action file", () => {
    const tree = boardsTree({ ...BOARDS, actions: { "lib/helper": "boards.open" } });
    tree["entities/boards/lib/helper.ts"] = "export function helper() {}\n";
    expect(validate(tree).join(" ")).toMatch(/lib\/helper is not a server-action file/);
  });

  it("refuses an action that names an atom nobody declares", () => {
    const actions = { ...BOARDS.actions, "lib/move-card": "boards.archive" };
    expect(validate(boardsTree({ ...BOARDS, actions })).join(" ")).toMatch(/action lib\/move-card names "boards\.archive", which no one declares/);
  });

  it("refuses two entities declaring one key, not only an entity against the kernel", () => {
    const tree = boardsTree(BOARDS);
    tree["entities/contacts/permissions.ts"] = declaration({ permissions: { "boards.open": "Open the Workboard too" } });
    expect(validate(tree).join(" ")).toMatch(/"boards\.open" is declared by both boards and contacts/);
  });

  it("refuses a declaration for a page that is not on a signed-in surface", () => {
    const tree = boardsTree({ ...BOARDS, routes: { ...BOARDS.routes, "routes/(site)/about/page": "boards.open" } });
    tree["entities/boards/routes/(site)/about/page.tsx"] = PAGE;
    expect(validate(tree).join(" ")).toMatch(/\(site\)\/about\/page is not a page this entity has on a signed-in surface/);
  });

  it("allows public only on a sign-in page under (auth), so a dashboard page cannot opt out", () => {
    const routes = { ...BOARDS.routes, "routes/admin/(dashboard)/boards/page": "public" };
    expect(validate(boardsTree({ ...BOARDS, routes })).join(" ")).toMatch(/boards\/page is public, but only a sign-in page under \(auth\) may be/);
  });

  it("accepts an export named in an export list, and refuses a name that is not an identifier", () => {
    const tree = boardsTree({ ...BOARDS, actions: { ...BOARDS.actions, "lib/listed#renamed": "boards.open", "lib/move-card#a.b": "boards.open" } });
    tree["entities/boards/lib/listed.ts"] = '"use server";\nasync function inner() {}\nexport { inner as renamed };\n';
    const problems = validate(tree).join(" ");
    expect(problems).not.toMatch(/lib\/listed has no export/);
    expect(problems).toMatch(/lib\/move-card has no export a\.b/);
  });

  it("requires every atom to name its default holders, and holders to name only offered atoms", () => {
    const problems = validate(boardsTree({ ...BOARDS, holders: { "boards.open": "admin", "boards.gone": "admin" } })).join(" ");
    expect(problems).toMatch(/atom "boards\.manage" names no default holders/);
    expect(problems).toMatch(/holders names "boards\.gone", which this declaration does not offer/);
  });

  it("reads each holder's scope, all for a bare role, and refuses an unknown scope or a role named twice", () => {
    expect(holderGrants("team-member:own, manager:team, admin")).toEqual([
      { role: "team-member", scope: "own" },
      { role: "manager", scope: "team" },
      { role: "admin", scope: "all" },
    ]);
    const problems = validate(boardsTree({ ...BOARDS, holders: { "boards.open": "admin:everyone", "boards.manage": "admin, admin:own" } })).join(" ");
    expect(problems).toMatch(/gives admin the scope "everyone"/);
    expect(problems).toMatch(/holders of "boards\.manage" names a role twice/);
  });

  it("drops a declared internal page the tree does not have, as the fork's staged tree does not", () => {
    const pocket = "routes/admin/(dashboard)/edges/workboard";
    const entities = { contacts: {}, boards: { internalPaths: [pocket] } };
    const tree = boardsTree(BOARDS);
    delete tree["entities/boards/routes/admin/(dashboard)/edges/workboard/page.tsx"];
    const { root, manifest } = fixture(entities, { edge8: ["contacts", "boards"] }, tree);
    const decls = declarationsOf(root, manifest, new Set(["contacts", "boards"]));
    expect(validateDeclarations(root, decls)).toEqual([]);
    expect(generate(root, "edge8", manifest)["app/permissions.ts"]).not.toContain('"/admin/edges/workboard"');
  });
});

// Role bundles (AE.2): an entity declares a role beside its atoms, naming any
// atom the deployment's kernel or entities declare. Three rules: an atom nobody
// declares fails the build, a bundle naming an atom this deployment does not
// install is left out of it, and the kernel's locked bundles keep whatever is
// installed and must agree with the default holders.
describe("role bundles", () => {
  const ACCOUNTANT = {
    accountant: { name: "Accountant", sentence: "Pays approved claims and keeps the books.", atoms: "surface.admin, boards.open, contacts.view:team" },
  };
  const CONTACTS = (roles) => ({
    "entities/contacts/permissions.ts": declaration({ permissions: { "contacts.view": "See contacts" }, roles }),
  });
  const tree = (roles) => ({ ...boardsTree(BOARDS), ...CONTACTS(roles) });
  const registryOf = (files, deployment = "edge8") => {
    const { root, manifest } = fixture(
      { contacts: {}, boards: {} },
      { edge8: ["contacts", "boards"], small: ["contacts"] },
      files,
    );
    return generate(root, deployment, manifest)["app/permissions.ts"];
  };

  it("parses a roles section into one block per bundle, and leaves it out of the result when the file has none", () => {
    const parsed = parsePermissions(declaration({ permissions: { "contacts.view": "See contacts" }, roles: ACCOUNTANT }));
    expect(parsed.problems).toEqual([]);
    expect(parsed.roles).toEqual(ACCOUNTANT);
    expect("roles" in parsePermissions(declaration(BOARDS))).toBe(false);
  });

  it("refuses a bundle missing a field, or carrying one it does not know", () => {
    const missing = declaration({ permissions: { "contacts.view": "x" }, roles: { accountant: { name: "Accountant", atoms: "contacts.view" } } });
    expect(parsePermissions(missing).problems.join(" ")).toMatch(/role "accountant" has no "sentence"/);
    const extra = declaration({ permissions: { "contacts.view": "x" }, roles: { accountant: { ...ACCOUNTANT.accountant, colour: "red" } } });
    expect(parsePermissions(extra).problems.join(" ")).toMatch(/has a field "colour"/);
  });

  it("emits a bundle naming another entity's atom and a kernel atom, with each atom's scope", () => {
    const out = registryOf(tree(ACCOUNTANT));
    expect(out).toContain(
      '"accountant": { owner: "contacts", name: "Accountant", sentence: "Pays approved claims and keeps the books.", locked: false, atoms: [{ permission: "surface.admin", scope: "all" }, { permission: "boards.open", scope: "all" }, { permission: "contacts.view", scope: "team" }] },',
    );
  });

  it("fails the build when a bundle names an atom no entity and not the kernel declares", () => {
    const roles = { accountant: { ...ACCOUNTANT.accountant, atoms: "surface.admin, boards.opne" } };
    expect(() => registryOf(tree(roles))).toThrow(/role "accountant" names "boards.opne", which no entity or the kernel declares/);
  });

  it("fails the build for an unknown atom even in a deployment that would leave the bundle out", () => {
    const roles = { accountant: { ...ACCOUNTANT.accountant, atoms: "boards.open, nobody.here" } };
    expect(() => registryOf(tree(roles), "small")).toThrow(/nobody\.here/);
  });

  it("leaves a bundle out of a deployment that does not install one of its atoms, and says so", () => {
    const small = registryOf(tree(ACCOUNTANT), "small");
    expect(small).not.toContain('"accountant": {');
    expect(small).toContain("// Left out: accountant (contacts) names boards.open, which this deployment does not install.");
    expect(registryOf(tree(ACCOUNTANT))).toContain('"accountant": {');
  });

  it("treats an atom of a catalogued entity this tree does not have as not installed, as the public fork is staged", () => {
    const files = { ...CONTACTS({ accountant: { ...ACCOUNTANT.accountant, atoms: "contacts.view, hiring.ats" } }) };
    const { root, manifest } = fixture({ contacts: {}, hiring: {} }, { edge8: ["contacts"] }, files);
    expect(generate(root, "edge8", manifest)["app/permissions.ts"]).toContain("// Left out: accountant (contacts) names hiring.ats");
  });

  it("refuses two declarations bundling the same key, and a bundle that is also an implied role", () => {
    const { root, manifest } = fixture({ contacts: {}, boards: {} }, { edge8: ["contacts", "boards"] }, {
      ...boardsTree({ ...BOARDS, roles: ACCOUNTANT }),
      ...CONTACTS(ACCOUNTANT),
    });
    expect(validateDeclarations(root, declarationsOf(root, manifest, new Set(["contacts", "boards"]))).join(" ")).toMatch(
      /role "accountant" is bundled by both boards and contacts/,
    );
    const implied = { ...BOARDS, roles: { coach: { name: "Coach", sentence: "Coaches.", atoms: "boards.open" } }, implies: { coach: "coaches someone" } };
    const second = fixture({ boards: {} }, { edge8: ["boards"] }, boardsTree(implied));
    expect(validateDeclarations(second.root, declarationsOf(second.root, second.manifest, new Set(["boards"]))).join(" ")).toMatch(
      /role "coach" is bundled and also implied/,
    );
  });

  it("refuses a scope that does not exist and an atom named twice", () => {
    const roles = { accountant: { ...ACCOUNTANT.accountant, atoms: "boards.open:most, boards.open" } };
    const { root, manifest } = fixture({ contacts: {}, boards: {} }, { edge8: ["contacts", "boards"] }, tree(roles));
    const problems = validateDeclarations(root, declarationsOf(root, manifest, new Set(["contacts", "boards"]))).join(" ");
    expect(problems).toMatch(/holds boards\.open at "most"/);
    expect(problems).toMatch(/names an atom twice/);
  });

  describe("the kernel's locked bundles", () => {
    const kernelWith = (adminAtoms) =>
      KERNEL.replace(
        "  routes: {},",
        `  roles: {\n    "admin": {\n      "name": "Admin",\n      "sentence": "Runs the Admin view.",\n      "atoms": ${JSON.stringify(adminAtoms)},\n    },\n  },\n  routes: {},`,
      );

    it("are kept in a deployment that lacks some of their atoms, with only the installed ones", () => {
      const files = { ...boardsTree(BOARDS), ...CONTACTS(), "kernel/identity/permissions.ts": kernelWith("surface.admin, boards.open, boards.manage, contacts.view") };
      const small = registryOf(files, "small");
      expect(small).toContain(
        '"admin": { owner: "kernel", name: "Admin", sentence: "Runs the Admin view.", locked: true, atoms: [{ permission: "surface.admin", scope: "all" }, { permission: "contacts.view", scope: "all" }] },',
      );
    });

    it("fail the build when the holders give Admin an atom the bundle does not list", () => {
      const files = { ...boardsTree(BOARDS), ...CONTACTS(), "kernel/identity/permissions.ts": kernelWith("surface.admin, boards.open, contacts.view") };
      expect(() => registryOf(files)).toThrow(/holders give admin boards\.manage:all, which the admin bundle does not list/);
    });

    it("fail the build when the bundle lists an atom no holders entry gives Admin, or at another scope", () => {
      const holders = { "contacts.view": "admin:team" };
      const files = {
        ...boardsTree(BOARDS),
        "entities/contacts/permissions.ts": declaration({ permissions: { "contacts.view": "See contacts" }, holders }),
        "kernel/identity/permissions.ts": kernelWith("surface.admin, boards.open, boards.manage, contacts.view"),
      };
      expect(() => registryOf(files)).toThrow(/the admin bundle lists contacts\.view:all, which no holders entry gives admin/);
    });
  });
});

describe("the baseline only shrinks", () => {
  it("calls an entry the committed baseline lacks an addition", () => {
    expect(addedEntries(["a", "b", "c"], ["a", "b"])).toEqual(["c"]);
    expect(addedEntries(["a"], ["a", "b"])).toEqual([]);
  });

  it("finds no additions when there is no committed baseline to compare with", () => {
    expect(addedEntries(["a", "b"], null)).toEqual([]);
  });
});

describe("the generated registry", () => {
  it("emits every installed atom with its owner, and each route under its URL", () => {
    const { root, manifest } = fixture({ contacts: {}, boards: {} }, { edge8: ["contacts", "boards"] }, boardsTree(BOARDS));
    const out = generate(root, "edge8", manifest)["app/permissions.ts"];
    expect(out).toContain('"boards.open": { owner: "boards", sentence: "Open the Workboard", holders: [{ role: "admin", scope: "all" }] },');
    expect(out).toContain('"surface.team": { owner: "kernel", sentence: "Enter the Team view", holders: [{ role: "team-member", scope: "all" }, { role: "contractor", scope: "all" }] },');
    expect(out).toContain('"/admin/boards": "boards.manage",');
    expect(out).toContain('"/team/my-week": "surface.team",');
    expect(out).toContain('"/admin/login": "public",');
    expect(out).toContain('"entities/boards/lib/move-card#createBoard": "boards.manage",');
  });

  it("leaves out the atoms of an entity the deployment does not install", () => {
    const { root, manifest } = fixture(
      { contacts: {}, boards: {} },
      { edge8: ["contacts", "boards"], small: ["contacts"] },
      boardsTree(BOARDS),
    );
    const small = generate(root, "small", manifest)["app/permissions.ts"];
    expect(small).not.toContain("boards.");
    expect(small).toContain('"surface.admin": { owner: "kernel"');
  });

  it("refuses to generate from an invalid declaration, so check:generated goes red", () => {
    const routes = { ...BOARDS.routes, "routes/admin/(dashboard)/boards/page": "boards.delete" };
    const { root, manifest } = fixture({ contacts: {}, boards: {} }, { edge8: ["contacts", "boards"] }, boardsTree({ ...BOARDS, routes }));
    expect(() => generate(root, "edge8", manifest)).toThrow(/boards\.delete/);
  });

  it("emits a well-formed registry for a deployment with no entity declarations", () => {
    expect(renderPermissions({ atoms: [], routes: [], actions: [], implies: [] }, "minimal")).toMatch(
      /export const PERMISSIONS: PermissionRegistry = \{/,
    );
  });
});

// The parser reads text and TypeScript compiles the same file: if the two ever
// disagree, the registry would grant what the type checker never saw. Each real
// declaration is therefore parsed and imported, and the two must be equal.
describe("the real declarations", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const pairs = [
    ["kernel/identity/permissions.ts", () => import("../kernel/identity/permissions.ts")],
    ["entities/boards/permissions.ts", () => import("../entities/boards/permissions.ts")],
  ];

  for (const [file, load] of pairs) {
    it(`reads ${file} exactly as TypeScript compiles it`, async () => {
      const parsed = parsePermissions(fs.readFileSync(path.join(root, file), "utf8"));
      expect(parsed.problems).toEqual([]);
      const { permissions } = await load();
      const { problems: _problems, ...sections } = parsed;
      expect(sections).toEqual(permissions);
    });
  }

  it("compose into the committed registry, with Open the Workboard in it", async () => {
    const { PERMISSIONS } = await import("../app/permissions.ts");
    expect(PERMISSIONS.atoms["boards.open"]).toEqual({
      owner: "boards",
      sentence: expect.stringMatching(/^Open the Workboard/),
      holders: [{ role: "admin", scope: "all" }],
    });
    // Contractors keep the whole Team view until AC.19 decides otherwise.
    expect(PERMISSIONS.atoms["surface.team"].holders.map((h) => h.role)).toEqual(["team-member", "contractor"]);
    expect(PERMISSIONS.routes["/admin/edges/workboard"]).toBe("boards.open");
    // Every route and action names an atom the registry has, or "public" for a page.
    for (const atom of Object.values(PERMISSIONS.routes)) expect(atom === "public" || atom in PERMISSIONS.atoms).toBe(true);
    for (const atom of Object.values(PERMISSIONS.actions)) expect(atom in PERMISSIONS.atoms).toBe(true);
  });
});

describe("check-access", () => {
  const run = (decl, baseline, opts) => {
    const { root, manifest } = fixture({ contacts: {}, boards: {} }, { edge8: ["contacts", "boards"] }, boardsTree(decl), opts);
    return checkAccess({ root, manifest, deployment: "edge8", baseline });
  };

  it("lists the signed-in pages only: Admin, Team and Portal, not the public site", () => {
    const { root, manifest } = fixture(
      { contacts: {}, boards: {}, site: {} },
      { edge8: ["contacts", "boards", "site"] },
      { ...boardsTree(BOARDS), "entities/site/routes/(site)/about/page.tsx": PAGE },
    );
    const routes = signedInRoutes(root, manifest, new Set(["contacts", "boards", "site"])).map((r) => r.appPath);
    expect(routes).toContain("app/admin/(dashboard)/boards/page.tsx");
    expect(routes).not.toContain("app/(site)/about/page.tsx");
  });

  it("passes when every signed-in page is declared", () => {
    expect(run(BOARDS, [])).toMatchObject({ undeclared: [], stale: [], problems: [] });
  });

  it("fails a page that is neither declared nor on the baseline", () => {
    const routes = { ...BOARDS.routes };
    delete routes["routes/admin/(dashboard)/edges/workboard/page"];
    expect(run({ ...BOARDS, routes }, []).undeclared).toEqual(["app/admin/(dashboard)/edges/workboard/page.tsx"]);
  });

  it("passes an undeclared page the baseline still carries", () => {
    const routes = { ...BOARDS.routes };
    delete routes["routes/admin/(dashboard)/edges/workboard/page"];
    expect(run({ ...BOARDS, routes }, ["app/admin/(dashboard)/edges/workboard/page.tsx"])).toMatchObject({ undeclared: [], stale: [] });
  });

  it("calls a baseline entry stale once its page is declared, so the baseline only shrinks", () => {
    expect(run(BOARDS, ["app/admin/(dashboard)/boards/page.tsx"]).stale).toEqual(["app/admin/(dashboard)/boards/page.tsx"]);
  });

  it("calls an entry for a page that no longer exists stale upstream, but not in the fork that lacks it", () => {
    const gone = ["app/admin/(dashboard)/removed/page.tsx"];
    expect(run(BOARDS, gone).stale).toEqual(gone);
    expect(run(BOARDS, gone, { overlay: false }).stale).toEqual([]);
  });

  it("reports an invalid declaration as a problem, not a pass", () => {
    const routes = { ...BOARDS.routes, "routes/admin/(dashboard)/boards/page": "boards.delete" };
    expect(run({ ...BOARDS, routes }, []).problems.join(" ")).toMatch(/boards\.delete/);
  });
});

// A layout never runs on a POST, so an action's declaration is the only rule it
// has above its own guard: an action file with none fails like a page.
describe("check-access, server actions", () => {
  const MOVE = "entities/boards/lib/move-card.ts";
  const run = (decl, actionBaseline, extra = {}, publicActions = new Set()) => {
    const { root, manifest } = fixture({ contacts: {}, boards: {} }, { edge8: ["contacts", "boards"] }, boardsTree(decl, extra));
    return checkAccess({ root, manifest, deployment: "edge8", baseline: [], actionBaseline, publicActions });
  };

  it("passes when every server-action file is declared", () => {
    expect(run(BOARDS, [])).toMatchObject({ actions: 1, undeclaredActions: [], staleActions: [] });
  });

  it("fails an action file that is neither declared nor on the baseline", () => {
    expect(run({ ...BOARDS, actions: {} }, []).undeclaredActions).toEqual([MOVE]);
  });

  it("does not count an override of one export as declaring the whole file", () => {
    expect(run({ ...BOARDS, actions: { "lib/move-card#createBoard": "boards.manage" } }, []).undeclaredActions).toEqual([MOVE]);
  });

  it("passes an undeclared action file the baseline still carries, and calls it stale once declared", () => {
    expect(run({ ...BOARDS, actions: {} }, [MOVE])).toMatchObject({ undeclaredActions: [], staleActions: [] });
    expect(run(BOARDS, [MOVE]).staleActions).toEqual([MOVE]);
  });

  it("leaves out a file whose every export is public, and holds one with a single guarded export to the rule", () => {
    const login = "entities/boards/routes/admin/(auth)/login/actions.ts";
    const body = '"use server";\nexport async function requestLink() {}\nexport async function signOut() {}\n';
    const both = new Set([`${login} requestLink`, `${login} signOut`]);
    expect(run(BOARDS, [], { [login]: body }, both).undeclaredActions).toEqual([]);
    expect(run(BOARDS, [], { [login]: body }, new Set([`${login} requestLink`])).undeclaredActions).toEqual([login]);
  });

  it("does not count a test file, or a module without the directive", () => {
    const extra = { "entities/boards/lib/move-card.test.ts": '"use server";\nexport async function x() {}\n', "entities/boards/lib/helpers.ts": "export function y() {}\n" };
    expect(run(BOARDS, [], extra)).toMatchObject({ actions: 1, undeclaredActions: [] });
  });
});

// The facts only an entity can read are registered at boot; a registry that is
// generated but never registered is the silent failure the event bus once had.
describe("the access facts registry", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("imports only the entities whose server door exports accessContributions", async () => {
    const { accessContributingEntities, renderAccess } = await import("./gen-deployment.mjs");
    const { root: fx, manifest } = fixture({ contacts: {}, boards: {}, coaching: {} }, { edge8: ["contacts", "boards", "coaching"] }, {
      "entities/coaching/index.ts": 'export { accessContributions } from "./lib/access-contributions";\n',
      "entities/boards/index.ts": "export const other = 1;\n",
    });
    expect(accessContributingEntities(fx, manifest, new Set(["contacts", "boards", "coaching"]))).toEqual(["coaching"]);
    expect(renderAccess([], "minimal")).toContain("registerAccessContributions([]);");
    // The kernel reads the deployment's registry through the same call (it may not import app/).
    expect(renderAccess([], "minimal")).toContain("registerPermissionRegistry(PERMISSIONS);");
  });

  it("is registered from instrumentation.ts, on the Node runtime, next to the event subscribers", () => {
    const src = fs.readFileSync(path.join(root, "instrumentation.ts"), "utf8");
    const node = src.slice(src.indexOf('if (process.env.NEXT_RUNTIME === "nodejs") {'));
    expect(node).toMatch(/await import\("@\/app\/access"\);\s*registerAccess\(\);/);
  });

  it("registers coaching's and the team hub's facts in the edge8 build", () => {
    const access = fs.readFileSync(path.join(root, "app/access.ts"), "utf8");
    expect(access).toContain('import { accessContributions as coachingAccess } from "@/entities/coaching";');
    expect(access).toContain('import { accessContributions as teamAccess } from "@/entities/team";');
  });
});

describe("ATOM", () => {
  // The kernel's PERMISSION_ATOM is the shape the app checks at run time
  // (kernel/approvals refuses any other string before it reaches a filter);
  // this script cannot import TypeScript when node runs it, so it keeps its
  // own copy, pinned here to the kernel's.
  it("is the kernel's PERMISSION_ATOM, character for character", async () => {
    const { PERMISSION_ATOM } = await import("../kernel/identity/permission-declaration.ts");
    expect(ATOM.source).toBe(PERMISSION_ATOM.source);
    expect(ATOM.flags).toBe(PERMISSION_ATOM.flags);
  });
});
