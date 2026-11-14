import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import type { EventPayload } from "@/kernel/events";
import { clientCycleIdOf } from "./access";

// Whom a sent client review part tells, and what (CR.2.6, spec story 11). The
// person who opened the cycle sends every next link herself, so she hears
// each time a member sends their self-assessment or a client manager sends
// their part, and knows which link is hers to send next. She is the only one
// told, and she is on the team: nothing here addresses a client contact. The
// skip-manager's Reviewed mark tells her once for the whole cycle (CR.3.2),
// so their part is not told here.

export type PartSentNotice = NonNullable<EventPayload<"review.part.submitted">["client"]>;

/** The parts whose sending changes what the owner does next, by the row's rater kind. */
const TOLD: Partial<Record<string, PartSentNotice["part"]>> = { self: "member", client_manager: "client_manager" };

/**
 * What the cycle's opener is told about this part, sent at `sentAt`, or null
 * when the part is not one she hears about. The submission states it on its
 * event; the notifications entity writes the Inbox row. A failed read throws,
 * and the caller sends the submission on without it.
 */
export async function partSentNotice(
  part: { cycle_label: string | null; team_member_id: string; rater_kind: string },
  sentAt: string,
): Promise<PartSentNotice | null> {
  const told = TOLD[part.rater_kind];
  const cycleId = clientCycleIdOf(part.cycle_label);
  if (!told || !cycleId) return null;
  const [cycleRes, memberRes] = await Promise.all([
    companyOs.from("review_cycles").select("name, opened_by").eq("id", cycleId).limit(1),
    companyOs.from("team_members").select(`people!person_id(id, ${NAME_COLUMNS})`).eq("id", part.team_member_id).limit(1),
  ]);
  const cycle = mustRows(cycleRes, "[org/client-reviews] review_cycles")[0] as { name: string; opened_by: string } | undefined;
  const member = mustRows(memberRes, "[org/client-reviews] team_members")[0] as { people: Embedded<NamedPerson & { id: string }> } | undefined;
  // The event refuses an empty name, and a refused event would not settle the
  // member's own ask either, so a cycle with no name tells nobody.
  if (!cycle || !cycle.name.trim()) return null;
  const person = one(member?.people);
  return {
    ownerPersonId: cycle.opened_by,
    cycleName: cycle.name.trim(),
    memberName: personName(person, "A team member"),
    memberPersonId: person?.id ?? null,
    part: told,
    overviewPath: `/admin/talent/reviews/clients/${cycleId}`,
    sentAt,
  };
}
