import { mustRows } from "@/kernel/data/read";
import { companyOs, type Json } from "@/kernel/data/supabase";
import { CALENDAR_PREFIX, meta } from "./calendar-meetings";

// A calendar meeting and its recording are one call filed twice: the calendar
// routine files the slot days ahead, and a pasted Minutes link, Zoom or the
// coaching pickup files the recording afterwards. The fold makes them one row
// again, here, rather than in every writer that files a recording (CS.1).

/** How close a recording's start must be to the calendar slot to be the same call. */
export const FOLD_WINDOW_MS = 20 * 60_000;

export type FoldCandidate = { id: string; startedAt: string; companyIds: string[]; personIds: string[] };

/**
 * The pure match: each calendar meeting and the recording it became, if one
 * started within FOLD_WINDOW_MS and shares a company or a person other than
 * the host. The nearest pair wins, and a recording takes one calendar slot.
 */
export function matchFolds(calendar: FoldCandidate[], recorded: FoldCandidate[], hostIds: Set<string>): { calendarId: string; recordedId: string }[] {
  const pairs: { calendarId: string; recordedId: string; gap: number }[] = [];
  for (const c of calendar) {
    const at = Date.parse(c.startedAt);
    const people = c.personIds.filter((p) => !hostIds.has(p));
    for (const r of recorded) {
      const gap = Math.abs(Date.parse(r.startedAt) - at);
      if (gap > FOLD_WINDOW_MS) continue;
      if (r.companyIds.some((x) => c.companyIds.includes(x)) || r.personIds.some((p) => people.includes(p))) pairs.push({ calendarId: c.id, recordedId: r.id, gap });
    }
  }
  // Nearest pairs first across every slot, so a recording goes to the slot it is closest to.
  pairs.sort((a, b) => a.gap - b.gap);
  const usedCalendar = new Set<string>();
  const usedRecorded = new Set<string>();
  const out: { calendarId: string; recordedId: string }[] = [];
  for (const p of pairs) {
    if (usedCalendar.has(p.calendarId) || usedRecorded.has(p.recordedId)) continue;
    usedCalendar.add(p.calendarId);
    usedRecorded.add(p.recordedId);
    out.push({ calendarId: p.calendarId, recordedId: p.recordedId });
  }
  return out;
}

type LiveMeeting = {
  id: string;
  external_id: string | null;
  company_id: string | null;
  started_at: string;
  meeting_type: string | null;
  owner_id: string | null;
  metadata: Json;
  meeting_participants: { person_id: string | null }[] | null;
  meeting_associations: { entity_type: string; entity_id: string }[] | null;
};

/**
 * Retires each calendar meeting since `since` whose recording has been filed
 * by another writer: the recording gains the event id (and the calendar's
 * meeting type when it has none), and the calendar row is archived with a
 * pointer to it. The meeting is then one row, counted once. Answers how many
 * it folded.
 */
export async function foldCalendarMeetings(since: Date): Promise<number> {
  const rows = mustRows(
    await companyOs
      .from("meetings")
      .select("id, external_id, company_id, started_at, meeting_type, owner_id, metadata, meeting_participants(person_id), meeting_associations(entity_type, entity_id)")
      .is("archived_at", null)
      .not("started_at", "is", null)
      .gte("started_at", new Date(since.getTime() - FOLD_WINDOW_MS).toISOString())
      .order("started_at"),
    "[crm/calendar-meetings] fold window",
  ) as unknown as LiveMeeting[];
  const isCalendar = (r: LiveMeeting) => (r.external_id ?? "").startsWith(CALENDAR_PREFIX);
  const asCandidate = (r: LiveMeeting): FoldCandidate => ({
    id: r.id,
    startedAt: r.started_at,
    companyIds: [...new Set([r.company_id, ...(r.meeting_associations ?? []).filter((a) => a.entity_type === "company").map((a) => a.entity_id)].filter((x): x is string => !!x))],
    personIds: (r.meeting_participants ?? []).map((p) => p.person_id).filter((x): x is string => !!x),
  });
  const calendar = rows.filter(isCalendar);
  if (calendar.length === 0) return 0;
  const recorded = rows.filter((r) => !isCalendar(r));
  const hosts = new Set(rows.map((r) => r.owner_id).filter((x): x is string => !!x));
  const byId = new Map(rows.map((r) => [r.id, r]));

  let folded = 0;
  for (const { calendarId, recordedId } of matchFolds(calendar.map(asCandidate), recorded.map(asCandidate), hosts)) {
    const cal = byId.get(calendarId)!;
    const rec = byId.get(recordedId)!;
    const now = new Date().toISOString();
    const { error: recErr } = await companyOs
      .from("meetings")
      .update({
        metadata: { ...meta(rec.metadata), lark_event_id: meta(cal.metadata).lark_event_id ?? null },
        ...(rec.meeting_type === null && cal.meeting_type ? { meeting_type: cal.meeting_type } : {}),
        updated_at: now,
      })
      .eq("id", rec.id);
    if (recErr) throw new Error(`fold recording: ${recErr.message}`);
    const { error: calErr } = await companyOs
      .from("meetings")
      .update({ archived_at: now, metadata: { ...meta(cal.metadata), folded_into: rec.id }, updated_at: now })
      .eq("id", cal.id)
      .is("archived_at", null);
    if (calErr) throw new Error(`fold calendar: ${calErr.message}`);
    folded++;
  }
  return folded;
}
