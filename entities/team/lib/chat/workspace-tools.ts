// Server-only. The team assistant's tools over the workspace itself: the
// handbook, staff, time off, events, ideas and the photo gallery. Open to every
// employee, as they were under the SQL tool these replace (2026-10-02). None of
// them reads a client contact: the directory is staff only, and time off never
// selects the reason or manager note.

import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { saigonToday } from "@/kernel/config/dates";
import { PORTAL_STATUSES } from "@/kernel/identity/team-auth";
import { assistantSparks } from "@/entities/ideas";
import { handbookPagesMatching, handbookTitles, searchStaffDirectory, staffIdsNamed, staffNames, staffPeopleNamed } from "@/entities/org";
import { assistantEvents } from "@/entities/retreats";
import { listGalleryPhotos } from "@/entities/retreats";
import { colleagueLeaveBetween } from "@/entities/time-off";
import { namesFor, ok, text, type ToolInput, type ToolOutcome } from "./shared";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (s: string | null, max = 1500) => (s && s.length > max ? `${s.slice(0, max)}…` : s);
const termsOf = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 6);

export async function searchHandbook(input: ToolInput): Promise<ToolOutcome> {
  const query = text(input, "query");
  if (!query) {
    const all = mustRows(await handbookTitles(), "[team/chat] handbook titles");
    return ok({ entries: all });
  }
  const hits = mustRows(await handbookPagesMatching(termsOf(query)), "[team/chat] handbook search");
  return ok({ entries: hits });
}

export async function staffDirectory(input: ToolInput): Promise<ToolOutcome> {
  const rows = mustRows(
    await searchStaffDirectory({
      includeFormer: input.include_former === true,
      name: text(input, "name"),
      department: text(input, "department"),
    }),
    "[team/chat] staff directory",
  );
  const avatars = rows.length
    ? (mustRows(
        await companyOs
          .from("people")
          .select("id, preferred_name, avatar_url")
          .in(
            "id",
            rows.map((r) => r.person_id),
          ),
        "[team/chat] staff avatars",
      ) as { id: string; preferred_name: string | null; avatar_url: string | null }[])
    : [];
  const extra = new Map(avatars.map((a) => [a.id, a]));
  return ok({
    staff: rows.map((r) => ({
      profileId: r.id,
      name: r.full_name,
      preferredName: extra.get(r.person_id)?.preferred_name ?? null,
      email: r.email,
      status: r.status,
      current: PORTAL_STATUSES.includes(r.status),
      position: r.position_title,
      department: r.department_name,
      manager: r.manager_name,
      location: r.location,
      employmentType: r.employment_type,
      startDate: r.start_date,
      avatarUrl: extra.get(r.person_id)?.avatar_url ?? null,
    })),
  });
}

export async function timeOff(input: ToolInput): Promise<ToolOutcome> {
  const from = DATE.test(text(input, "from")) ? text(input, "from") : saigonToday();
  const fallbackTo = new Date(`${from}T00:00:00Z`);
  fallbackTo.setUTCDate(fallbackTo.getUTCDate() + 14);
  const to = DATE.test(text(input, "to")) ? text(input, "to") : fallbackTo.toISOString().slice(0, 10);

  let memberIds: string[] | null = null;
  if (text(input, "name")) {
    const people = mustRows(await staffIdsNamed(text(input, "name")), "[team/chat] time off name");
    memberIds = people.map((p) => p.id);
    if (!memberIds.length) return ok({ from, to, leave: [], note: `No staff member matches "${text(input, "name")}".` });
  }
  // reason and manager_note are never selected: who is off is open, why is not.
  const rows = mustRows(await colleagueLeaveBetween(from, to, memberIds), "[team/chat] time off") as {
    team_member_id: string;
    leave_type: string;
    status: string;
    start_date: string;
    end_date: string;
    days: number | null;
    is_half_day: boolean;
  }[];
  const ids = [...new Set(rows.map((r) => r.team_member_id))];
  const names = ids.length ? mustRows(await staffNames(ids), "[team/chat] time off names") : [];
  const nameOf = new Map(names.map((n) => [n.id, n.full_name]));
  return ok({
    from,
    to,
    leave: rows.map((r) => ({
      person: nameOf.get(r.team_member_id) ?? null,
      type: r.leave_type,
      status: r.status,
      start: r.start_date,
      end: r.end_date,
      days: r.days,
      halfDay: r.is_half_day,
    })),
  });
}

export async function listEvents(input: ToolInput): Promise<ToolOutcome> {
  const when = text(input, "when") || "upcoming";
  const now = new Date().toISOString();
  return ok({ events: mustRows(await assistantEvents(when, text(input, "search"), now), "[team/chat] events") });
}

export async function listIdeas(input: ToolInput): Promise<ToolOutcome> {
  const kind = ["build", "learning"].includes(text(input, "kind")) ? text(input, "kind") : null;
  const rows = mustRows(await assistantSparks(kind, text(input, "search")), "[team/chat] ideas") as {
    title: string;
    kind: string;
    office: string | null;
    status: string;
    created_at: string;
    person_id: string;
    problem: string | null;
    roi: string | null;
    story: string | null;
    takeaway: string | null;
    ai_plan: string | null;
  }[];
  const authors = await namesFor(rows.map((r) => r.person_id));
  return ok({
    ideas: rows.map(({ person_id, ...r }) => ({
      ...r,
      author: authors.get(person_id) ?? null,
      problem: clip(r.problem),
      roi: clip(r.roi),
      story: clip(r.story),
      takeaway: clip(r.takeaway),
      ai_plan: clip(r.ai_plan),
    })),
  });
}

export async function findPhotos(input: ToolInput): Promise<ToolOutcome> {
  const photos = await listGalleryPhotos();
  const person = text(input, "person");
  if (!person) {
    return ok({ photos: photos.slice(0, 12).map(({ id: _id, people, ...p }) => ({ ...p, tagged: (people ?? []).map((t) => t.name) })) });
  }
  const staff = mustRows(await staffPeopleNamed(person), "[team/chat] photo person");
  const ids = new Set(staff.map((s) => s.person_id));
  const avatars = staff.length
    ? (mustRows(
        await companyOs.from("people").select("id, avatar_url").in("id", [...ids]),
        "[team/chat] photo avatars",
      ) as { id: string; avatar_url: string | null }[])
    : [];
  const avatarOf = new Map(avatars.map((a) => [a.id, a.avatar_url]));
  return ok({
    people: staff.map((s) => ({ name: s.full_name, avatarUrl: avatarOf.get(s.person_id) ?? null })),
    photos: photos
      .filter((p) => (p.people ?? []).some((t) => ids.has(t.person_id)))
      .slice(0, 12)
      .map(({ id: _id, people, ...p }) => ({ ...p, tagged: (people ?? []).map((t) => t.name) })),
  });
}
