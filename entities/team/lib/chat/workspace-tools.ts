// Server-only. The team assistant's tools over the workspace itself: the
// handbook, staff, time off, events, ideas and the photo gallery. Open to every
// employee, as they were under the SQL tool these replace (2026-10-02). None of
// them reads a client contact: the directory is staff only, and time off never
// selects the reason or manager note.

import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { matchEveryTerm } from "@/kernel/data/postgrest-filter";
import { saigonToday } from "@/kernel/config/dates";
import { PORTAL_STATUSES } from "@/kernel/identity/team-auth";
import { selectIdeas } from "@/entities/ideas";
import { selectCompanyInformation, selectTeamDirectory } from "@/entities/org";
import { selectEvents } from "@/entities/retreats";
import { listGalleryPhotos } from "@/entities/site";
import { selectTimeOff } from "@/entities/time-off";
import { contains, namesFor, ok, text, type ToolInput, type ToolOutcome } from "./shared";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (s: string | null, max = 1500) => (s && s.length > max ? `${s.slice(0, max)}…` : s);
const termsOf = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 6);

export async function searchHandbook(input: ToolInput): Promise<ToolOutcome> {
  const query = text(input, "query");
  if (!query) {
    const all = mustRows(
      await selectCompanyInformation("slug, title, category").is("archived_at", null).order("title").limit(200),
      "[team/chat] handbook titles",
    );
    return ok({ entries: all });
  }
  const q = selectCompanyInformation("slug, title, category, body, updated_at").is("archived_at", null);
  const hits = mustRows(
    await matchEveryTerm(q, ["title", "body"], termsOf(query)).order("updated_at", { ascending: false }).limit(5),
    "[team/chat] handbook search",
  );
  return ok({ entries: hits });
}

type DirectoryRow = {
  id: string;
  person_id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  position_title: string | null;
  department_name: string | null;
  manager_name: string | null;
  location: string | null;
  employment_type: string | null;
  start_date: string | null;
};

export async function staffDirectory(input: ToolInput): Promise<ToolOutcome> {
  let q = selectTeamDirectory(
    "id, person_id, full_name, email, status, position_title, department_name, manager_name, location, employment_type, start_date",
  );
  if (input.include_former !== true) q = q.in("status", PORTAL_STATUSES);
  if (text(input, "name")) q = q.ilike("full_name", contains(text(input, "name")));
  if (text(input, "department")) q = q.ilike("department_name", contains(text(input, "department")));
  const rows = mustRows(await q.order("full_name").limit(100), "[team/chat] staff directory") as DirectoryRow[];
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
    const people = mustRows(
      await selectTeamDirectory("id").ilike("full_name", contains(text(input, "name"))).limit(20),
      "[team/chat] time off name",
    ) as { id: string }[];
    memberIds = people.map((p) => p.id);
    if (!memberIds.length) return ok({ from, to, leave: [], note: `No staff member matches "${text(input, "name")}".` });
  }
  // reason and manager_note are never selected: who is off is open, why is not.
  let q = selectTimeOff("team_member_id, leave_type, status, start_date, end_date, days, is_half_day")
    .lte("start_date", to)
    .gte("end_date", from);
  if (memberIds) q = q.in("team_member_id", memberIds);
  const rows = mustRows(await q.order("start_date").limit(200), "[team/chat] time off") as {
    team_member_id: string;
    leave_type: string;
    status: string;
    start_date: string;
    end_date: string;
    days: number | null;
    is_half_day: boolean;
  }[];
  const ids = [...new Set(rows.map((r) => r.team_member_id))];
  const names = ids.length
    ? (mustRows(await selectTeamDirectory("id, full_name").in("id", ids), "[team/chat] time off names") as {
        id: string;
        full_name: string | null;
      }[])
    : [];
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
  let q = selectEvents("title, type, status, starts_at, ends_at, timezone, location, blurb").is("archived_at", null);
  if (text(input, "search")) q = q.ilike("title", contains(text(input, "search")));
  if (when === "upcoming") q = q.gte("starts_at", now).order("starts_at", { ascending: true });
  else if (when === "past") q = q.lt("starts_at", now).order("starts_at", { ascending: false });
  else q = q.order("starts_at", { ascending: false });
  return ok({ events: mustRows(await q.limit(30), "[team/chat] events") });
}

export async function listIdeas(input: ToolInput): Promise<ToolOutcome> {
  let q = selectIdeas("title, kind, office, status, created_at, person_id, problem, roi, story, takeaway, ai_plan");
  if (["build", "learning"].includes(text(input, "kind"))) q = q.eq("kind", text(input, "kind"));
  if (text(input, "search")) q = q.ilike("title", contains(text(input, "search")));
  const rows = mustRows(await q.order("created_at", { ascending: false }).limit(30), "[team/chat] ideas") as {
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
  const staff = mustRows(
    await selectTeamDirectory("person_id, full_name").ilike("full_name", contains(person)).limit(10),
    "[team/chat] photo person",
  ) as { person_id: string; full_name: string | null }[];
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
