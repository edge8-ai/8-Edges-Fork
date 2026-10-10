"use server";

import { refreshBothLists, refreshMember } from "./revalidate";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
// Concrete data files, not the module index: the client components that call
// these import them directly, and the index re-exports the data layer, so
// importing the index here would close an index -> ui -> actions -> index cycle.
import { savePreMeetingAnswers, savePrepMemberEdits } from "./data/pre-meeting";
import type { PrepEdits } from "./prep-edits";
import { coachSaveCheckinNote } from "./data/coach-edits";
import type { Result } from "@/kernel/data/result";

import { parseInput, zId, zLooseText } from "./schemas";
import { z } from "zod";

// What the pre-meeting actions accept (ticket 13). The prep edits are two
// arrays of strings straight from the browser: capped here, because the writer
// caps the COUNT it keeps and never capped the payload it was handed.
const S = {
  answers: z.object({
    moved: zLooseText(5_000),
    stuck: zLooseText(5_000),
    talk: zLooseText(5_000),
  }),
  edits: z.object({
    struck: z.array(zLooseText(500)).max(200, "That is more lines than a prep has."),
    added: z.array(zLooseText(500)).max(200, "That is more lines than a prep has."),
  }),
  checkin: z.object({ checkinId: zId, note: zLooseText(5_000) }),
};

// The two writes behind the pre-meeting form (K.15, spec 2.3). They live
// together rather than beside the coach's and the member's other actions
// because they are two halves of one artefact: the member writes the three
// answers, the coach writes one note back, and both land on the same
// coaching_checkins row.

// All three fields are optional, so an empty save is a legitimate save: it
// clears what was there and says the member looked.
export async function saveMyPreMeetingAnswers(
  moved: string,
  stuck: string,
  talk: string,
): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.answers, { moved, stuck, talk });
  if (!p.ok) return p;
  const res = await savePreMeetingAnswers(actor, p.data.moved, p.data.stuck, p.data.talk);
  if (res.ok) refreshMember();
  return res;
}

// The member's strikes and additions to the shared prep (K.21). The coach sees
// them on the meeting row, so both pages refresh.
export async function saveMyPrepEdits(edits: PrepEdits): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.edits, edits);
  if (!p.ok) return p;
  const res = await savePrepMemberEdits(actor, p.data);
  if (res.ok) {
    refreshBothLists();
  }
  return res;
}

// The coach's note reaches the member immediately, so both pages refresh.
export async function saveCheckinNote(checkinId: string, note: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.checkin, { checkinId, note });
  if (!p.ok) return p;
  const res = await coachSaveCheckinNote(actor, p.data.checkinId, p.data.note);
  if (res.ok) {
    refreshBothLists();
  }
  return res;
}
