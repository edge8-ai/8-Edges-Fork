// What an invite from Settings → Access will do, decided from its inputs and
// the facts the server read (AE.4). Pure: the drawer's "What will happen" box
// and the send action both call invitePlan with the same inputs, so the box
// cannot promise something Send then does differently, and a refusal shown
// inline is the same refusal Send returns before it writes anything.
//
// Also the two shapes the drawer offers, built from the deployment's access
// registry rather than a list in the UI: the declared role bundles, and the
// atoms a temp or advisor's custom shape is composed from.
import { EMPLOYMENT_TYPE_LABEL, type EmploymentType } from "@/kernel/identity/employment-types";
import type { PermissionRegistry } from "@/kernel/identity/permission-declaration";
import { granteeRefusal, SUPER_ADMIN_GRANTEE_REFUSAL } from "@/kernel/identity/access-grants";

/** The types whose Team baseline makes a person an employee: the only ones Super Admin may go to. */
const EMPLOYEE_TYPES: ReadonlySet<string> = new Set(["full_time", "part_time", "intern"]);
/** The types that imply nothing, so the invite itself must give them something (the spec's temp and advisor). */
export const NO_BASELINE_TYPES: ReadonlySet<string> = new Set(["temp", "advisor"]);

export const SUPER_ADMIN_REFUSAL = SUPER_ADMIN_GRANTEE_REFUSAL;
export const NOTHING_CHOSEN_REFUSAL = "A temp or advisor holds nothing by default: pick at least one role or shape their access.";
export const NOTHING_OPENS = "Nothing opens yet: pick at least one role.";

export type Baseline = "team" | "contractor" | "none";

export function baselineOf(type: string): Baseline {
  if (type === "contract") return "contractor";
  return EMPLOYEE_TYPES.has(type) ? "team" : "none";
}

const BASELINE_WORDS: Record<Baseline, string> = {
  team: "the Team member baseline",
  contractor: "the Contractor baseline",
  none: "no baseline",
};

export type LoginState = "none" | "invited" | "signed-in";

/** What the server read before planning: who the email already is, and the declared bundles. */
export type InviteFacts = {
  /** The People record the email matches, or null when the invite creates one. */
  person: {
    name: string;
    /** The live team member row's employment type, or null when they are not on the team. */
    employmentType: string | null;
    login: LoginState;
  } | null;
  /** Each declared bundle by key: its name, its atoms, and whether its access_roles row exists yet. */
  bundles: Readonly<Record<string, { name: string; atoms: readonly string[]; seeded: boolean }>>;
  /** The atoms an /admin page or action needs: holding one means entering the Admin view. */
  adminSide: ReadonlySet<string>;
  /** The atoms a /team page or action needs and no /admin one does. */
  teamSide: ReadonlySet<string>;
  inviterName: string;
  linkLifetimeHours: number;
  /** The role keys the matched person already holds by a live grant. */
  heldRoleKeys: ReadonlySet<string>;
  /** Whether a role already has the key the custom shape's name would take. */
  customNameTaken: boolean;
};

export type InviteChoice = {
  fullName: string;
  employmentType: EmploymentType;
  roleKeys: readonly string[];
  /** The custom shape's atoms, for a temp or advisor only. */
  customAtoms: readonly string[];
};

export type Landing = "admin" | "team" | null;

export type InvitePlan = {
  /** The lines of "What will happen when you send", in order. */
  steps: string[];
  landing: Landing;
  /** Why Send is disabled, or null when it may go. */
  refusal: string | null;
  /** The custom role's atoms with the surface it needs added, empty when there is no custom shape. */
  customAtoms: string[];
  customRoleName: string | null;
};

/** The one-person role a custom shape becomes, named after the person (spec: "<Full name> (<type>)"). */
export function customRoleName(fullName: string, type: EmploymentType): string {
  return `${fullName.trim()} (${EMPLOYMENT_TYPE_LABEL[type]})`;
}

/**
 * The custom shape with the surface it needs: an atom an /admin page asks for
 * is useless without entering the Admin view, so surface.admin comes with it;
 * likewise surface.team for a Team-only atom, since a temp or advisor has no
 * Team baseline to enter by.
 */
export function withSurfaces(atoms: readonly string[], adminSide: ReadonlySet<string>, teamSide: ReadonlySet<string>): string[] {
  const out = new Set(atoms.filter((a) => !a.startsWith("surface.")));
  if (out.size === 0) return [];
  if ([...out].some((a) => adminSide.has(a))) out.add("surface.admin");
  if ([...out].some((a) => teamSide.has(a))) out.add("surface.team");
  return [...out].sort();
}

export function invitePlan(choice: InviteChoice, facts: InviteFacts): InvitePlan {
  const steps: string[] = [];
  const refusals: string[] = [];
  const name = facts.person?.name ?? (choice.fullName.trim() || "them");
  // A person already on the team keeps the type their record has: the invite
  // does not change an employment record, so the rules read that type.
  const type = facts.person?.employmentType ?? choice.employmentType;
  const typeLabel = EMPLOYMENT_TYPE_LABEL[type as EmploymentType] ?? type;
  const baseline = baselineOf(type);

  steps.push(facts.person ? `Reuse ${name}'s record in People.` : `Create ${name} in People (source: access invite).`);
  steps.push(
    facts.person?.employmentType
      ? `Already on the team as ${typeLabel}, which gives ${BASELINE_WORDS[baseline]}; the invite leaves the type as it is.`
      : `Add them to the team as ${typeLabel}, which gives ${BASELINE_WORDS[baseline]}.`,
  );

  const custom = NO_BASELINE_TYPES.has(type) ? withSurfaces(choice.customAtoms, facts.adminSide, facts.teamSide) : [];
  if (choice.customAtoms.length > 0 && !NO_BASELINE_TYPES.has(type)) refusals.push("A custom shape is only for a temp or advisor; pick roles instead.");
  const roleName = custom.length > 0 ? customRoleName(name, type as EmploymentType) : null;
  if (roleName && facts.customNameTaken) refusals.push(`A role called "${roleName}" already exists; edit it on the Roles tab and grant it there.`);
  if (roleName) steps.push(`Create the one-person role "${roleName}" holding ${custom.length} permission${custom.length === 1 ? "" : "s"}, and grant it.`);

  const atoms = new Set<string>(custom);
  for (const key of choice.roleKeys) {
    const bundle = facts.bundles[key];
    if (!bundle) {
      refusals.push(`No role called ${key} can be granted.`);
      continue;
    }
    if (!bundle.seeded) refusals.push(`${bundle.name} has not been set up in this database yet (npm run access:sync).`);
    if (facts.heldRoleKeys.has(key)) refusals.push(`${name} already holds ${bundle.name}; untick it.`);
    bundle.atoms.forEach((a) => atoms.add(a));
    steps.push(`Grant ${bundle.name}.`);
  }
  // The grant helper's rule (granteeRefusal), by the employment type the person will have.
  if (choice.roleKeys.includes("super-admin") && granteeRefusal("super-admin", { employmentTypes: [type] })) refusals.push(SUPER_ADMIN_REFUSAL);
  if (NO_BASELINE_TYPES.has(type) && choice.roleKeys.length === 0 && custom.length === 0) refusals.push(NOTHING_CHOSEN_REFUSAL);

  const landing: Landing = atoms.has("surface.admin") ? "admin" : baseline !== "none" || atoms.has("surface.team") ? "team" : null;
  const view = landing === "admin" ? "the Admin view" : "the Team view";
  const login = facts.person?.login ?? "none";
  if (landing) {
    steps.push(
      login === "signed-in"
        ? `Email them a sign-in link from ${facts.inviterName}: they already have a login.`
        : `Email them an invitation from ${facts.inviterName} to set a password; the link works for ${facts.linkLifetimeHours} hours.`,
    );
    steps.push(`They land on ${view}.`);
  } else {
    steps.push(NOTHING_OPENS);
    if (refusals.length === 0) refusals.push(NOTHING_OPENS);
  }
  return { steps, landing, refusal: refusals[0] ?? null, customAtoms: custom, customRoleName: roleName };
}

/** One declared bundle as the drawer offers it. */
export type BundleOption = { key: string; name: string; sentence: string; owner: string; opens: string; locked: boolean };

export function bundleOptions(registry: Pick<PermissionRegistry, "roles">): BundleOption[] {
  return Object.entries(registry.roles)
    .map(([key, r]) => {
      const atoms = r.atoms.map((a) => a.permission);
      const opens = atoms.includes("surface.admin")
        ? "Opens the Admin view."
        : atoms.includes("surface.team")
          ? "Opens the Team view."
          : "Adds to the view their other roles open.";
      return { key, name: r.name, sentence: r.sentence, owner: r.owner, opens, locked: r.locked };
    })
    .sort((a, b) => Number(a.locked) - Number(b.locked) || a.name.localeCompare(b.name));
}

/** A live granted role as the database holds it: what a row-only role (Revenue, a one-person role) offers. */
export type GrantedRoleRow = { key: string; name: string; description: string; permissions: readonly string[] };

const opensFor = (atoms: readonly string[], adminSide: ReadonlySet<string>): string =>
  atoms.includes("surface.admin") || atoms.some((a) => adminSide.has(a))
    ? "Opens the Admin view."
    : atoms.includes("surface.team")
      ? "Opens the Team view."
      : "Adds to the view their other roles open.";

/**
 * The drawer's role cards: every declared bundle with its declaration's
 * sentence and owner, then every live granted role that exists only as a row,
 * with its description, owner "granted", and the view its permissions open.
 * One card per key; the locked Admin and Super Admin come last.
 */
export function mergeBundleOptions(declared: readonly BundleOption[], rows: readonly GrantedRoleRow[], adminSide: ReadonlySet<string>): BundleOption[] {
  const keys = new Set(declared.map((b) => b.key));
  const rowOnly = rows
    .filter((r) => !keys.has(r.key))
    .map((r) => ({ key: r.key, name: r.name, sentence: r.description, owner: "granted", opens: opensFor(r.permissions, adminSide), locked: false }));
  return [...declared, ...rowOnly].sort((a, b) => Number(a.locked) - Number(b.locked) || a.name.localeCompare(b.name));
}

/** The sides of the house each atom belongs to, read from which pages and actions need it. */
export function atomSides(registry: Pick<PermissionRegistry, "routes" | "actions">): { adminSide: Set<string>; teamSide: Set<string> } {
  const admin = new Set<string>();
  const team = new Set<string>();
  const add = (where: string, atom: string) => {
    if (where.startsWith("/admin") || where.includes("/routes/admin/")) admin.add(atom);
    else if (where.startsWith("/team") || where.includes("/routes/team/")) team.add(atom);
  };
  for (const [route, atom] of Object.entries(registry.routes)) add(route, atom);
  for (const [action, atom] of Object.entries(registry.actions)) add(action, atom);
  // A manage atom reaches its view, so it opens wherever the view is needed.
  for (const set of [admin, team]) {
    for (const atom of [...set]) if (atom.endsWith(".view")) set.add(`${atom.slice(0, -".view".length)}.manage`);
  }
  for (const atom of admin) team.delete(atom);
  return { adminSide: admin, teamSide: team };
}

/** Atoms that need a second look before a temp or advisor holds them. */
const WARNED: Record<string, string> = {
  "people.pay": "Sensitive: pay and bank details.",
  "people.identity": "Sensitive: personal records and identity documents.",
  "assistant.query": "The assistant reads the whole database to answer.",
};

/** Words a module or atom key spells in capitals. */
const ACRONYMS: Record<string, string> = { os: "OS", crm: "CRM", ats: "ATS", ai: "AI", hr: "HR" };
const humanise = (key: string): string =>
  key
    .split("-")
    .map((w) => ACRONYMS[w] ?? w)
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());

/** A module's name for a header: "company-os" → "Company OS", "crm" → "CRM". */
export function moduleLabel(owner: string): string {
  return owner
    .split("-")
    .map((w) => ACRONYMS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** An atom's short name, from its last segment: "boards.open" → "Open"; a pair's base "reimbursements.claims" → "Claims". */
export function atomLabel(key: string): string {
  return humanise(key.slice(key.indexOf(".") + 1).replace(/\./g, "-"));
}

/** One row of the custom shape: a view/manage pair, or one atom held or not. */
export type ShapeRow = { key: string; label: string; sentence: string; pair: boolean; warning: string | null };
export type ShapeGroup = { owner: string; label: string; rows: ShapeRow[] };

export function shapeGroups(registry: Pick<PermissionRegistry, "atoms">): ShapeGroup[] {
  const groups = new Map<string, ShapeRow[]>();
  const keys = Object.keys(registry.atoms);
  for (const key of keys.sort()) {
    if (key.startsWith("surface.")) continue;
    const atom = registry.atoms[key];
    let row: ShapeRow;
    if (key.endsWith(".manage") && keys.includes(`${key.slice(0, -".manage".length)}.view`)) continue;
    if (key.endsWith(".view") && keys.includes(`${key.slice(0, -".view".length)}.manage`)) {
      row = { key: key.slice(0, -".view".length), label: atomLabel(key.slice(0, -".view".length)), sentence: atom.sentence, pair: true, warning: null };
    } else {
      row = { key, label: atomLabel(key), sentence: atom.sentence, pair: false, warning: null };
    }
    row.warning = WARNED[key] ?? null;
    groups.set(atom.owner, [...(groups.get(atom.owner) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([owner, rows]) => ({ owner, label: moduleLabel(owner), rows }));
}

/** The atoms a shape's choices stand for: a pair row at View or Manage, a single row held. */
export type ShapeLevel = "off" | "view" | "manage" | "hold";
export function shapeAtoms(levels: Readonly<Record<string, ShapeLevel>>): string[] {
  const out: string[] = [];
  for (const [key, level] of Object.entries(levels)) {
    if (level === "view" || level === "manage") out.push(`${key}.${level}`);
    else if (level === "hold") out.push(key);
  }
  return out.sort();
}
