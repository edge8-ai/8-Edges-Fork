import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { businessDate } from "@/kernel/config/dates";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { csvCell, csvFilename, type CsvValue } from "@/kernel/ui/dash/csv";
import { formSteps } from "../form-steps";
import type { SurveyFieldRow } from "../surveys-schema";
import { PART_COLUMNS, factsFrom, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import { memberAnswersBeside, type AnswerBeside } from "./beside";
import { averageOfRatings, isPartSubmitted, memberStage, type ClientReviewStage } from "./rules";
import { raterFieldsOf } from "./skip-manager";

// The cycle overview as a spreadsheet (CR.3.4, story 59), as the CR.3.4
// prototype was approved: one row per member with the stage, both averages,
// when each part was sent and the review released, every answer of both parts
// in its own column, and the HR summary. It is built on request behind the
// reviews permission and never stored.
//
// What it never holds: the skip-manager's notes (a file leaves the app, and
// the notes are for HR only, story 55), a part still being written (it is its
// writer's until sent), and anything of the downloading person's own review:
// their row carries only what the overview shows on it (their name, their
// client manager, the stage and the release date), never an answer, an
// average, a sent date or the summary.

const STAGE_WORDS: Record<ClientReviewStage, string> = {
  waiting_on_member: "Waiting on member",
  waiting_on_client_manager: "Waiting on client manager",
  waiting_on_skip_manager: "Waiting on skip-manager",
  ready_to_release: "Ready to release",
  released: "Released",
  withdrawn: "Withdrawn",
};

/** One member's row, before it becomes cells. */
export type ExportMember = {
  name: string;
  clientManagerName: string | null;
  stage: ClientReviewStage;
  own: boolean;
  memberPart: ClientPartRow | null;
  clientManagerPart: ClientPartRow | null;
  releasedAt: string | null;
  hrSummary: string | null;
};

type Column = { title: string; scale: string; cell: (m: ExportMember, beside: { self: Record<string, AnswerBeside>; client: Record<string, AnswerBeside> }) => CsvValue };

const day = (iso: string | null | undefined) => (iso ? businessDate(iso) : "");

/** The columns, from the rater's form: four per rated question, and per worded one an answer each side, with any reason beside it. */
function columnsFor(raterFields: readonly SurveyFieldRow[], ratingKeys: readonly string[]): Column[] {
  const avg = (part: ClientPartRow | null) => (part && isPartSubmitted(part) ? averageOfRatings(part.ratings, ratingKeys) : null);
  const columns: Column[] = [
    { title: "Member", scale: "", cell: (m) => m.name },
    { title: "Client manager", scale: "", cell: (m) => m.clientManagerName ?? "" },
    { title: "Stage", scale: "", cell: (m) => STAGE_WORDS[m.stage] },
    { title: "Self avg", scale: "", cell: (m) => (m.own ? null : avg(m.memberPart)) },
    { title: "Client avg", scale: "", cell: (m) => (m.own ? null : avg(m.clientManagerPart)) },
    { title: "Member sent", scale: "", cell: (m) => (m.own || !isPartSubmitted(m.memberPart) ? "" : day(m.memberPart?.submitted_at)) },
    { title: "Client sent", scale: "", cell: (m) => (m.own || !isPartSubmitted(m.clientManagerPart) ? "" : day(m.clientManagerPart?.submitted_at)) },
    { title: "Released", scale: "", cell: (m) => day(m.releasedAt) },
  ];
  for (const [first, companion] of formSteps(raterFields)) {
    if (first.type === "yes_no" || typeof first.config?.maps_to !== "string") continue;
    const id = first.id;
    const title = first.label;
    if (first.type === "rating") {
      const levels = Object.entries(first.config?.levels ?? {})
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([n, words]) => `${n} ${words}`)
        .join(" · ");
      columns.push(
        { title: `${title} · self`, scale: levels, cell: (_m, b) => b.self[id]?.rating ?? null },
        { title: `${title} · self comment`, scale: "", cell: (_m, b) => b.self[id]?.text ?? "" },
        { title: `${title} · client`, scale: levels, cell: (_m, b) => b.client[id]?.rating ?? null },
        { title: `${title} · client comment`, scale: "", cell: (_m, b) => b.client[id]?.text ?? "" },
      );
    } else if (companion) {
      columns.push(
        { title: `${title} · self`, scale: "", cell: (_m, b) => b.self[id]?.choice ?? "" },
        { title: `${title} · self reason`, scale: "", cell: (_m, b) => b.self[id]?.text ?? "" },
        { title: `${title} · client`, scale: "", cell: (_m, b) => b.client[id]?.choice ?? "" },
        { title: `${title} · client reason`, scale: "", cell: (_m, b) => b.client[id]?.text ?? "" },
      );
    } else {
      columns.push(
        { title: `${title} · self`, scale: "", cell: (_m, b) => b.self[id]?.choice ?? b.self[id]?.text ?? "" },
        { title: `${title} · client`, scale: "", cell: (_m, b) => b.client[id]?.choice ?? b.client[id]?.text ?? "" },
      );
    }
  }
  columns.push({ title: "HR summary", scale: "", cell: (m) => (m.own ? "" : (m.hrSummary ?? "")) });
  return columns;
}

/**
 * The spreadsheet's text. Pure. A header row, a second row with the scale's
 * words under each rating column, then one row per member. Only a sent part's
 * answers are read, and nothing of the person's own review.
 */
export function cycleSpreadsheet(members: readonly ExportMember[], raterFields: readonly SurveyFieldRow[], ratingKeys: readonly string[]): string {
  const columns = columnsFor(raterFields, ratingKeys);
  const sent = (m: ExportMember, part: ClientPartRow | null) => (!m.own && part && isPartSubmitted(part) ? part : null);
  const lines = [columns.map((c) => csvCell(c.title)).join(","), columns.map((c) => csvCell(c.scale)).join(",")];
  for (const m of members) {
    const beside = { self: memberAnswersBeside(raterFields, sent(m, m.memberPart)), client: memberAnswersBeside(raterFields, sent(m, m.clientManagerPart)) };
    lines.push(columns.map((c) => csvCell(c.cell(m, beside))).join(","));
  }
  return lines.join("\r\n");
}

type ExportCycle = CycleRow & { companies: Embedded<{ name: string | null }>; review_frameworks: Embedded<{ rating_keys: string[] | null }> };
type ExportPlace = CycleMemberRow & { team_member_id: string; client_manager_person_id: string | null; hr_summary: string | null };

/**
 * The cycle's spreadsheet and its file name, or null when there is no such
 * cycle. `viewerTeamMemberIds` is every team-member row of the person
 * downloading (./access, teamMemberIdsOf); their own row is left bare. Every
 * read is a must-read: a failed read is an error, never a file with gaps.
 */
export async function clientCycleExport(cycleId: string, viewerTeamMemberIds: readonly string[]): Promise<{ filename: string; csv: string } | null> {
  if (!isUuid(cycleId)) return null;
  const [cycleRes, placeRes, partsRes, skipRes] = await Promise.all([
    companyOs
      .from("review_cycles")
      .select("id, name, closed_at, framework_id, skip_manager_person_id, skip_manager_link_cancelled_at, companies:companies!company_id(name), review_frameworks:review_frameworks!framework_id(rating_keys)")
      .eq("id", cycleId)
      .limit(1),
    companyOs
      .from("review_cycle_members")
      .select("team_member_id, client_manager_person_id, withdrawn_at, rater_unlocked_at, skip_waived_at, released_at, hr_summary")
      .eq("cycle_id", cycleId),
    // The skip-manager's part is never read here: its notes never reach a file.
    companyOs.from("performance_reviews").select(PART_COLUMNS).eq("review_cycle_id", cycleId).eq("review_type", "client").in("rater_kind", ["self", "client_manager"]),
    // The skip-manager's part only for its status, which the stage needs
    // (marked Reviewed or not): never its metadata, where the notes are.
    companyOs.from("performance_reviews").select("id, team_member_id, rater_kind, status").eq("review_cycle_id", cycleId).eq("review_type", "client").eq("rater_kind", "skip_manager"),
  ]);
  const cycle = mustRows(cycleRes, "[org/client-reviews] review_cycles")[0] as unknown as ExportCycle | undefined;
  if (!cycle) return null;
  const places = mustRows(placeRes, "[org/client-reviews] review_cycle_members") as ExportPlace[];
  const parts = mustRows(partsRes, "[org/client-reviews] performance_reviews") as ClientPartRow[];
  const skipStatuses = (mustRows(skipRes, "[org/client-reviews] performance_reviews") as Pick<ClientPartRow, "id" | "team_member_id" | "rater_kind" | "status">[]).map(
    (s): ClientPartRow => ({ ...s, review_type: "client", submitted_at: null, ratings: null, achievements: null, improvements: null, comments: null, metadata: null, access_token: null }),
  );

  const personIds = [...new Set(places.map((p) => p.client_manager_person_id).filter((id): id is string => id !== null))];
  const [raterFields, memberRes, peopleRes] = await Promise.all([
    raterFieldsOf(cycle.framework_id),
    places.length
      ? companyOs.from("team_members").select(`id, people!person_id(${NAME_COLUMNS})`).in("id", places.map((p) => p.team_member_id))
      : Promise.resolve({ data: [], error: null }),
    personIds.length ? companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", personIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const memberNames = new Map(
    (mustRows(memberRes, "[org/client-reviews] team_members") as unknown as { id: string; people: Embedded<NamedPerson> }[]).map((r) => [r.id, personName(one(r.people), "Team member")]),
  );
  const peopleNames = new Map((mustRows(peopleRes, "[org/client-reviews] people") as unknown as (NamedPerson & { id: string })[]).map((p) => [p.id, personName(p, "Unnamed")]));

  const members = places
    .map((p): ExportMember => {
      const own = parts.concat(skipStatuses).filter((r) => r.team_member_id === p.team_member_id);
      const { facts, parts: byKind } = factsFrom(cycle, p, own);
      return {
        name: memberNames.get(p.team_member_id) ?? "Team member",
        clientManagerName: p.client_manager_person_id ? (peopleNames.get(p.client_manager_person_id) ?? null) : null,
        stage: memberStage(facts),
        own: viewerTeamMemberIds.includes(p.team_member_id),
        memberPart: byKind.member,
        clientManagerPart: byKind.clientManager,
        releasedAt: p.released_at,
        hrSummary: p.hr_summary,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const ratingKeys = one(cycle.review_frameworks)?.rating_keys ?? [];
  const clientName = one(cycle.companies)?.name ?? null;
  return {
    filename: csvFilename(`${clientName ?? "client"} ${cycle.name}`),
    csv: cycleSpreadsheet(members, raterFields, ratingKeys),
  };
}
