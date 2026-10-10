import { createHash } from "node:crypto";
import { screenUntrusted } from "@/kernel/ai/screen";
import { draftFollowup, extractActions, MAX_TRANSCRIPT_CHARS } from "./ai";
import { companyDomain, draftProblems, evidenceHolds, foldEvidence, matchRecipients, ownDomain, suppliedName, wantsFollowupEmail } from "./checks";
import { updateRunAt, type FollowupRun, type RunMode } from "./data";
import { chainItems, insertChainItems, type NewItem } from "./items";
import { resolveApprover, senderFor } from "./people";
import { companyContacts, loadChainMeeting, recordScreen, rosterNames, type ChainMeeting } from "./sources";
import { closeGone, fail, inShadow, meetingGone, moved, ok, type Result } from "./step-kit";
import { CARDS_ONLY_REASON, type FollowupState } from "./steps";
import { followupVersion } from "./version";

// The meeting-to-actions run's first three steps (Z.13, spec section 3):
// gather reads the meeting, extract asks the model for the agreed actions and
// writes them once, draft asks for the follow-up and checks it. None of them
// reaches anyone outside: a shadow run ends after the draft (./run.ts).

// ── gather ───────────────────────────────────────────────────────────────────

export async function gather(run: FollowupRun): Promise<Result> {
  const meeting = await loadChainMeeting(run.meetingId);
  const gone = meetingGone(meeting);
  if (gone || !meeting) return closeGone(run, "gather", gone ?? "The meeting is gone.");
  if (!meeting.transcript.trim()) return closeGone(run, "gather", "The meeting has no transcript.");
  const contacts = await companyContacts(meeting.companyId as string);
  const shadow = inShadow(run);
  const landed = await updateRunAt(run.id, "gather", {
    transcript_sha256: createHash("sha256").update(meeting.transcript).digest("hex"),
    contact_ids: contacts.map((c) => c.personId),
    step: "extract",
    ...(shadow && run.mode !== "shadow" ? { mode: "shadow" as RunMode } : {}),
  });
  if (!landed) return moved(run, "gather");
  return ok(run, "gather", "extract", `Read the meeting: ${meeting.transcript.length.toLocaleString()} characters of transcript, ${contacts.length} client contacts with an address.`);
}

// ── extract ──────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Where the run goes once its items are written: the draft, or closed when the meeting gets no email. */
function afterExtract(meeting: ChainMeeting, shadow: boolean): { step: FollowupState; skip_reason?: string } {
  if (wantsFollowupEmail(meeting.meetingType)) return { step: "draft" };
  return shadow ? { step: "shadowed" } : { step: "skipped", skip_reason: CARDS_ONLY_REASON };
}

export async function extract(run: FollowupRun): Promise<Result> {
  const meeting = await loadChainMeeting(run.meetingId);
  const gone = meetingGone(meeting);
  if (gone || !meeting) return closeGone(run, "extract", gone ?? "The meeting is gone.");
  const shadow = inShadow(run);
  const modePatch = shadow && run.mode !== "shadow" ? { mode: "shadow" as RunMode } : {};
  const next = afterExtract(meeting, shadow);

  // Idempotent: a retry after the items were written advances without asking
  // the model again.
  const existing = await chainItems(run.meetingId);
  if (existing.length > 0) {
    if (!(await updateRunAt(run.id, "extract", { ...next, ...modePatch }))) return moved(run, "extract");
    return ok(run, "extract", next.step, `The ${existing.length} actions found before were kept; the model was not asked again.`);
  }

  const [roster, contacts] = await Promise.all([rosterNames(), companyContacts(meeting.companyId as string)]);
  const rosterSet = new Set(roster);
  const clientNames = [...new Set([...contacts.flatMap((c) => c.names), ...meeting.attendees.filter((a) => !rosterSet.has(a))])];
  // Screen the transcript before the model reads it (kernel/ai/screen.ts): it
  // flags instruction-shaped lines and links elsewhere without deleting them,
  // and the flags are kept on the meeting for the approver to read beside the
  // draft. Recorded before the model call, so a failed call still leaves them.
  const screened = screenUntrusted(meeting.transcript, {
    maxChars: MAX_TRANSCRIPT_CHARS,
    allowedDomains: [companyDomain(meeting.companyWebsite), ownDomain()].filter((d): d is string => Boolean(d)),
  });
  await recordScreen(meeting.id, { flags: screened.flags.slice(0, 50), truncated: screened.truncated, at: new Date().toISOString() });
  const asked = await extractActions({ screened, summary: meeting.summary, edge8Names: roster, clientNames });
  if (!asked.ok) return fail(run, "extract", `The model's answer could not be used: ${asked.error}`);

  const folded = foldEvidence(meeting.transcript);
  let dropped = 0;
  const kept: Omit<NewItem, "position">[] = [];
  const take = (raw: (typeof asked.data.items)[number], forcedClient: boolean) => {
    if (!evidenceHolds(raw.evidence, folded)) {
      dropped += 1;
      return;
    }
    const side = forcedClient ? "client" : raw.owner_side;
    const ownerName = suppliedName(raw.owner_name, side === "client" ? clientNames : roster) ?? suppliedName(raw.owner_name, [...roster, ...clientNames]);
    const title = clip(raw.title.trim(), 200);
    if (!title) {
      dropped += 1;
      return;
    }
    kept.push({
      title,
      detail: raw.detail.trim() ? clip(raw.detail.trim(), 1000) : null,
      ownerSide: side,
      ownerName,
      evidence: clip(raw.evidence.trim(), 500),
      dueDate: raw.due_date && ISO_DATE.test(raw.due_date) ? raw.due_date : null,
      fileState: side === "client" ? "client" : shadow ? "proposed" : "to_file",
    });
  };
  for (const raw of asked.data.items) take(raw, false);
  for (const raw of asked.data.client_items) take(raw, true);
  // Edge8's actions first, then the client's, numbered once: the number is the
  // item's half of its card key, card:<meeting>:<n>.
  const ordered = [...kept.filter((k) => k.ownerSide !== "client"), ...kept.filter((k) => k.ownerSide === "client")].map((k, i) => ({ ...k, position: i + 1 }));
  const commitments = asked.data.commitments.map((c) => clip(c.trim(), 300)).filter(Boolean).slice(0, 20);

  // Commitments first, then the items, then the step: a crash between the
  // last two leaves items a retry finds and keeps.
  if (!(await updateRunAt(run.id, "extract", { commitments }))) return moved(run, "extract");
  await insertChainItems(run.meetingId, ordered);
  if (!(await updateRunAt(run.id, "extract", { ...next, ...modePatch }))) return moved(run, "extract");
  const edge8 = ordered.filter((o) => o.ownerSide !== "client").length;
  return ok(
    run,
    "extract",
    next.step,
    `Found ${ordered.length} actions (${edge8} for Edge8, ${ordered.length - edge8} for the client)${shadow ? ", proposed in shadow" : ""}; dropped ${dropped} whose quoted line is not in the transcript.`,
  );
}

// ── draft ────────────────────────────────────────────────────────────────────

export async function draft(run: FollowupRun): Promise<Result> {
  const meeting = await loadChainMeeting(run.meetingId);
  const gone = meetingGone(meeting);
  if (gone || !meeting) return closeGone(run, "draft", gone ?? "The meeting is gone.");
  const shadow = inShadow(run);
  const [items, contacts, approver] = await Promise.all([chainItems(run.meetingId), companyContacts(meeting.companyId as string), resolveApprover(meeting)]);
  const toPersonIds = matchRecipients(meeting.attendees, contacts);
  const recipients = contacts.filter((c) => toPersonIds.includes(c.personId));
  const asked = await draftFollowup({
    companyName: meeting.companyName ?? "the client",
    meetingDate: meeting.meetingDate,
    summary: meeting.summary,
    edge8Actions: items.filter((i) => i.ownerSide !== "client").map((i) => i.title),
    clientActions: items.filter((i) => i.ownerSide === "client").map((i) => (i.ownerName ? `${i.ownerName}: ${i.title}` : i.title)),
    recipientNames: recipients.map((r) => r.name),
    senderName: approver?.name ?? "The Edge8 team",
  });
  if (!asked.ok) return fail(run, "draft", `The model's draft could not be used: ${asked.error}`);
  const subject = asked.data.subject.trim();
  const bodyMd = asked.data.body_md.trim();
  const problems = draftProblems({ subject, bodyMd }, companyDomain(meeting.companyWebsite));
  if (problems.length > 0) return fail(run, "draft", `The draft failed its checks: ${problems.join(" ")}`);

  const { from } = senderFor(approver?.email ?? null);
  const version = followupVersion({ from, to: recipients.map((r) => r.email), subject, bodyMd });
  const next: FollowupState = shadow ? "shadowed" : "ask";
  const landed = await updateRunAt(run.id, "draft", {
    ai_subject: subject,
    ai_body_md: bodyMd,
    subject,
    body_md: bodyMd,
    to_person_ids: toPersonIds,
    contact_ids: contacts.map((c) => c.personId),
    approver_person_id: approver?.id ?? null,
    version,
    step: next,
    ...(shadow && run.mode !== "shadow" ? { mode: "shadow" as RunMode } : {}),
  });
  if (!landed) return moved(run, "draft");
  return ok(
    run,
    "draft",
    next,
    shadow
      ? `Drafted the follow-up for ${recipients.length} recipients; shadow, so nothing was asked or sent.`
      : `Drafted the follow-up for ${recipients.length} recipients${recipients.length === 0 ? " (none matched an attendee; the approver picks them)" : ""}.`,
  );
}
