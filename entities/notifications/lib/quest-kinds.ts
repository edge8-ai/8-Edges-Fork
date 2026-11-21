// What Quests' facts say in somebody's inbox, and to whom (QS.2, reworded in
// ask words by AK.6; spec 2026-11-16, "Inbox rows"; ADR 0036). Pure, like
// kinds.ts: the recipients come from the payload, and these only decide
// whether there is anything to say and how to say it.
//
// Every row leads to the Asks page, where every answer is given. Nobody is told
// what they did themselves, so an asker who asked themselves, or a thanked
// answer whose author is the asker, hears nothing. Nothing here names who
// missed, or counts anyone's misses (ADR 0020). The Lark message of an ask and
// of its reminder are Quests' own (entities/quests/lib/message-words.ts, sent
// through the router, kind quests.ask), and this Inbox's words agree with
// them: this entity writes rows a person chooses to open and never pushes
// (entity.test.ts).
import type { EventPayload } from "@/kernel/events";
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { excerpt, quoted, type Draft } from "./kinds";

/** The one page every ask row leads to. A literal: the quests entity owns the route and its door is not for notifications to import (ASKS_HREF there). */
const ASKS_PATH = "/team/asks";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });
// The time says its zone, in the words Training's routines use, as Quests'
// own email and DM of the same summon do (entities/quests/lib/message-words.ts).
const ZONE = "Vietnam time";

function by(giverName: string | undefined): string {
  return giverName?.trim() || "Someone";
}

/** One inbox row per person asked, the asker left out: who asked, what, the earliest due time, and whether an answer is expected. */
export function calledDrafts(e: EventPayload<"quest.called">): Draft[] {
  const first = [...e.heads].sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt))[0];
  const due = `Due ${WHEN.format(new Date(first.closesAt))} (${ZONE}).`;
  // Required: everyone asked is expected to answer. Optional: nobody is, and the row says so.
  const answer = e.required ? "Answer it on Asks." : "It's optional: nobody is expected to answer, but you can on Asks.";
  const title = `${by(e.giverName)} asked you: ${quoted(e.title)}`;
  return [...new Set(e.personIds)]
    .filter((personId) => personId !== e.giverId)
    .map((personId) => ({ personId, kind: "quest.called", title, body: `${due} ${answer}`, adminHref: null, teamHref: ASKS_PATH, eventKey: e.questId }));
}

/** The answerer hears the asker's thanks, in the asker's words, once per answer. */
export function reactedDraft(e: EventPayload<"quest.reacted">): Draft | null {
  if (e.personId === e.giverId) return null;
  return {
    personId: e.personId,
    kind: "quest.reacted",
    title: `${by(e.giverName)} thanked you for your answer to ${quoted(e.title)}`,
    body: excerpt(e.line),
    adminHref: null,
    teamHref: ASKS_PATH,
    eventKey: `${e.headId}:${e.personId}`,
  };
}
