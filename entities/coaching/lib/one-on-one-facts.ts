// What coaching tells the rest of the system about a 1-1 (TH.8.3): it was
// booked, moved, or its prep is ready. The inbox listens and tells each side
// it is asked to, so a 1-1 arrives where a person looks rather than only in
// the email and Lark message coaching already sends.
//
// Both sides are stated as people, read here from the profile, because a
// listener must not reach into coaching's tables to find out who coaches whom.
// Telling is a soft effect: a failed read or a refused fact is logged and the
// booking, move or prep it follows stands.
import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, personName, type GreetedPerson } from "@/kernel/config/people-name";
import { publish } from "@/kernel/events";

type Side = "coach" | "coachee";

type Member = { id: string; person_id: string | null; people: GreetedPerson | GreetedPerson[] | null };

export async function announceOneOnOne(f: {
  meetingId: string;
  profileId: string;
  change: "booked" | "moved" | "prep_ready";
  heldOn: string;
  movedFrom?: string | null;
  tell: Side[];
  actorPersonId?: string | null;
}): Promise<void> {
  try {
    const { data: profile, error } = await companyOs.from("coaching_profiles").select("coach_id, team_member_id").eq("id", f.profileId).maybeSingle();
    if (error) throw new Error(`coaching_profiles: ${error.message}`);
    if (!profile) return;
    const ids = [profile.coach_id, profile.team_member_id].filter((id): id is string => !!id);
    // Forward lookups by id, never the self-referencing embed (cycle-shared).
    const { data: members, error: membersErr } = ids.length
      ? await companyOs.from("team_members").select(`id, person_id, people:people!person_id(${NAME_COLUMNS})`).in("id", ids)
      : { data: [], error: null };
    if (membersErr) throw new Error(`team_members: ${membersErr.message}`);
    const byId = new Map(((members ?? []) as unknown as Member[]).map((m) => [m.id, m]));
    const side = (id: string | null) => {
      const m = id ? byId.get(id) : undefined;
      const person = one(m?.people ?? null);
      return { personId: m?.person_id ?? null, name: person ? personName(person, "") || null : null };
    };
    const coach = side(profile.coach_id);
    const coachee = side(profile.team_member_id);
    await publish("coaching.one_on_one.changed", {
      meetingId: f.meetingId,
      profileId: f.profileId,
      change: f.change,
      heldOn: f.heldOn,
      movedFrom: f.movedFrom ?? null,
      coachPersonId: coach.personId,
      coacheePersonId: coachee.personId,
      coachName: coach.name,
      coacheeName: coachee.name,
      tell: f.tell,
      actorPersonId: f.actorPersonId ?? null,
    });
  } catch (err) {
    console.error(`[coaching] 1-1 ${f.meetingId} ${f.change} not stated:`, err instanceof Error ? err.message : err);
  }
}
