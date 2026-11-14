// What Quests' email and Lark DM say (QS.2; spec 2026-10-20, "Notifications:
// email, Lark and the inbox"; GLOSSARY.md for the words). Pure: the senders in
// quest-messages.ts pass the fact and the page's address and send what comes
// back.
//
// Every message carries one link, to the Quests page, and no button: there are
// no buttons in Lark or in email, and every answer is given on the page. A
// reminder names nobody but the person it is sent to, and nothing here names
// who missed or counts anyone's misses (ADR 0020).
import type { EventPayload } from "@/kernel/events";
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { escapeHtml } from "@/kernel/config/html";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });
// Every time is shown in the business time zone and says so, in the words
// Training's routines use, so a person away from Vietnam is not misled.
// notifications/lib/quest-kinds.ts words the inbox row of a summon the same way.
const ZONE = "Vietnam time";

/** One message on both channels: the email's subject and body, and the DM's text. */
export type QuestMessage = { subject: string; text: string; html: string };

const quoted = (s: string) => `“${s}”`;
const clip = (s: string) => (s.length > 160 ? `${s.slice(0, 159).trimEnd()}…` : s);

/** The lines as one message: the DM is the lines and then the link; the email is each line a paragraph and the link, escaped, since titles and asks are typed by people. */
function message(subject: string, lines: readonly string[], url: string): QuestMessage {
  const html = `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}<p><a href="${escapeHtml(url)}">Open Quests</a></p>`;
  return { subject, text: `${lines.join("\n")}\n${url}`, html };
}

/** What a summon sends each person called: who called, the Bounty, its first due time and how to answer. */
export function calledMessage(e: EventPayload<"quest.called">, url: string): QuestMessage {
  const first = [...e.heads].sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt))[0];
  const due = `${WHEN.format(new Date(first.closesAt))} (${ZONE})`;
  const subject = `${e.giverName?.trim() || "A Giver"} called you on a Bounty: ${quoted(e.title)}`;
  const when = e.heads.length === 1 ? `Due ${due}.` : `${e.heads.length} heads, the first due ${due}.`;
  // Required: everyone called is committed. Optional: Accept opts in, and declining is fine.
  const answer = e.required ? "It's required: turn it in on Quests." : "Accept it on Quests if you're in, or decline it there.";
  return message(subject, [subject, `${when} ${answer}`], url);
}

/** The reminder two hours before a head's due time, to one person still out on it. */
export function dueSoonMessage(e: EventPayload<"quest.head.due_soon">, url: string): QuestMessage {
  const subject = `Due at ${TIME.format(new Date(e.closesAt))} ${ZONE}: ${quoted(e.title)}`;
  const lines = [`${quoted(e.title)} is due at ${WHEN.format(new Date(e.closesAt))} (${ZONE}).`, `This head asks: ${clip(e.ask)}`, "Turn it in on Quests. A late Turn-in still counts in full."];
  return message(subject, lines, url);
}
