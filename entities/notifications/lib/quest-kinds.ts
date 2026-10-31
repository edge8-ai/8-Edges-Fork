// What Quests' facts say in somebody's inbox, and to whom (QS.2; spec
// 2026-10-20, "Notifications: email, Lark and the inbox";
// entities/quests/GLOSSARY.md for the words). Pure, like kinds.ts: the
// recipients come from the payload, and these only decide whether there is
// anything to say and how to say it.
//
// Every row leads to the Quests page on the team hub, where every answer
// (accept, turn in, hand back, react) is given. Nobody is told what they did
// themselves, so a Giver who called themselves, or a Turn-in's author who is
// the Giver, hears nothing. Nothing here names who missed, or counts anyone's
// misses (ADR 0020). The email and the Lark DM of a summon and of the two-hour
// reminder are Quests' own (entities/quests/lib/quest-messages.ts): this entity
// writes rows a person chooses to open and never pushes (entity.test.ts).
import type { EventPayload } from "@/kernel/events";
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { excerpt, quoted, type Draft } from "./kinds";

/** The one page every quest row leads to. */
const QUESTS_PATH = "/team/quests";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });
// The time says its zone, in the words Training's routines use, as Quests'
// own email and DM of the same summon do (entities/quests/lib/message-words.ts).
const ZONE = "Vietnam time";

function by(giverName: string | undefined): string {
  return giverName?.trim() || "A Giver";
}

/** One inbox row per person called, the Giver left out: who called, the Bounty, its first due time and how to answer. */
export function calledDrafts(e: EventPayload<"quest.called">): Draft[] {
  const first = [...e.heads].sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt))[0];
  const due = `${WHEN.format(new Date(first.closesAt))} (${ZONE})`;
  const when = e.heads.length === 1 ? `Due ${due}.` : `${e.heads.length} heads, the first due ${due}.`;
  // Required: everyone called is committed. Optional: Accept opts in, and declining is fine.
  const answer = e.required ? "It's required: turn it in on Quests." : "Accept it on Quests if you're in, or decline it there.";
  const title = `${by(e.giverName)} called you on a Bounty: ${quoted(e.title)}`;
  return [...new Set(e.personIds)]
    .filter((personId) => personId !== e.giverId)
    .map((personId) => ({ personId, kind: "quest.called", title, body: `${when} ${answer}`, adminHref: null, teamHref: QUESTS_PATH, eventKey: e.questId }));
}

/** The Turn-in's author hears the Giver's Reaction, in the Giver's words, once per Turn-in. */
export function reactedDraft(e: EventPayload<"quest.reacted">): Draft | null {
  if (e.personId === e.giverId) return null;
  return {
    personId: e.personId,
    kind: "quest.reacted",
    title: `${by(e.giverName)} reacted to your Turn-in on ${quoted(e.title)}`,
    body: excerpt(e.line),
    adminHref: null,
    teamHref: QUESTS_PATH,
    eventKey: `${e.headId}:${e.personId}`,
  };
}
