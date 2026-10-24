import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { one } from "@/kernel/config/embedded";
import { publish } from "@/kernel/events";
import { REVIEW_TYPE_LABEL, reviewLinkPath } from "@/entities/team/lib/reviews-labels";

// Tells each rater's Inbox that their part of a review waits on them (TH.13).
// Every write that opens a part calls this with the ids it wrote, and the daily
// scheduler calls it with every part still waiting, so a part opened by a path
// that forgot, or before the Inbox existed, is told on the next run. The Inbox
// keys its ask on the review id and ignores a duplicate, so telling a part twice
// adds nothing, and an ask the rater already cleared stays cleared.
//
// Only a part waiting on a team member is told: an external reviewer has no
// Inbox and is reached by the emailed link alone. Announcing is never what
// opening a review depends on, so a failure is logged and the caller goes on;
// the email stays the reminder of record.

const TOLD_KINDS = ["self", "manager", "reviewer"] as const;
type ToldKind = (typeof TOLD_KINDS)[number];

type PartRow = { id: string; team_member_id: string; reviewer_id: string | null; rater_kind: string; review_type: string; status: string };
type MemberRow = { id: string; person_id: string | null; people: NamedPerson | NamedPerson[] | null };

/** The team member a part waits on: the subject for a self-assessment, the reviewer otherwise. */
export function raterOf(part: Pick<PartRow, "rater_kind" | "team_member_id" | "reviewer_id">): string | null {
  return part.rater_kind === "self" ? part.team_member_id : part.reviewer_id;
}

function isTold(kind: string): kind is ToldKind {
  return (TOLD_KINDS as readonly string[]).includes(kind);
}

export async function askRaters(reviewIds: readonly string[]): Promise<number> {
  const ids = [...new Set(reviewIds)].filter(Boolean);
  if (ids.length === 0) return 0;
  try {
    const parts = (
      mustRows(
        await companyOs.from("performance_reviews").select("id, team_member_id, reviewer_id, rater_kind, review_type, status").in("id", ids),
        "[team/reviews] parts to tell the inbox",
      ) as PartRow[]
    ).filter((p) => isTold(p.rater_kind) && (p.status === "open" || p.status === "draft") && raterOf(p));
    if (parts.length === 0) return 0;

    const memberIds = [...new Set(parts.flatMap((p) => [p.team_member_id, raterOf(p) as string]))];
    const members = mustRows(
      await companyOs.from("team_members").select(`id, person_id, people!person_id(${NAME_COLUMNS})`).in("id", memberIds),
      "[team/reviews] raters and subjects",
    ) as unknown as MemberRow[];
    const byId = new Map(members.map((m) => [m.id, m]));

    let told = 0;
    for (const p of parts) {
      const raterPersonId = byId.get(raterOf(p) as string)?.person_id ?? null;
      if (!raterPersonId) continue;
      const subject = byId.get(p.team_member_id);
      try {
        await publish("review.part.requested", {
          reviewId: p.id,
          raterPersonId,
          raterKind: p.rater_kind as ToldKind,
          reviewName: REVIEW_TYPE_LABEL[p.review_type as keyof typeof REVIEW_TYPE_LABEL] ?? "Performance review",
          subjectName: subject ? personName(one(subject.people), "a teammate") : null,
          formPath: reviewLinkPath({ id: p.id, rater_kind: p.rater_kind, review_type: p.review_type, access_token: null }),
        });
        told++;
      } catch (err) {
        console.error(`[team/reviews] part ${p.id} not told to the inbox:`, err instanceof Error ? err.message : err);
      }
    }
    return told;
  } catch (err) {
    console.error("[team/reviews] parts not told to the inbox:", err instanceof Error ? err.message : err);
    return 0;
  }
}
