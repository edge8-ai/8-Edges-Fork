// What the Lark messages about an ask say (AK.5; spec 2026-11-16, "Notices go
// through the router"; GLOSSARY.md for the words). Pure: the senders in
// quest-messages.ts pass the fact and the Asks page's address and send what
// comes back.
//
// Every message carries one link, to the Asks page, and no button: there are
// no buttons in a Lark message, and every answer is given on the page. A
// reminder names nobody but the person it is sent to, and nothing here names
// who missed or counts anyone's misses (ADR 0020). There is no email: an ask
// reaches a person as an Inbox row and one of these messages.
import type { EventPayload } from "@/kernel/events";
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });
// Every time is shown in the business time zone and says so, in the words
// Training's routines use, so a person away from Vietnam is not misled.
// notifications/lib/quest-kinds.ts words the Inbox row of an ask the same way.
const ZONE = "Vietnam time";

/** One Lark message, and the line the router lists it by (its queue row and its shadow record). */
export type AskMessage = { subject: string; text: string };

const quoted = (s: string) => `“${s}”`;
const clip = (s: string) => (s.length > 160 ? `${s.slice(0, 159).trimEnd()}…` : s);

/** The lines as one message: the lines, then the link on its own line. */
const message = (subject: string, lines: readonly string[], url: string): AskMessage => ({ subject, text: `${lines.join("\n")}\n${url}` });

/** What an ask sends each person it is made of: who asked, what, when it is due, and whether an answer is expected. */
export function calledMessage(e: EventPayload<"quest.called">, url: string): AskMessage {
  const first = [...e.heads].sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt))[0];
  const due = `Due ${WHEN.format(new Date(first.closesAt))} (${ZONE}).`;
  const answer = e.required ? "Answer it on Asks." : "It's optional: nobody is expected to answer, but you can on Asks.";
  return message("An ask was made of you", [`${e.giverName?.trim() || "Someone"} asked you: ${quoted(clip(e.title))}`, `${due} ${answer}`], url);
}

/** The reminder the working day before an ask is due, to one person who has not answered it. */
export function dueSoonMessage(e: EventPayload<"quest.head.due_soon">, url: string): AskMessage {
  const lines = [`Reminder: ${quoted(clip(e.title))} is due ${WHEN.format(new Date(e.closesAt))} (${ZONE}).`, "You haven't answered yet. An answer after the due time shows as late."];
  return message("A reminder about an ask", lines, url);
}
