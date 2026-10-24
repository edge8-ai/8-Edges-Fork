import { latestApproval } from "@/kernel/approvals/waiting";
import { matchRecipients } from "./checks";
import { loadRunForMeeting, type FollowupRun } from "./data";
import { chainItems, type ChainItem } from "./items";
import { senderFor } from "./people";
import { companyContacts, meetingScreen, peopleByIds, type ScreenRecord } from "./sources";
import { MEETING_FOLLOWUP } from "./step-kit";

// What the meeting page's "Actions and follow-up" panel shows (Z.13, the After
// artboard). A failed read throws, so the page errors rather than showing a
// meeting with a run as one that never started.

/** The boards facts the panel shows, read by the route through boards' door (crm may not import boards). */
export type MeetingCards = {
  boards: { id: string; name: string }[];
  cards: Record<string, { href: string; boardName: string; assigneeName: string | null }>;
  wouldGoOn: string | null;
};

export type PanelContact = { personId: string; name: string; inMeeting: boolean };

export type PanelRun = Pick<
  FollowupRun,
  "id" | "mode" | "step" | "error" | "skipReason" | "commitments" | "subject" | "bodyMd" | "toPersonIds" | "version" | "approverPersonId" | "shadowVerdict" | "sentAt"
>;

export type FollowupPanelData = {
  run: PanelRun | null;
  items: ChainItem[];
  contacts: PanelContact[];
  approverName: string | null;
  /** Whether the email goes from the approver's own address (on the sending domain), or from the default sender. */
  fromApprover: boolean;
  /** The version the pending approval asks about, or null when none is pending. */
  pendingVersion: string | null;
  /** What the transcript screen flagged, for the approver to read beside the draft. */
  screen: ScreenRecord | null;
};

export async function followupPanelData(meeting: { id: string; companyId: string; attendees: string[] }): Promise<FollowupPanelData> {
  const run = await loadRunForMeeting(meeting.id);
  if (!run) return { run: null, items: [], contacts: [], approverName: null, fromApprover: false, pendingVersion: null, screen: null };
  const [items, contacts, approver, latest, screen] = await Promise.all([
    chainItems(meeting.id),
    companyContacts(meeting.companyId),
    run.approverPersonId ? peopleByIds([run.approverPersonId]) : Promise.resolve([]),
    latestApproval(MEETING_FOLLOWUP, run.id),
    meetingScreen(meeting.id),
  ]);
  const attended = new Set(matchRecipients(meeting.attendees, contacts));
  return {
    run: {
      id: run.id,
      mode: run.mode,
      step: run.step,
      error: run.error,
      skipReason: run.skipReason,
      commitments: run.commitments,
      subject: run.subject,
      bodyMd: run.bodyMd,
      toPersonIds: run.toPersonIds,
      version: run.version,
      approverPersonId: run.approverPersonId,
      shadowVerdict: run.shadowVerdict,
      sentAt: run.sentAt,
    },
    items,
    contacts: contacts
      .map((c) => ({ personId: c.personId, name: c.name, inMeeting: attended.has(c.personId) }))
      .sort((a, b) => Number(b.inMeeting) - Number(a.inMeeting) || a.name.localeCompare(b.name)),
    approverName: approver[0]?.name ?? null,
    fromApprover: senderFor(approver[0]?.email ?? null).from !== null,
    pendingVersion: latest?.state === "pending" && typeof latest.metadata.version === "string" ? latest.metadata.version : null,
    screen,
  };
}
