"use server";

import { myReorderCommitments } from "./data/my-stack";
import { refreshCoachAndDirectory, refreshCoachList, refreshMember } from "./revalidate";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
// Concrete data files, not the module index: this module's client components
// import these actions, and the index re-exports the data layer, so importing
// the index here would close an index -> ui -> actions -> index cycle.
import { myUpdateCommitmentStatus } from "./data/member";
import {
  myAddCommitment,
  myDeleteCommitment,
  myUpdateCommitmentDetails,
} from "./data/member-commitments";
import { myDismissCardDone, myUpdateCommitmentPlan, myUpdateHowIWork } from "./data/commitment-owner-writes";
import { askNowOnCommitment } from "./data/ask-now";
import { getMyBragDocument } from "./data/member-history";
import { addMyNote, archiveMyNote } from "./data/member-notes";
import { saveMyPreferredSlot } from "./data/preferred-slot";
import { myUpdateGoalProgress, myWriteGoalLetter } from "./data/my-goals";
import { proposeMyDate } from "./data/proposals";
import { myAddTalkingPoint, myDeleteTalkingPoint } from "./data/talking-points";
import { saigonToday } from "@/kernel/config/dates";
import type { CommitmentStatus } from "./types";
import type { HowIWorkField } from "./how-i-work";
import type { Result } from "@/kernel/data/result";
import { parseInput, zDay, zId, zLooseText, zText } from "./schemas";
import { z } from "zod";

// What the MEMBER's actions accept (ticket 13). Every id here is still proved
// to sit on the actor's own profile by the writer below — this only says the
// shape arrived intact, which is the half nothing was checking.
const S = {
  id: z.object({ id: zId }),
  commitment: z.object({ commitmentId: zId }),
  status: z.object({
    commitmentId: zId,
    status: z.enum(["open", "on_track", "needs_attention", "completed", "dropped", "blocked"]),
    note: zLooseText(2_000),
  }),
  reorder: z.array(zId).max(500, "That is more cards than a column holds."),
  add: z.object({ title: zText(500, "Write the commitment first."), dueOn: zDay.nullable() }),
  edit: z.object({
    commitmentId: zId,
    title: zText(500, "The commitment needs a title."),
    dueOn: zDay.nullable(),
  }),
  plan: z.object({ commitmentId: zId, plan: zLooseText(1_000) }),
  letter: z.object({ goalId: zId, letter: zLooseText(1_000) }),
  howIWork: z.object({
    field: z.enum(["bestHours", "feedback", "quiet", "curious"]),
    value: zLooseText(1_000),
  }),
  body: z.object({ body: zText(2_000, "Write something first.") }),
  // A goal's number. Not negative, and finite: Infinity and NaN both survive a
  // JSON round trip as inputs a writer would happily store.
  goalProgress: z.object({
    goalId: zId,
    currentValue: z.number().finite("Give the number as it is now.").min(0, "A measure does not go below zero."),
  }),
  slot: z.object({
    time: z.string().regex(/^\d{2}:\d{2}$/, "Give the time as HH:MM.").nullable(),
  }),
  day: z.object({ dateISO: zDay }),
};

// Member-side commitment actions. Every one re-derives ownership server-side
// from the JWT actor; the commitment id is the only client input trusted, and
// only after it is proven to sit on the actor's own profile.
//
// Status and order are open to the member on ANY commitment on their profile,
// including what their coach set. Title, due date, and deletion are limited to
// what the member wrote themselves (created_by).

const done = (res: Result): Result => {
  if (res.ok) refreshMember();
  return res;
};

export async function updateMyCommitment(
  commitmentId: string,
  status: CommitmentStatus,
  note: string,
): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.status, { commitmentId, status, note });
  if (!p.ok) return p;
  return done(await myUpdateCommitmentStatus(actor, p.data.commitmentId, p.data.status, p.data.note));
}

// The order of the member's own column after a drag (K.66).
export async function reorderMyCommitments(orderedIds: string[]): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.reorder, orderedIds);
  if (!p.ok) return p;
  return done(await myReorderCommitments(actor, p.data));
}

export async function addMyCommitment(title: string, dueOn: string | null): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.add, { title, dueOn });
  if (!p.ok) return p;
  return done(await myAddCommitment(actor, p.data));
}

export async function editMyCommitment(
  commitmentId: string,
  title: string,
  dueOn: string | null,
): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.edit, { commitmentId, title, dueOn });
  if (!p.ok) return p;
  return done(await myUpdateCommitmentDetails(actor, p.data.commitmentId, p.data));
}

export async function deleteMyCommitment(commitmentId: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.commitment, { commitmentId });
  if (!p.ok) return p;
  return done(await myDeleteCommitment(actor, p.data.commitmentId));
}

// "When will you do it?" (L.1): the member's own sentence about the moment the
// work happens. Optional, uncounted, and never read as a date by anything.
export async function setMyCommitmentPlan(commitmentId: string, plan: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.plan, { commitmentId, plan });
  if (!p.ok) return p;
  return done(await myUpdateCommitmentPlan(actor, p.data.commitmentId, p.data.plan));
}

// The letter to your end-of-quarter self (L.10). Sealed until that quarter's
// review page; nothing else in the product renders it.
export async function writeMyGoalLetter(goalId: string, letter: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.letter, { goalId, letter });
  if (!p.ok) return p;
  return done(await myWriteGoalLetter(actor, p.data.goalId, p.data.letter));
}

// "How I work" (L.3): the member's own account of how to work with them. Their
// coach reads it and the AI prep uses it; neither writes it.
export async function setMyHowIWork(field: HowIWorkField, value: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.howIWork, { field, value });
  if (!p.ok) return p;
  return done(await myUpdateHowIWork(actor, p.data.field, p.data.value));
}

// "Not this one" on the board-card suggestion. Saying yes is an ordinary move
// to Done through updateMyCommitment above, so only the decline needs an action
// of its own — the member's answer either way, never the board's.
export async function dismissMyCardDone(commitmentId: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.commitment, { commitmentId });
  if (!p.ok) return p;
  return done(await myDismissCardDone(actor, p.data.commitmentId));
}

// Talking points: the member's half of the 1-1 agenda.
export async function addMyTalkingPoint(body: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.body, { body });
  if (!p.ok) return p;
  return done(await myAddTalkingPoint(actor, p.data.body));
}

export async function deleteMyTalkingPoint(id: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.id, { id });
  if (!p.ok) return p;
  return done(await myDeleteTalkingPoint(actor, p.data.id));
}

// The goal's number, bumped where the goal lives (K.41). The coach's page and
// the directory show the same goal, so they refresh too.
export async function updateMyGoalProgress(goalId: string, currentValue: number): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.goalProgress, { goalId, currentValue });
  if (!p.ok) return p;
  const res = await myUpdateGoalProgress(actor, p.data.goalId, p.data.currentValue);
  // Progress also moves the number the coach's roster and the directory show.
  if (res.ok) refreshCoachAndDirectory();
  return done(res);
}

// When 1-1s suit the member (K.34): a Saigon time of day. The coach reads it on
// the profile, and a booking without a time of its own starts at it. The day
// is the pair's rhythm, which the 1-1 schedule reads off their 1-1s (A.31).
export async function setMyPreferredSlot(time: string | null): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.slot, { time });
  if (!p.ok) return p;
  const res = await saveMyPreferredSlot(actor, p.data);
  if (res.ok) refreshCoachList();
  return done(res);
}

// Something worth remembering (K.19): a note the member writes for themselves
// between 1-1s. The body is the only client input; the profile is re-derived
// from the actor, and the note id is only acted on once it is proven to sit on
// that profile.
export async function addMyQuickNote(body: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.body, { body });
  if (!p.ok) return p;
  return done(await addMyNote(actor, p.data.body));
}

export async function archiveMyQuickNote(noteId: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.id, { id: noteId });
  if (!p.ok) return p;
  return done(await archiveMyNote(actor, p.data.id));
}

// The member picks or proposes a date for their next 1-1 (K.32). With no date
// on the profile it becomes the date at once; with one already there the coach
// confirms it from the roster. Either way the coach gets a line and a link.
export async function proposeMyOneOnOneDate(dateISO: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.day, { dateISO });
  if (!p.ok) return p;
  const res = await proposeMyDate(actor, p.data.dateISO);
  if (res.ok) refreshCoachList();
  return done(res);
}

// The member's brag document (K.17, spec 2.5): their meetings, their own words
// and the commitments they kept, as markdown the browser saves as a file. It is
// built server-side because the rows it reads are member-tier reads, and it is
// the member's own history by construction — getMyBragDocument is scoped to the
// actor's profile and takes no id from the client.
export async function exportMyBragDocument(): Promise<
  { ok: true; filename: string; markdown: string } | { ok: false; error: string }
> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const on = saigonToday();
  const markdown = await getMyBragDocument(actor, actor.displayName, on);
  return { ok: true, filename: `brag-document-${on}.md`, markdown };
}

// Ask now on a Blocked card (K.22): one plain Lark line plus email to the
// coach, carrying the card and the member's note about why it is stuck. The
// commitment id is the only client input; ownership, the blocked status and the
// once-per-Saigon-day rule are all re-derived server-side.
export async function askNowOnMyCommitment(commitmentId: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.commitment, { commitmentId });
  if (!p.ok) return p;
  return done(await askNowOnCommitment(actor, p.data.commitmentId));
}
