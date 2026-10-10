import { selectMeetings } from "@/entities/crm";
import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { attendedBy } from "../session-attendance";
import { getNoticedFor, type NoticedRow } from "./noticed";

// The member's growth history, as more than a list of 1-1s (L.4, L.8).
//
// The History tab has always claimed to be the whole of somebody's coaching and
// quietly held only their 1-1s. Two other things belong on it: the group
// sessions they actually attended, which are coaching they received, and the
// noticed sentences somebody wrote about their work, which are the only thing
// in the product that is not an obligation.
//
// They share one timeline rather than getting three lists, because they share
// one axis — time — and a reader scanning their own year should see one story.
// The row types stay separate so a renderer can tell them apart at a glance.

export type TimelineExtra =
  | { kind: "noticed"; on: string; noticed: NoticedRow }
  | { kind: "session"; on: string; title: string; sessionId: string };

/** Group sessions this member was recorded speaking in, newest first. */
export async function getMySessionsAttended(names: (string | null)[]): Promise<TimelineExtra[]> {
  const { data, error } = await selectMeetings("id, title, started_at, metadata")
    .eq("source", "zoom")
    .eq("metadata->>source_meeting_type", "coaching")
    .is("archived_at", null)
    .order("started_at", { ascending: false, nullsFirst: false })
    // A year of sessions is more history than any timeline shows; the cap keeps
    // this from walking every group session the company has ever run.
    .limit(60);
  if (error) {
    console.error("[team/coaching/my-timeline] meetings", error);
    return [];
  }
  const rows = (data ?? []) as unknown as {
    id: string;
    title: string | null;
    started_at: string | null;
    metadata: { speakers?: string[] } | null;
  }[];
  return rows
    .filter((m) => m.started_at && attendedBy(Array.isArray(m.metadata?.speakers) ? m.metadata!.speakers! : [], names))
    .map((m) => ({
      kind: "session" as const,
      on: m.started_at!.slice(0, 10),
      title: m.title?.trim() || "Group coaching session",
      sessionId: m.id,
    }));
}

/**
 * Every name we hold for a person, for the attendance match.
 *
 * Resolved HERE rather than taken from the caller (bug hunt BH-3): both callers
 * passed a SINGLE name — the route had `actor.displayName`, the brag document
 * had `memberName` — while `attendedBy` takes an array precisely because
 * somebody called "Nguyen Van An" in the directory is often "Andy" in Zoom. The
 * feature under-delivered silently: sessions simply missing from a timeline,
 * with no error anywhere. A function that needs two names should ask for them
 * rather than hope every caller knows that.
 */
async function namesFor(personId: string): Promise<(string | null)[]> {
  const { data, error } = await companyOs
    .from("people")
    .select("full_name, preferred_name")
    .eq("id", personId)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/my-timeline] people", error);
    return [];
  }
  const r = data as { full_name: string | null; preferred_name: string | null } | null;
  return [r?.full_name ?? null, r?.preferred_name ?? null];
}

/** Everything on the timeline that is not a 1-1, newest first. */
export async function getTimelineExtras(actor: TeamActor, profileId: string): Promise<TimelineExtra[]> {
  const [noticed, sessions] = await Promise.all([
    getNoticedFor(profileId),
    namesFor(actor.personId).then(getMySessionsAttended),
  ]);
  const out: TimelineExtra[] = [
    ...noticed.map((n) => ({ kind: "noticed" as const, on: n.noticedOn, noticed: n })),
    ...sessions,
  ];
  return out.sort((a, b) => b.on.localeCompare(a.on));
}
