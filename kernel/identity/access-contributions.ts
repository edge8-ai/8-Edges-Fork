// The facts about a person that the kernel may not read itself (ADR 0013).
//
// Some roles follow a fact only an entity can see: Coach follows a
// coaching_profiles row, Hiring manager an open requisition. Some scopes reach
// ids only an entity can list: a coach's `team` includes their coachees, and
// `clients` is the companies a person is assigned to. The kernel may import no
// entity, so each owning entity exports its contributions from its server door
// and the composition root registers them at boot (app/access.ts, called from
// instrumentation.ts), the way it registers event subscribers.
//
// The store is keyed on globalThis with Symbol.for, as the event bus is: Next
// gives instrumentation, routes and actions their own copy of each module, and a
// module-scope array would be empty in all but the one that registered it. And
// unlike the bus, nothing registered is an error, not an empty answer: a
// registration that never ran must refuse the request, never quietly take
// everyone's Coach role away.
import type { RoleHolding } from "@/kernel/identity/access-model";

/** Who a fact is about. */
export type AccessSubject = {
  readonly personId: string;
  /** The person's live team_members.id, or null for someone not on the team. */
  readonly teamMemberId: string | null;
  readonly isAdmin: boolean;
};

/** A role a fact gives: `holds` reads the fact, and throws when it cannot. */
export type Implier = {
  readonly role: string;
  readonly because: string;
  holds(subject: AccessSubject): Promise<boolean>;
};

/** Ids a scope reaches beyond the kernel's own (direct reports): coachees for team, clients for clients. */
export type ReachProvider = {
  readonly scope: "team" | "clients";
  ids(subject: AccessSubject): Promise<readonly string[]>;
};

/** What one entity contributes. */
export type AccessContributions = {
  readonly impliers?: readonly Implier[];
  readonly reach?: readonly ReachProvider[];
};

type Store = { registered: boolean; impliers: Implier[]; reach: ReachProvider[] };

const STORE = Symbol.for("edge8.kernel.identity.access-contributions");
const processGlobal = globalThis as typeof globalThis & { [STORE]?: Store };

function store(): Store {
  return (processGlobal[STORE] ??= { registered: false, impliers: [], reach: [] });
}

function registered(): Store {
  const s = store();
  if (!s.registered) {
    throw new Error("access contributions are not registered: instrumentation.ts must call registerAccess() before a request");
  }
  return s;
}

/** Throws unless the composition root has registered the contributions, even an empty list. */
export function assertRegistered(): void {
  registered();
}

/** Replaces whatever was registered: Next may run registration more than once per process. */
export function registerAccessContributions(list: readonly AccessContributions[]): void {
  const s = store();
  s.impliers = list.flatMap((c) => [...(c.impliers ?? [])]);
  s.reach = list.flatMap((c) => [...(c.reach ?? [])]);
  s.registered = true;
}

/** Tests only: back to the unregistered state. */
export function resetAccessContributions(): void {
  processGlobal[STORE] = { registered: false, impliers: [], reach: [] };
}

/** Every role a registered fact gives this person, with the fact as its reason. A failed read throws. */
export async function impliedRoles(subject: AccessSubject): Promise<RoleHolding[]> {
  const { impliers } = registered();
  const held = await Promise.all(impliers.map((i) => i.holds(subject)));
  return impliers.filter((_, n) => held[n]).map((i) => ({ role: i.role, because: i.because }));
}

/** Every id the registered providers add to a scope for this person, without repeats. A failed read throws. */
export async function reachIds(subject: AccessSubject, scope: "team" | "clients"): Promise<string[]> {
  const providers = registered().reach.filter((p) => p.scope === scope);
  const lists = await Promise.all(providers.map((p) => p.ids(subject)));
  return [...new Set(lists.flat())];
}
