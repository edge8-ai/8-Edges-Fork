import { companyOs } from "@/kernel/data/supabase";
import { pipelineStageNames, recentDealsOfPerson } from "@/entities/crm";
import { tagsOfPerson } from "@/entities/contacts";
import { one } from "@/kernel/config/embedded";
import { loadLearners, nextCoaching } from "../learner-progress";
import type { Fact, Recipient, SourceKey } from "./types";

// The agent's context: each source turns a person into a few dated, sourced
// facts. The writer may only say what is in them, so a source states plain
// facts with their numbers and dates and leaves the wording to the skill.
// A source that cannot be read (a platform that is down, an env var unset)
// contributes nothing and says so in the log; it never fails the run.

type Source = (person: Recipient, now: Date) => Promise<Fact[]>;

const day = (iso: string | Date) => (typeof iso === "string" ? iso : iso.toISOString()).slice(0, 10);

// Certification progress on the learning platform, one fact per track, plus
// the electives passed. The platform has no per-event dates, so the facts are
// dated today: they are true today, which is what the writer needs.
const learnerProgress: Source = async (person, now) => {
  const data = await loadLearners([person.email]);
  const learner = data?.byEmail.get(person.email.toLowerCase());
  if (!learner) return [];
  const facts: Fact[] = learner.tracks.map((t) => ({
    date: day(now),
    source: "learner_progress",
    fact: t.complete
      ? `Completed the ${t.title} certification (${t.total} of ${t.total} courses)`
      : `Completed ${t.completed} of ${t.total} courses on the ${t.title} track`,
  }));
  if (learner.passedCourseIds.size > 0) facts.push({ date: day(now), source: "learner_progress", fact: `Passed ${learner.passedCourseIds.size} elective micro-session${learner.passedCourseIds.size === 1 ? "" : "s"}` });
  return facts;
};

// Coaching on the platform: sessions attended against the track's requirement,
// and the next live session anyone can join.
const coaching: Source = async (person, now) => {
  const [data, next] = await Promise.all([loadLearners([person.email]), nextCoaching(now)]);
  const learner = data?.byEmail.get(person.email.toLowerCase());
  const facts: Fact[] = [];
  for (const t of learner?.tracks ?? []) {
    if (t.coachingRequired > 0) facts.push({ date: day(now), source: "coaching", fact: `Attended ${t.coachingAttended} of ${t.coachingRequired} coaching sessions on the ${t.title} track` });
  }
  if (next) {
    const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(next.at));
    facts.push({ date: day(next.at), source: "coaching", fact: `The next live coaching session is ${when} GMT+7 (${next.signupUrl})` });
  }
  return facts;
};

// Open deals with this person and the last non-email touch on their record.
const crm: Source = async (person) => {
  const facts: Fact[] = [];
  const { data: deals, error: dealsError } = await recentDealsOfPerson(person.id, 5);
  if (dealsError) console.error("[campaigns/personal] deals read", dealsError.message);
  const dealRows = (deals ?? []) as { title: string; status: string; stage_id: string | null; updated_at: string }[];
  const stageIds = [...new Set(dealRows.flatMap((d) => (d.stage_id ? [d.stage_id] : [])))];
  const { data: stages, error: stagesError } = stageIds.length > 0 ? await pipelineStageNames(stageIds) : { data: [], error: null };
  if (stagesError) console.error("[campaigns/personal] stages read", stagesError.message);
  const stageName = new Map(((stages ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  for (const d of dealRows) {
    facts.push({ date: day(d.updated_at), source: "crm", fact: `Deal "${d.title}" is ${d.status}${d.stage_id && stageName.get(d.stage_id) ? ` at stage ${stageName.get(d.stage_id)}` : ""}` });
  }
  const { data: touches, error: touchError } = await companyOs.from("interactions").select("kind, subject, occurred_at")
    .eq("person_id", person.id)
    .neq("kind", "email")
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (touchError) console.error("[campaigns/personal] interactions read", touchError.message);
  for (const t of (touches ?? []) as { kind: string; subject: string | null; occurred_at: string }[]) {
    facts.push({ date: day(t.occurred_at), source: "crm", fact: `Last contact was a ${t.kind}${t.subject ? `: ${t.subject}` : ""} on ${day(t.occurred_at)}` });
  }
  return facts;
};

// The last three emails we sent them and whether they opened, so the agent
// never repeats itself and can notice silence.
const pastEmails: Source = async (person) => {
  const { data, error } = await companyOs.from("interactions").select("subject, occurred_at, metadata")
    .eq("person_id", person.id)
    .eq("kind", "email")
    .order("occurred_at", { ascending: false })
    .limit(3);
  if (error) {
    console.error("[campaigns/personal] past emails read", error.message);
    return [];
  }
  const sent = (data ?? []) as { subject: string | null; occurred_at: string; metadata: { resend_email_id?: string } | null }[];
  if (sent.length === 0) return [];
  const ids = sent.map((s) => s.metadata?.resend_email_id).filter((id): id is string => Boolean(id));
  const opened = new Set<string>();
  if (ids.length > 0) {
    const { data: events, error: eventsError } = await companyOs.from("email_events").select("resend_email_id")
      .in("resend_email_id", ids)
      .in("event_type", ["opened", "clicked"]);
    if (eventsError) console.error("[campaigns/personal] events read", eventsError.message);
    for (const e of (events ?? []) as { resend_email_id: string }[]) opened.add(e.resend_email_id);
  }
  return sent.map((s) => {
    const id = s.metadata?.resend_email_id;
    const outcome = id ? (opened.has(id) ? "opened" : "not opened") : "outcome unknown";
    return { date: day(s.occurred_at), source: "past_emails" as const, fact: `We emailed them "${s.subject ?? "(no subject)"}" on ${day(s.occurred_at)} (${outcome})` };
  });
};

// Tags on the person, which is how a programme's cohort is marked.
const tags: Source = async (person) => {
  const { data: links, error } = await tagsOfPerson(person.id);
  if (error) {
    console.error("[campaigns/personal] taggables read", error.message);
    return [];
  }
  return (links ?? []).flatMap((r) => {
    const tag = one(r.tags);
    return tag ? [{ date: day(r.created_at), source: "tags" as const, fact: `Tagged "${tag.label}" since ${day(r.created_at)}` }] : [];
  });
};

const SOURCES: Record<SourceKey, Source> = { learner_progress: learnerProgress, coaching, crm, past_emails: pastEmails, tags };

// Every ticked source, in parallel; a source that throws contributes nothing.
export async function gatherFacts(person: Recipient, keys: SourceKey[], now: Date = new Date()): Promise<Fact[]> {
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        return await SOURCES[key](person, now);
      } catch (err) {
        console.error(`[campaigns/personal] source ${key} failed for ${person.id}:`, err instanceof Error ? err.message : String(err));
        return [];
      }
    }),
  );
  return results.flat().sort((a, b) => b.date.localeCompare(a.date));
}
