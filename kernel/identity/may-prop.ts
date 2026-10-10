// The `may` prop convention for client components (ADR 0014). Types and a pure
// function only, so it is safe on either side of the client boundary.
//
// A client component cannot ask the resolver, so the server parent that
// already holds the access object (the layout's, or the page's
// requirePermission answer) asks it once for the atoms the component's
// controls need and passes the answers down as `may`. The component renders a
// control only when `may[atom]` is true. Hiding is courtesy, so a manager who
// may view a page never sees a button that would refuse them; the action's own
// guard is the rule and still refuses. scripts/check-access-may.mjs fails a
// client component that imports a server action and does not take a MayProp.
//
//   // server parent
//   <CampaignEditor may={mayProp(access, ["marketing.campaigns.manage"])} />
//   // client component
//   export function CampaignEditor({ may }: { may: MayProp }) {
//     return may["marketing.campaigns.manage"] ? <button …>Publish</button> : null;
//   }
import type { Access, Target } from "@/kernel/identity/access-model";

/** What the viewer may do, for the atoms a client component's controls need: atom → held. */
export type MayProp = Readonly<Record<string, boolean>>;

/**
 * The `may` prop for `atoms`: each atom the component names, answered by the
 * access object the server already holds. An atom not named reads as
 * undefined in the component, which hides its control, so a missing entry
 * fails closed. With a target, each atom's reach must cover that person or
 * company, as the action's own scoped check will ask: a control shown for a
 * page about one client is one its action will not refuse for that client.
 */
export function mayProp(access: Pick<Access, "may"> | null | undefined, atoms: readonly string[], target?: Target): MayProp {
  return Object.fromEntries(atoms.map((atom) => [atom, access?.may(atom, target) ?? false]));
}
