import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { PORTAL_STATUSES } from "@/kernel/identity/team-statuses";
import { activePlacementsWithClientManagerAt, contactLinksOfCompany } from "@/entities/contacts";
import { openClientReviewCycle } from "./open-cycle";

// What the open-cycle screen proposes and what it opens (CR.2.5, stories 1
// to 3). The person running reviews picks a client and a framework, and the
// screen proposes the people actively placed there, each with the client
// manager on their placement, and the skip-manager of the client's last cycle.
// She corrects the list and opens it through the same command the November
// script used (./open-cycle), so both paths write a cycle the same way.
//
// Every read is a must-read: a failed read is an error page, never a short
// list that would open a cycle with somebody missing.

export type Option = { id: string; name: string };

/** One person the screen proposes, with the client manager it proposes for them. */
export type ProposedMember = { teamMemberId: string; name: string; clientManagerPersonId: string | null };

export type OpenCycleProposal = {
  members: ProposedMember[];
  /** The client's current contacts: whom a client manager or the skip-manager may be. */
  contacts: Option[];
  /** The last cycle's skip-manager, while they are still a current contact. */
  skipManagerPersonId: string | null;
};

/** The clients a review can be opened for: the active customers, by name. */
export async function clientReviewClients(): Promise<Option[]> {
  return mustRows(
    await companyOs.from("companies").select("id, name").is("archived_at", null).eq("lifecycle_stage", "customer").order("name", { ascending: true }),
    "[org/client-reviews] companies",
  ) as Option[];
}

/** The frameworks a cycle can run on: every one not retired. A framework belongs to no client. */
export async function clientReviewFrameworks(): Promise<Option[]> {
  return mustRows(
    await companyOs.from("review_frameworks").select("id, name").is("archived_at", null).order("name", { ascending: true }),
    "[org/client-reviews] review_frameworks",
  ) as Option[];
}

/** The client's current contacts, read through the Contacts door. An archived person is never offered. */
export async function clientContactsOf(companyId: string): Promise<Option[]> {
  const links = mustRows(await contactLinksOfCompany(companyId), "[org/client-reviews] person_companies") as unknown as {
    person_id: string;
    people: Embedded<NamedPerson & { archived_at: string | null }>;
  }[];
  const byId = new Map<string, Option>();
  for (const l of links) {
    const p = one(l.people);
    if (p && !p.archived_at) byId.set(l.person_id, { id: l.person_id, name: personName(p, "Unnamed contact") });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** What opening a cycle for this client proposes. */
export async function openCycleProposal(companyId: string): Promise<OpenCycleProposal> {
  const [placementsRes, contacts, lastRes] = await Promise.all([
    activePlacementsWithClientManagerAt(companyId),
    clientContactsOf(companyId),
    companyOs.from("review_cycles").select("skip_manager_person_id").eq("company_id", companyId).order("opened_at", { ascending: false }).limit(1),
  ]);
  const placements = mustRows(placementsRes, "[org/client-reviews] staff_assignments") as { team_member_id: string; client_manager_person_id: string | null }[];
  const last = mustRows(lastRes, "[org/client-reviews] review_cycles")[0] as { skip_manager_person_id: string | null } | undefined;
  const current = new Set(contacts.map((c) => c.id));

  // A member placed twice keeps the first placement that names a client manager.
  const managerOf = new Map<string, string | null>();
  for (const p of placements) {
    if (!managerOf.get(p.team_member_id)) managerOf.set(p.team_member_id, p.client_manager_person_id);
  }
  const ids = [...managerOf.keys()];
  // Only people still on the team are proposed; a placement left active after they left is not a review.
  const names = ids.length
    ? (mustRows(
        await companyOs.from("team_members").select(`id, people!person_id(${NAME_COLUMNS})`).in("id", ids).in("status", PORTAL_STATUSES),
        "[org/client-reviews] team_members",
      ) as unknown as { id: string; people: Embedded<NamedPerson> }[])
    : [];
  const members = names
    .map((t) => {
      const manager = managerOf.get(t.id) ?? null;
      // A client manager who is no longer a current contact is not proposed: she picks another.
      return { teamMemberId: t.id, name: personName(one(t.people), "Team member"), clientManagerPersonId: manager && current.has(manager) ? manager : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const skip = last?.skip_manager_person_id ?? null;
  return { members, contacts, skipManagerPersonId: skip && current.has(skip) ? skip : null };
}

export type OpenForClientInput = {
  companyId: string;
  frameworkId: string;
  name: string;
  skipManagerPersonId: string | null;
  members: { teamMemberId: string; clientManagerPersonId: string | null }[];
};

/** A refusal for a name already taken names that cycle, so the screen can link to it. */
export type OpenForClientResult = { ok: true; cycleId: string; reused: boolean } | { ok: false; error: string; cycleId?: string };

/**
 * Opens a new cycle for a client from the screen, as the person acting. The
 * command checks what the page offered, because a request can be made by hand
 * (the boundary review on PR 2600): the client is an active customer, every
 * member is on the team now, and every client manager and the skip-manager is
 * a current contact of that client. Nobody opens a cycle that reviews
 * themselves: a colleague does, as with every other action on one's own review.
 *
 * It never adds to a cycle that already exists. The November command would
 * reuse a cycle of the same name and write the missing parts, past the checks
 * the overview's "add someone" makes (a withdrawn member, a client manager not
 * on the member's row), so the screen sends her to that cycle instead.
 */
export async function openCycleForClient(input: OpenForClientInput, by: { personId: string; ownTeamMemberIds: readonly string[] }): Promise<OpenForClientResult> {
  if (!isUuid(input.companyId)) return { ok: false, error: "Choose a client." };
  // Every team-member row of the person (./access, teamMemberIdsOf), so a
  // second engagement is still them (the boundary review on PR 2611).
  if (input.members.some((m) => by.ownTeamMemberIds.includes(m.teamMemberId))) {
    return { ok: false, error: "You are on this list, so a colleague opens the cycle with you in it." };
  }
  const memberIds = input.members.map((m) => m.teamMemberId);
  const [customerRes, contacts, teamRes, cyclesRes] = await Promise.all([
    companyOs.from("companies").select("id").eq("id", input.companyId).is("archived_at", null).eq("lifecycle_stage", "customer").limit(1),
    clientContactsOf(input.companyId),
    companyOs.from("team_members").select("id").in("id", memberIds).in("status", PORTAL_STATUSES),
    companyOs.from("review_cycles").select("id, name").eq("company_id", input.companyId),
  ]);
  if (mustRows(customerRes, "[org/client-reviews] companies").length === 0) return { ok: false, error: "Choose one of the active clients." };
  const onTeam = new Set((mustRows(teamRes, "[org/client-reviews] team_members") as { id: string }[]).map((t) => t.id));
  if (memberIds.some((id) => !onTeam.has(id))) return { ok: false, error: "Everyone reviewed must be on the team now. Reload the page." };
  const current = new Set(contacts.map((c) => c.id));
  const named = [input.skipManagerPersonId, ...input.members.map((m) => m.clientManagerPersonId)].filter((id): id is string => id !== null);
  if (named.some((id) => !current.has(id))) return { ok: false, error: "Every client manager and the skip-manager must be one of the client's current contacts." };
  const wanted = input.name.trim().toLowerCase();
  const existing = (mustRows(cyclesRes, "[org/client-reviews] review_cycles") as { id: string; name: string }[]).find((c) => c.name.trim().toLowerCase() === wanted);
  if (existing) return { ok: false, error: "This client already has a cycle with that name. Add people from its overview, or choose another name.", cycleId: existing.id };
  const opened = await openClientReviewCycle({ ...input, openedByPersonId: by.personId });
  return opened.ok ? { ok: true, cycleId: opened.cycleId, reused: opened.reused } : opened;
}
