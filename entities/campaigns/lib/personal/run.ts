import { z } from "zod/v4";
import { getBrandProfile } from "../brand-profiles";
import { getAudience, resolveAudienceIds } from "../audiences";
import { checkSendGate } from "../broadcasts";
import { nextSendInstant, zoneFor } from "../send-window";
import { brandPreamble, callWriterModel } from "../writer/model";
import { fillPrompt } from "@/kernel/ai/prompts";
import { WRITER_PERSONAL_DRAFT_PROMPT } from "./run.prompt";
import { insertMessage, lastSentAt, latestMessageByPerson, latestSkill, loadRecipients } from "./data";
import { dueReason, hasNews, landingStatus, validationErrors } from "./rules";
import { gatherFacts } from "./sources";
import type { AgentRow, Fact, Recipient, SkillRow } from "./types";

// A personal email agent's run: for each person who is due, gather the facts
// the ticked sources know, write from the skill, validate, land. One tick of
// the hourly cron works through as many people as its time budget allows and
// leaves the rest for the next tick; a person is due only once per cadence,
// so nothing is lost by waiting an hour. The dry run is the same three steps
// for one person with nothing landed: that is how a skill is tuned.

const draftOutput = z.object({
  subject: z.string().describe("At most 80 characters. A sentence about this person, not a headline."),
  body_md: z.string().describe("Markdown. Addresses the person by first name. Says only what the facts say. Blank lines between paragraphs. No headings, no lists, no placeholders."),
  facts_used: z.array(z.string()).describe("The gathered facts the email draws on, each copied exactly as given."),
});

export type Draft = { subject: string; bodyMd: string; factsUsed: string[] };

export type DraftResult =
  | { ok: true; draft: Draft; errors: string[] }
  | { ok: false; error: string };

// Write one email for one person from the skill and their facts, then check it.
// `errors` is what the validator would hold it for; empty means it passes.
export async function draftForPerson(agent: AgentRow, skill: SkillRow, person: Recipient, facts: Fact[]): Promise<DraftResult> {
  const profile = agent.brandId ? await getBrandProfile(agent.brandId) : null;
  const preamble = profile ? brandPreamble(profile) : `# Brand: ${agent.brandName ?? "(none)"}`;
  const system = fillPrompt(WRITER_PERSONAL_DRAFT_PROMPT.system, {
    preamble,
    firstName: person.firstName || "there",
    maxWords: agent.maxWords,
    skill: skill.bodyMd,
  });
  const user = fillPrompt(WRITER_PERSONAL_DRAFT_PROMPT.user, {
    name: person.name,
    email: person.email,
    facts: facts.map((f) => `- ${f.date}: ${f.fact} [${f.source}]`).join("\n"),
  });

  const r = await callWriterModel({ step: "personal-draft", prompt: WRITER_PERSONAL_DRAFT_PROMPT, system, user, schema: draftOutput });
  if (!r.ok) return r;
  const draft: Draft = { subject: r.data.subject.trim(), bodyMd: r.data.body_md.trim(), factsUsed: r.data.facts_used.map((f) => f.trim()) };
  const errors = validationErrors({ ...draft, facts, skillMd: skill.bodyMd, maxWords: agent.maxWords, firstName: person.firstName });
  return { ok: true, draft, errors };
}

export type DryRunResult =
  | { ok: true; person: Recipient; facts: Fact[]; draft: Draft; errors: string[]; skipped: string | null }
  | { ok: false; error: string };

// Gather, write and validate for one person, landing nothing. The send gate
// and the cadence are reported, not enforced, so a skill can be tuned on
// anyone in the audience.
export async function dryRun(agent: AgentRow, personId: string, now: Date = new Date()): Promise<DryRunResult> {
  const skill = await latestSkill(agent.id);
  if (!skill) return { ok: false, error: "The agent has no skill version yet." };
  const { rows, error } = await loadRecipients([personId]);
  if (error) return { ok: false, error };
  const person = rows[0];
  if (!person) return { ok: false, error: "Person not found." };
  const gate = await checkSendGate(person.id, person.email);
  const skipped = gate.verdict === "send" ? null : gate.verdict === "suppress" ? gate.reason : gate.message;
  const facts = await gatherFacts(person, agent.sources, now);
  const drafted = await draftForPerson(agent, skill, person, facts);
  if (!drafted.ok) return drafted;
  return { ok: true, person, facts, draft: drafted.draft, errors: drafted.errors, skipped };
}


export type RunSummary = {
  agentId: string;
  audience: number;
  due: number;
  drafted: string[];
  held: string[];
  skipped: { personId: string; reason: string }[];
  notDue: number;
  remaining: number;
  error?: string;
};

// The earliest moment the message may go: the agent's send hour in the
// person's zone, tomorrow if that hour has passed today.
function sendAfterFor(agent: AgentRow, person: Recipient, now: Date): string {
  const { zone } = zoneFor(person);
  return nextSendInstant({ weekdays: [0, 1, 2, 3, 4, 5, 6], hour: agent.sendHour }, zone, now).toISOString();
}

// One tick of the agent. Works through the due people in audience order until
// `budgetMs` has passed or `limit` have been written, then reports what is
// left. Every outcome for a due person lands as a row: drafted, held or
// skipped with its reason, so the queue is the whole story of the run.
export async function runAgent(agent: AgentRow, opts: { now?: Date; limit?: number; budgetMs?: number } = {}): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 10;
  const budgetMs = opts.budgetMs ?? 200_000;
  const started = Date.now();
  const summary: RunSummary = { agentId: agent.id, audience: 0, due: 0, drafted: [], held: [], skipped: [], notDue: 0, remaining: 0 };

  const skill = await latestSkill(agent.id);
  if (!skill) return { ...summary, error: "The agent has no skill version yet." };
  const audience = await getAudience(agent.audienceId);
  if (!audience) return { ...summary, error: "The agent's audience no longer exists." };
  const resolved = await resolveAudienceIds(audience.rules);
  if (resolved.error) return { ...summary, error: resolved.error };
  const [recipients, latest] = await Promise.all([loadRecipients(resolved.ids), latestMessageByPerson(agent.id)]);
  if (recipients.error) return { ...summary, error: recipients.error };
  if (latest.error) return { ...summary, error: latest.error };
  summary.audience = recipients.rows.length;

  const due = recipients.rows.filter((p) => dueReason(latest.rows.get(p.id) ?? null, agent.cadenceDays, now) === null);
  summary.notDue = recipients.rows.length - due.length;
  summary.due = due.length;

  let written = 0;
  let passed = 0;
  let index = 0;
  for (const person of due) {
    if (written >= limit || Date.now() - started > budgetMs) break;
    index += 1;
    const land = async (row: Parameters<typeof insertMessage>[0]) => {
      const saved = await insertMessage(row);
      if (!saved.ok) console.error(`[campaigns/personal] could not land a message for ${person.id}: ${saved.error}`);
      return saved.ok ? saved.data.id : null;
    };
    const skip = async (reason: string) => {
      summary.skipped.push({ personId: person.id, reason });
      await land({ agentId: agent.id, skillId: skill.id, personId: person.id, status: "skipped", skipReason: reason });
    };

    const gate = await checkSendGate(person.id, person.email);
    if (gate.verdict !== "send") {
      await skip(gate.verdict === "suppress" ? gate.reason : gate.message);
      continue;
    }
    const facts = await gatherFacts(person, agent.sources, now);
    const sentAt = latest.rows.get(person.id)?.sentAt ?? (await lastSentAt(agent.id, person.id));
    if (!hasNews(facts, sentAt)) {
      await skip("nothing new to say");
      continue;
    }
    const drafted = await draftForPerson(agent, skill, person, facts);
    if (!drafted.ok) {
      const id = await land({ agentId: agent.id, skillId: skill.id, personId: person.id, status: "held", holdReason: `the writer failed: ${drafted.error}`, facts });
      if (id) summary.held.push(id);
      continue;
    }
    written += 1;
    const sendAfter = sendAfterFor(agent, person, now);
    const base = { agentId: agent.id, skillId: skill.id, personId: person.id, subject: drafted.draft.subject, bodyMd: drafted.draft.bodyMd, facts, sendAfter };
    if (drafted.errors.length > 0) {
      const id = await land({ ...base, status: "held", holdReason: drafted.errors.join(" ") });
      if (id) summary.held.push(id);
      continue;
    }
    const landing = landingStatus(agent.reviewMode, agent.sampleSize, passed);
    passed += 1;
    const id = await land({ ...base, status: landing.status, holdReason: landing.holdReason });
    if (id) (landing.status === "held" ? summary.held : summary.drafted).push(id);
  }
  summary.remaining = due.length - index;
  return summary;
}
