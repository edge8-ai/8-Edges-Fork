import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";

// What each person on the roster has brought to their next session themselves
// (K.80): the topics they added and whether they wrote a check-in since their
// last session. These are the employee's own signals, shown so a coach can
// prepare in a minute without opening every page. They describe what the
// person brought, never how well they are doing, and nothing sorts by them.
export type RosterSignals = {
  // Open talking points the employee wrote themselves.
  topicsFromThem: number;
  // A pre-session check-in answered since the last held session.
  checkinWritten: boolean;
  // Their latest words, for the home card (K.82): what they wrote in that
  // check-in, or else the note left after the last session. A quote is what a
  // phone call would have told the coach; the card leads with it.
  latestWords: LatestWords | null;
};

export type LatestWords = { text: string; source: "check-in" | "note"; on: string; label: string };

export const NO_SIGNALS: RosterSignals = { topicsFromThem: 0, checkinWritten: false, latestWords: null };

export async function getRosterSignals(
  subjects: { profileId: string; teamMemberId: string; lastHeldOn: string | null }[],
): Promise<Map<string, RosterSignals>> {
  const out = new Map<string, RosterSignals>();
  if (subjects.length === 0) return out;
  const ids = subjects.map((s) => s.profileId);
  const [pointsRes, checkinsRes, notesRes] = await Promise.all([
    companyOs
      .from("coaching_talking_points")
      .select("coaching_profile_id, author_team_member_id")
      .in("coaching_profile_id", ids)
      .is("addressed_at", null),
    companyOs
      .from("coaching_checkins")
      .select("coaching_profile_id, responded_at, moved_md, stuck_md, talk_md")
      .in("coaching_profile_id", ids)
      .not("responded_at", "is", null)
      .order("responded_at", { ascending: false }),
    companyOs
      .from("coaching_one_on_ones")
      .select("coaching_profile_id, held_on, shared_summary_markdown")
      .in("coaching_profile_id", ids)
      .is("archived_at", null)
      .eq("status", "held")
      .not("shared_summary_markdown", "is", null)
      .order("held_on", { ascending: false }),
  ]);
  // A failed read raises (rule 2): "no topics yet" beside someone who wrote
  // three would send a coach into the session thinking they brought nothing.
  const points = mustRows(pointsRes, "[coaching/roster] coaching_talking_points") as {
    coaching_profile_id: string;
    author_team_member_id: string | null;
  }[];
  const checkins = mustRows(checkinsRes, "[coaching/roster] coaching_checkins") as {
    coaching_profile_id: string;
    responded_at: string;
    moved_md: string | null;
    stuck_md: string | null;
    talk_md: string | null;
  }[];
  const notes = mustRows(notesRes, "[coaching/roster] coaching_one_on_ones") as {
    coaching_profile_id: string;
    held_on: string;
    shared_summary_markdown: string | null;
  }[];
  for (const s of subjects) {
    const since = (iso: string) => s.lastHeldOn === null || iso.slice(0, 10) > s.lastHeldOn;
    const checkin = checkins.find((c) => c.coaching_profile_id === s.profileId && since(c.responded_at));
    const note = notes.find((n) => n.coaching_profile_id === s.profileId);
    out.set(s.profileId, {
      latestWords: latestWords(checkin ?? null, note ?? null),
      topicsFromThem: points.filter(
        (p) => p.coaching_profile_id === s.profileId && p.author_team_member_id === s.teamMemberId,
      ).length,
      checkinWritten: checkins.some(
        (c) => c.coaching_profile_id === s.profileId && (s.lastHeldOn === null || c.responded_at.slice(0, 10) > s.lastHeldOn),
      ),
    });
  }
  return out;
}

// Their own words first: what they want to talk about, else what moved, else
// what is stuck. With no check-in since the last session, the note from that
// session. The first line only, without markdown, cut to a card's length.
export function latestWords(
  checkin: { responded_at: string; moved_md: string | null; stuck_md: string | null; talk_md: string | null } | null,
  note: { held_on: string; shared_summary_markdown: string | null } | null,
): LatestWords | null {
  if (checkin) {
    const pick =
      (clean(checkin.talk_md) && { text: clean(checkin.talk_md) as string, label: "wants to talk about" }) ||
      (clean(checkin.moved_md) && { text: clean(checkin.moved_md) as string, label: "what moved" }) ||
      (clean(checkin.stuck_md) && { text: clean(checkin.stuck_md) as string, label: "stuck on" }) ||
      null;
    if (pick) return { ...pick, source: "check-in", on: checkin.responded_at.slice(0, 10) };
  }
  const text = clean(note?.shared_summary_markdown ?? null);
  if (note && text) return { text, label: "from your last session", source: "note", on: note.held_on };
  return null;
}

function clean(md: string | null): string | null {
  const line = (md ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").replace(/[*_`#>]/g, "").trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  return line.length > 140 ? `${line.slice(0, 137).trimEnd()}…` : line;
}
