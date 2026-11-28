// The manager's one question (QS.9; spec 2026-10-20, story 55, "Claude" and
// "Access"; ADR 0020): "who among my reports missed <one named Bounty>?",
// asked of the team assistant. It is the manager report (quest-report.ts)
// reached by a Bounty's name instead of the report's picker: the name is
// resolved to exactly one Bounty among the picker's own options, and that one
// Bounty's report is read with readQuestReport, which applies `reaches` (the
// reader's quests.report reach, plus the Giver of a required Bounty) from the
// reader's own resolved access. A manager who is not an admin cannot open the
// admin report page, so today this question is their way to it.
//
// It is narrower than the admin page on purpose (Khoa may widen it): a reader
// whose quests.report reach is not everyone may name only a Bounty that is
// open or closed within the board's own window (RECENT_DAYS), so the "matches
// several" question back never lists older titles; and when they reach nobody
// on the Bounty they named, the answer says only that, with none of its heads
// or its count.
//
// One Bounty at a time, always. A name that matches several Bounties is asked
// back with their titles, never answered for all of them, and nothing here
// iterates quests to say anything about a person: "who misses the most?" has
// no read here or anywhere in the entity, and the assistant says so.
import { saigonDue } from "./campfires-model";
import { matchingName } from "./name-match";
import { readQuestReport, readReportQuests, type QuestReport, type ReportQuestOption, type ReportReader } from "./quest-report";
import { RECENT_DAYS } from "./quests-read";
import type { Standing } from "./standing";

const REPORT_ATOM = "quests.report";
/** A target no relationship can name: only a reach of everyone covers it. */
const NOBODY = { person: "\u0000nobody" };

/** How the report's Standing reads in the assistant's answer. */
const STANDING_WORD: Record<Standing, string> = {
  called: "Called, no answer yet",
  accepted: "Accepted, not turned in",
  turned_in: "Turned in",
  handed_back: "Handed back",
  missed: "Missed",
};

/** One Bounty's report as the assistant tells it, or only that the reader reaches nobody on it. */
export type ReportAnswer =
  | {
      bounty: { title: string; state: "open" | "closed" | "withdrawn"; required: boolean; giver: string; closed: string | null };
      heads: { ask: string; due: string; closed: boolean }[];
      /** How many the Giver called, the count the whole party already sees. */
      called: number;
      /** The people the reader reaches on this Bounty, anyone with a Missed first; one Standing per head, null where not called on it. */
      people: { name: string; heads: (string | null)[] }[];
    }
  | { bounty: { title: string }; nobody: string };

export type ReportQuestion = { ok: true; answer: ReportAnswer } | { ok: false; error: string };

/** What a reader reaching nobody on a Bounty is told, and nothing more. */
export const REACHES_NOBODY = "None of the people you manage were on it.";

/** A short label for a Bounty the name could mean, so the asker can say which. */
function labelOf(o: ReportQuestOption): string {
  if (o.state === "open") return `${o.title} (open)`;
  return o.closedAt ? `${o.title} (closed ${saigonDue(o.closedAt)})` : `${o.title} (closed)`;
}

/** The Bounties a reader may name: every one for a reach of everyone, else the open ones and those closed within the board's window. */
export function nameableBounties(options: readonly ReportQuestOption[], reachesEveryone: boolean, now: Date): ReportQuestOption[] {
  if (reachesEveryone) return [...options];
  const cutoff = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString();
  return options.filter((o) => o.state === "open" || (o.closedAt !== null && o.closedAt >= cutoff));
}

/** The one Bounty a name means among the options: an exact title wins, else the single title containing it. Several, or none, are a question back. */
export function pickBounty(options: readonly ReportQuestOption[], name: string): { ok: true; id: string } | { ok: false; error: string } {
  if (!name.trim()) return { ok: false, error: "Say which Bounty you mean, by its title." };
  const found = matchingName(options, name, (o) => o.title);
  if (found.length === 1) return { ok: true, id: found[0]!.id };
  if (found.length === 0) return { ok: false, error: `No Bounty you can ask about is called "${name}". Ask for its title.` };
  const shown = found.slice(0, 8).map(labelOf);
  return { ok: false, error: `"${name}" matches more than one Bounty: ${shown.join("; ")}${found.length > 8 ? "; and more" : ""}. Ask which one.` };
}

/** The report as the assistant says it: Standing in words, due times in Saigon; only its title when the reader reaches nobody on it. */
export function answerOf(report: QuestReport): ReportAnswer {
  if (report.rows.length === 0) return { bounty: { title: report.quest.title }, nobody: REACHES_NOBODY };
  return {
    bounty: {
      title: report.quest.title,
      state: report.quest.state,
      required: report.quest.required,
      giver: report.quest.giverName,
      closed: report.quest.closedAt ? saigonDue(report.quest.closedAt) : null,
    },
    heads: report.heads.map((h) => ({ ask: h.ask, due: saigonDue(h.closesAt), closed: h.closed })),
    called: report.called,
    people: report.rows.map((r) => ({
      name: r.name,
      heads: r.heads.map((c) => (c ? `${STANDING_WORD[c.standing]}${c.late ? " late" : ""}` : null)),
    })),
  };
}

/**
 * Who the reader reaches on the one Bounty a name means, and where each stands
 * on each head. Every read raises on failure, because a report from a failed
 * read would say nobody missed.
 */
export async function askQuestReport(reader: ReportReader, bountyName: string, now: Date = new Date()): Promise<ReportQuestion> {
  if (!reader.access.may(REPORT_ATOM)) return { ok: false, error: "Only a manager or an admin may ask who missed a Bounty." };
  const options = nameableBounties(await readReportQuests(), reader.access.may(REPORT_ATOM, NOBODY), now);
  const picked = pickBounty(options, bountyName);
  if (!picked.ok) return picked;
  const report = await readQuestReport(reader, picked.id, now);
  if (!report) return { ok: false, error: `No Bounty you can ask about is called "${bountyName}". Ask for its title.` };
  return { ok: true, answer: answerOf(report) };
}
