// The approvals inbox's rows (Z.2.1): everything pending that waits on one
// person, shaped for a list that says what each one is, who asked, whose
// decision it is and where it is decided.
//
// What waits on them is ./waiting's answer, unchanged: what names them, what
// names a permission they hold, and, for whoever enters the Admin view, what
// names nobody. This module only adds the words around each row. A link is the
// first page ./presentation names that the viewer may open, by the page's own
// declared permission (ADR 0013) and by the surface it sits on (the Admin and
// portal layouts refuse anyone without surface.admin or surface.portal), so a
// row is never a side door into a page their access does not reach.
//
// A row addressed to the viewer, or to a permission they hold, is listed even
// with no such page, because the list is the whole of what waits on them. A row
// that names nobody reaches whoever enters the Admin view only as the pool the
// admins decide from; it is listed only when the viewer may open the page it is
// decided on, as the admin home's "Waiting on you" does. Its label (a leave
// request carries the person's name, type and dates) is not for a role that
// cannot act on it. A failed read raises, as waitingOn does: an empty inbox
// must never be what a database hiccup says.
import { mayOpen } from "@/kernel/identity/may-open";
import { permissionForPath } from "@/kernel/identity/permission-lookup";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import type { Access } from "@/kernel/identity/access-model";
import { humanize } from "@/kernel/ui/format";
import { waitingOn, type WaitingApproval } from "./waiting";
import { APPROVAL_SUBJECTS, type ApprovalSubject } from "./vocabulary";
import { approvalFacts, askerFor, ctaFor, decideHrefs, tierChip, tierOf, type ApprovalFact, type ApprovalSurface, type ApprovalTier } from "./presentation";

export type InboxRow = {
  id: string;
  subjectType: ApprovalSubject;
  subjectId: string;
  /** The subject's word, the row's eyebrow. */
  subject: string;
  tier: ApprovalTier;
  tierChip: string;
  title: string;
  askedBy: string;
  createdAt: string;
  /** True when the row names this person; false when it waits on a role they hold. */
  namedOnMe: boolean;
  /** "You", or "Your role: <role>". */
  whose: string;
  href: string | null;
  cta: string;
  facts: ApprovalFact[];
};

type Viewer = Pick<Access, "may" | "permissions" | "roles">;

/**
 * The role a row addressed to `atom` reaches this viewer through: the first of
 * their roles the deployment's defaults give the atom, else the atom's own
 * sentence up to its first colon. The database may grant an atom through a role
 * the defaults do not name, which is why the sentence is the fallback.
 */
function roleWord(atom: string, viewer: Viewer): string {
  const declared = permissionRegistry().atoms[atom];
  const held = new Set(viewer.roles.map((r) => r.role));
  const role = declared?.holders.find((h) => held.has(h.role))?.role;
  if (role) return humanize(role);
  return declared?.sentence.split(":")[0] ?? atom;
}

// The surface atom a page's layout asks for before the page's own guard runs.
// mayOpen reads only the page's declaration, which for an Admin page does not
// include the Admin layout's surface.admin.
const SURFACE_GATES: readonly [prefix: string, atom: string][] = [
  ["/admin/", "surface.admin"],
  ["/portal/", "surface.portal"],
  ["/team/", "surface.team"],
];

/** Whether the viewer may open `href`: its surface's layout and its page's own permission. */
function reaches(viewer: Viewer, href: string): boolean {
  const gate = SURFACE_GATES.find(([prefix]) => href.startsWith(prefix));
  if (gate && !viewer.may(gate[1])) return false;
  return mayOpen(viewer, href);
}

function whoseDecision(a: WaitingApproval, personId: string | null, viewer: Viewer, href: string | null): { namedOnMe: boolean; whose: string } {
  if (personId && a.approverPersonId === personId) return { namedOnMe: true, whose: "You" };
  if (a.approverPermission) return { namedOnMe: false, whose: `Your role: ${roleWord(a.approverPermission, viewer)}` };
  // Addressed to nobody: what lets this viewer decide it is the permission of
  // the page it is decided on (rows without one are dropped before this).
  const atom = href ? permissionForPath(permissionRegistry().routes, href) : null;
  return { namedOnMe: false, whose: atom ? `Your role: ${roleWord(atom, viewer)}` : "Your role: Admin" };
}

/**
 * The inbox for `personId`, biggest reach first (Tier 2, then 1, then
 * internal), and oldest first within a tier, since it has waited longest.
 * `surface` is where the list is shown, whose pages its links prefer.
 */
export async function approvalsInbox(personId: string | null, viewer: Viewer, { surface }: { surface: ApprovalSurface }): Promise<InboxRow[]> {
  const waiting = await waitingOn(personId, { admin: viewer.may("surface.admin"), permissions: viewer.permissions() });
  const linked = waiting.flatMap((a) => {
    const href = decideHrefs(a, surface).find((h) => reaches(viewer, h)) ?? null;
    const addressed = (personId !== null && a.approverPersonId === personId) || a.approverPermission !== null;
    // An unaddressed row the viewer cannot decide is not theirs to read.
    return addressed || href ? [{ a, href }] : [];
  });
  const people = await peopleOnRecord(linked.flatMap(({ a }) => (a.requestedBy ? [a.requestedBy] : [])));
  const rows = linked.map(({ a, href }): InboxRow => {
    const asker = (a.requestedBy && people.get(a.requestedBy)?.name) || askerFor(a.subjectType) || "Not recorded";
    return {
      id: a.id,
      subjectType: a.subjectType,
      subjectId: a.subjectId,
      subject: APPROVAL_SUBJECTS[a.subjectType],
      tier: tierOf(a.subjectType),
      tierChip: tierChip(a),
      title: a.label,
      askedBy: a.requestedBy && a.requestedBy === personId ? "You" : asker,
      createdAt: a.createdAt,
      ...whoseDecision(a, personId, viewer, href),
      href,
      cta: ctaFor(a.subjectType),
      facts: approvalFacts(a),
    };
  });
  // Stable: waitingOn already answers oldest first.
  return rows.sort((x, y) => y.tier - x.tier);
}
