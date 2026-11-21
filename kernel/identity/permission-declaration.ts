// The shape of an access declaration and of the registry composed from them
// (ADR 0013). Types and the atom's shape only, so it is safe on either side of
// the client boundary.
//
// Each entity declares, in `entities/<name>/permissions.ts`, the permissions it
// offers and which of its signed-in pages and server actions need which; the
// kernel declares its own atoms the same way in ./permissions.ts. Nothing
// imports a declaration: scripts/gen-deployment.mjs reads them as text and
// writes app/permissions.ts, and scripts/check-access.mjs fails a signed-in page
// that has none. The file format is therefore strict — one `"key": "value",`
// per line, sections in this order — and the parser refuses a line it cannot
// read rather than skipping it (scripts/access-declarations.mjs).

/**
 * The shape of a permission atom: `<owner>.<name>`, lower case, digits and
 * hyphens. The one copy the app reads (kernel/approvals refuses any other
 * string before it reaches a filter); scripts/access-declarations.mjs keeps its
 * own, because node runs it without TypeScript, and a test pins the two equal.
 */
export const PERMISSION_ATOM = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*(\.(view|manage))?$/;

/**
 * One entity's (or the kernel's) access declaration. Every section is a flat
 * map, one entry per line.
 */
export type EntityPermissions = {
  /**
   * The atoms this entity offers: `<entity>.<name>` → the plain sentence
   * Settings → Access shows ("Open the Workboard"). An atom belongs to the
   * entity that names it, and only that entity's pages and actions may require
   * it, so no entity decides another's visibility.
   */
  readonly permissions: Readonly<Record<string, string>>;
  /**
   * Each atom above → the roles that hold it on a fresh install, comma
   * separated, each with the scope it holds the atom at ("team-member:own,
   * manager:team, admin"; a bare role holds it at `all`). `npm run access:sync` writes a pair to the
   * database only the first time it is ever seen, so a pair someone revoked in
   * Settings → Access is never added back. Every atom names at least one.
   */
  readonly holders: Readonly<Record<string, string>>;
  /**
   * The role bundles this entity declares (AE.2): a role key → its name, the
   * sentence for what holding it means, and its atoms written like a holders
   * entry ("surface.admin, reimbursements.check, team.reviews:team"; a bare
   * atom is held at `all`). A bundle may name any atom the kernel or any entity
   * declares. An atom nobody declares fails the build; an entity's bundle naming
   * an atom this deployment does not install is left out of it. `npm run
   * access:sync` seeds a bundle as a granted role the first time it sees the
   * key and never touches a role that exists. Optional: an entity with no
   * bundle leaves the section out. The kernel's bundles are Admin and Super
   * Admin, locked on Settings → Access.
   */
  readonly roles?: Readonly<Record<string, RoleBundle>>;
  /**
   * A signed-in page, keyed by its path within the entity the way `mounts.ts`
   * keys it ("routes/team/(dashboard)/my-week/page") → the atom it needs: one of
   * this entity's, a kernel atom (`surface.team` for "every team member"), or
   * `public`, which only a sign-in page under a surface's `(auth)` group may be.
   */
  readonly routes: Readonly<Record<string, string>>;
  /**
   * A server-action file within the entity ("lib/move-card") → the atom every
   * export in it needs; "lib/sprint-actions#setCardSprint" overrides one export.
   * Never `public`: a public action is allowlisted with its reason instead.
   */
  readonly actions: Readonly<Record<string, string>>;
  /**
   * A role this entity's facts imply → the fact, in a sentence ("coaches at
   * least one person" implies Coach). The function that tests the fact is
   * registered through the entity's server door, not declared here.
   */
  readonly implies: Readonly<Record<string, string>>;
};

/** One declared role bundle, one line per field. */
export type RoleBundle = {
  readonly name: string;
  readonly sentence: string;
  /** Comma separated atoms, each optionally `:scope`. */
  readonly atoms: string;
};

/** The deployment's composed registry, generated into app/permissions.ts. */
export type PermissionRegistry = {
  /** Every atom installed, with the entity (or "kernel") that owns it and the roles that hold it by default. */
  readonly atoms: Readonly<
    Record<
      string,
      {
        readonly owner: string;
        readonly sentence: string;
        readonly holders: readonly { readonly role: string; readonly scope: "own" | "team" | "clients" | "all" }[];
      }
    >
  >;
  /** A signed-in page's URL pattern ("/admin/boards/[slug]") → its atom, or "public". */
  readonly routes: Readonly<Record<string, string>>;
  /** A server-action file's repository path, optionally "#export" → its atom. */
  readonly actions: Readonly<Record<string, string>>;
  /** A role key → every installed fact that implies it. */
  readonly implies: Readonly<Record<string, readonly { readonly owner: string; readonly because: string }[]>>;
  /**
   * A role key → the bundle this deployment seeds for it, with the atoms it
   * installs. `locked` marks the kernel's Admin and Super Admin, which Settings →
   * Access never edits.
   */
  readonly roles: Readonly<
    Record<
      string,
      {
        readonly owner: string;
        readonly name: string;
        readonly sentence: string;
        readonly locked: boolean;
        readonly atoms: readonly { readonly permission: string; readonly scope: "own" | "team" | "clients" | "all" }[];
      }
    >
  >;
};
