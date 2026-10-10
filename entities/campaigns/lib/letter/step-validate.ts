import { companyOs } from "@/kernel/data/supabase";
import { renderBroadcast, sendMarketingEmail } from "../marketing-email";
import { utmCampaignFor } from "../marketing-email-utm";
import { resolveBroadcastBlocks } from "@/entities/campaigns/lib/broadcast-blocks";
import { saveNotes } from "./data";
import { testRecipient, type StepRunner } from "./types";
import { type GreetedPerson, GREETING_COLUMNS, greetingName } from "@/kernel/config/people-name";

// Step 6: the email as an inbox will receive it. Renders both parts with
// tracking on, checks what a person would otherwise have to open the source
// to see, then sends the [TEST] to the approver so the approval that follows
// is of a real email. The run parks at ready after this; nothing sends.

const MAX_HTML_BYTES = 100_000; // Gmail clips above about 102 KB, with the unsubscribe link at the bottom.

export const runValidate: StepRunner = async ({ letter }) => {
  const to = testRecipient();
  const { data: people, error } = await companyOs.from("people").select(`id, ${GREETING_COLUMNS}`).eq("email", to).limit(1);
  if (error) return { ok: false, error: `Validate: ${error.message}` };
  const person = (people ?? [])[0] as ({ id: string } & GreetedPerson) | undefined;
  if (!person) return { ok: false, error: `Validate: no CRM contact matches ${to}, so the test cannot be addressed.` };

  const blocks = await resolveBroadcastBlocks(letter.blocks);
  const utmCampaign = utmCampaignFor({ subject: letter.subject, date: new Date().toISOString() });
  const { html, text } = await renderBroadcast({
    subject: letter.subject,
    preheader: letter.preheader,
    bodyMd: letter.bodyMd,
    blocks,
    unsubscribeLink: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/unsubscribe/?token=validate`,
    utmCampaign,
  });

  const checklist: string[] = [];
  const bytes = Buffer.byteLength(html, "utf8");
  checklist.push(`HTML ${Math.round(bytes / 1024)} KB${bytes > MAX_HTML_BYTES ? " (over the Gmail clip limit)" : ""}`);
  checklist.push(`Plain text ${text.trim().length > 0 ? "present" : "missing"}`);
  const links = Array.from(html.matchAll(/href="(https?:[^"]+)"/g)).map((m) => m[1].replace(/&amp;/g, "&"));
  const untagged = links.filter((l) => !l.includes("unsubscribe") && !l.includes("utm_content="));
  checklist.push(`${links.length} links, ${untagged.length} without tracking`);
  checklist.push(`Unsubscribe link ${process.env.UNSUBSCRIBE_SECRET ? "will be signed" : "MISSING: UNSUBSCRIBE_SECRET is not set"}`);
  checklist.push(`Greeting: "Hi ${greetingName(person, "there")},"`);

  const failures: string[] = [];
  if (bytes > MAX_HTML_BYTES) failures.push(`the HTML is ${Math.round(bytes / 1024)} KB, over the Gmail clip limit`);
  if (!text.trim()) failures.push("the plain-text part is empty");
  if (untagged.length) failures.push(`${untagged.length} link(s) carry no tracking`);
  if (!process.env.UNSUBSCRIBE_SECRET) failures.push("UNSUBSCRIBE_SECRET is not set, so the email would carry no unsubscribe link");
  if (blocks.posts.length !== 3) failures.push(`${blocks.posts.length} post(s) resolved; a letter carries exactly 3`);
  if (failures.length) {
    await saveNotes(letter, { checklist });
    return { ok: false, error: `Validate: ${failures.join("; ")}.` };
  }

  const sent = await sendMarketingEmail({
    to,
    personId: person.id,
    subject: `[TEST] ${letter.subject}`,
    preheader: letter.preheader,
    bodyMd: letter.bodyMd,
    blocks,
    firstName: greetingName(person, null),
    utmCampaign,
    from: letter.fromEmail,
    replyTo: letter.replyTo,
    campaignId: letter.id,
    logSource: "letter_agent_test",
  });
  if (!sent.ok) return { ok: false, error: `Validate: the test send failed: ${sent.error}` };
  const noted = await saveNotes(letter, { checklist, testSentTo: to });
  if (!noted.ok) return noted;
  return { ok: true, summary: `Test sent to ${to}. ${checklist.join(" · ")}` };
};
