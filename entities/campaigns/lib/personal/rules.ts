import { emDashError, wordCount } from "../writer/checks";
import type { Fact, ReviewMode } from "./types";

// The rules of a personal email run, as pure functions so each can be proved
// to block in a test: who is due, whether there is anything new to say, what
// the validator holds, and how a run splits into the sample a person reads and
// the rest.

const DAY_MS = 86_400_000;

export type LastMessage = { status: string; createdAt: string; sentAt: string | null } | null;

// A person is due when nothing is queued for them and their last outcome
// (sent or skipped) is older than the cadence. A skip parks the person for a
// cadence too, or the hourly cron would re-skip them every tick.
export function dueReason(last: LastMessage, cadenceDays: number, now: Date): string | null {
  if (!last) return null;
  if (["drafted", "held", "approved", "sending"].includes(last.status)) return `already ${last.status}`;
  const at = new Date(last.sentAt ?? last.createdAt).getTime();
  const days = (now.getTime() - at) / DAY_MS;
  if (days < cadenceDays) return `${last.status} ${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"} ago, cadence is ${cadenceDays}`;
  return null;
}

// Nothing new to say: no fact is dated after the last message we sent them.
export function hasNews(facts: Fact[], lastSentAt: string | null): boolean {
  if (facts.length === 0) return false;
  if (!lastSentAt) return true;
  const since = lastSentAt.slice(0, 10);
  return facts.some((f) => f.date > since);
}

const numbersIn = (text: string): string[] => text.match(/\d[\d,.]*/g)?.map((n) => n.replace(/[,.]$/, "")) ?? [];

// What the validator checks about a drafted message. `factsUsed` is what the
// writer says it drew on; every one must be a gathered fact, and every number
// the body states must appear in one of them or in the skill, so the email
// cannot invent a figure about the person.
export function validationErrors(input: {
  subject: string;
  bodyMd: string;
  factsUsed: string[];
  facts: Fact[];
  skillMd: string;
  maxWords: number;
  firstName: string;
}): string[] {
  const errors: string[] = [];
  const { subject, bodyMd } = input;
  if (!subject.trim()) errors.push("No subject.");
  if (subject.length > 80) errors.push(`Subject is ${subject.length} characters; at most 80.`);
  if (!bodyMd.trim()) errors.push("No body.");
  const words = wordCount(bodyMd);
  if (words > input.maxWords) errors.push(`Body is ${words} words; at most ${input.maxWords}.`);
  const placeholder = `${subject}\n${bodyMd}`.match(/\{[a-z_]+\}/i);
  if (placeholder) errors.push(`A placeholder was left in: ${placeholder[0]}.`);
  const dash = emDashError(`${subject}\n${bodyMd}`);
  if (dash) errors.push(dash);
  if (input.firstName && !bodyMd.includes(input.firstName)) errors.push(`The body never addresses ${input.firstName} by name.`);

  const known = new Set(input.facts.map((f) => f.fact));
  const unknown = input.factsUsed.filter((f) => !known.has(f));
  if (unknown.length > 0) errors.push(`Cites ${unknown.length} fact${unknown.length === 1 ? "" : "s"} that were not gathered: ${unknown[0].slice(0, 80)}`);
  if (input.factsUsed.length === 0 && input.facts.length > 0) errors.push("Cites no gathered fact; a personal email says something about the person.");

  const allowed = new Set([...input.factsUsed.flatMap(numbersIn), ...numbersIn(input.skillMd)]);
  const stray = numbersIn(bodyMd).filter((n) => !allowed.has(n));
  if (stray.length > 0) errors.push(`States a number that is in no cited fact: ${stray[0]}.`);
  return errors;
}

// How a run's written messages land. hold_all holds every one for a person;
// sample holds the first `sampleSize` and drafts the rest, which release when
// the sample is approved (the queue does that).
export function landingStatus(mode: ReviewMode, sampleSize: number, indexInRun: number): { status: "held" | "drafted"; holdReason: string | null } {
  if (mode === "hold_all") return { status: "held", holdReason: "review: every message of this agent is read before it sends" };
  if (indexInRun < sampleSize) return { status: "held", holdReason: `review: sample ${indexInRun + 1} of ${sampleSize} for this run` };
  return { status: "drafted", holdReason: null };
}
