// <Can permission> for server trees (ADR 0014): renders its children only when
// the signed-in person holds the atom, at the reach a target needs, and the
// fallback (nothing by default) otherwise. Server-only: it asks the resolver,
// which caches its answer for the render, so many <Can>s on one page cost one
// resolve. A client component takes the `may` prop instead (may-prop.ts).
//
// Hiding is courtesy, so a manager who may view a page never sees a control
// that would refuse them. The guard at the top of the action is the rule, and
// nothing here replaces it.
import type { ReactNode } from "react";
import { getAccess } from "@/kernel/identity/access-request";
import type { Target } from "@/kernel/identity/access-model";

export async function Can({
  permission,
  target,
  children,
  fallback = null,
}: {
  permission: string;
  target?: Target;
  children: ReactNode;
  fallback?: ReactNode;
}): Promise<ReactNode> {
  const access = await getAccess();
  return access?.may(permission, target) ? children : fallback;
}
