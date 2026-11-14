import { companyOs } from "@/kernel/data/supabase";
import { mustRows, readOr } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { reviewSurveySlug } from "../reviews-labels";
import type { SurveyFieldRow } from "../surveys-schema";
import { answerPath, storedAnswer } from "../review-answer-path";
import { clientPartAccess, wasReopened, type ClientPartRow } from "./access";
import { memberAnswersBeside, type AnswerBeside } from "./beside";
import { isPartSubmitted, whatViewerSees } from "./rules";
import type { ContactKey } from "./skip-manager";
import { reviewInitialAnswers } from "../reviews/run";

// What a client manager's personal link shows (CR.2.2, stories 37 and 41 to
// 43). The credential is the link's token, or the client manager signing in
// with portal access at the cycle's client (CR.3.6, signedInAt); the caller
// passes the sign-in's people only when no token came. Every state comes
// from the rules module through ./access, and the page renders exactly one of
// them. A link that does not work, for whatever reason, shows the same words,
// because a guessed or cancelled link must learn nothing, not even a name.

export type ClientManagerLinkView =
  /** The form, with the member's own answer beside each screen. */
  | { kind: "fill"; memberName: string; beside: Record<string, AnswerBeside>; initialAnswers?: Record<string, unknown> }
  /** Their own sent answers, read-only (story 42). */
  | { kind: "sent"; memberName: string; submittedAt: string | null; answers: { label: string; value: string }[] }
  /** The member has not sent their part, and the owner has not unlocked this one (story 41). */
  | { kind: "not_yet"; memberName: string }
  /** The cycle closed, so its links no longer open (story 43). */
  | { kind: "closed"; cycleName: string; closedAt: string | null }
  /** A wrong, cancelled or withdrawn member's link (story 43). */
  | { kind: "no_longer_works" };

type LinkRow = Pick<ClientPartRow, "id" | "team_member_id" | "rater_kind" | "review_type" | "access_token" | "metadata">;

async function memberNameOf(teamMemberId: string): Promise<string> {
  // A placeholder is an answer the page can live with: the name only labels the form.
  const data = readOr(
    await companyOs.from("team_members").select(`people!person_id(${NAME_COLUMNS})`).eq("id", teamMemberId).maybeSingle(),
    "[org/client-reviews] team_members",
    null,
  );
  const p = Array.isArray(data?.people) ? data?.people[0] : data?.people;
  return personName(p, "the team member");
}

/** A sent answer as the read-only page words it. */
function shown(field: SurveyFieldRow, part: ClientPartRow): string | null {
  const v = storedAnswer(part, answerPath(field.config?.maps_to));
  if (typeof v === "number") {
    const level = field.config?.levels?.[String(v)];
    return level ? `${v} · ${level}` : String(v);
  }
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

/**
 * The view for one presented link, or null when the review id is not a client
 * manager's part: the caller then goes on to the review runner's own path,
 * which serves the company's outside raters.
 */
export async function clientManagerLinkView(
  reviewId: string,
  slug: string,
  key: ContactKey,
  fields: readonly SurveyFieldRow[],
): Promise<ClientManagerLinkView | null> {
  if (!isUuid(reviewId)) return null;
  const row = mustRows(
    await companyOs
      .from("performance_reviews")
      .select("id, team_member_id, rater_kind, review_type, access_token, metadata")
      .eq("id", reviewId)
      .limit(1),
    "[org/client-reviews] performance_reviews",
  )[0] as LinkRow | undefined;
  if (!row || row.review_type !== "client" || row.rater_kind !== "client_manager") return null;
  // A link to another form than the part's own is not this part's link.
  if (reviewSurveySlug(row) !== slug) return { kind: "no_longer_works" };

  // The link's token, or signing in as this member's client manager (CR.3.6).
  const access = await clientPartAccess(row, { token: key.token, teamMemberId: null, personIds: key.personIds });
  const setting = access.setting;
  if (!access.ok) {
    if (!setting) return { kind: "no_longer_works" };
    if (access.reason === "not_yet") return { kind: "not_yet", memberName: await memberNameOf(row.team_member_id) };
    if (access.reason === "cycle_closed") return { kind: "closed", cycleName: setting.cycle.name, closedAt: setting.cycle.closedAt };
    if (access.reason === "already_submitted" && setting.parts.clientManager) {
      const own = setting.parts.clientManager;
      const answers = fields
        .filter((f) => f.type !== "yes_no")
        .map((f) => ({ label: f.label, value: shown(f, own) }))
        .filter((a): a is { label: string; value: string } => a.value !== null);
      // No average: neither link shows one, because an average is the
      // company's reading of the review, not the client's (the rules module).
      return { kind: "sent", memberName: await memberNameOf(row.team_member_id), submittedAt: own.submitted_at, answers };
    }
    return { kind: "no_longer_works" };
  }

  // The rules decide whether this link sees the member's part; an unlocked
  // part opened before the member sent theirs has nothing to show beside it.
  const { facts, parts } = access.setting;
  const sees = whatViewerSees(facts, { kind: "client_manager_link", tokenMatches: true });
  const memberPart = sees.memberPart && isPartSubmitted(parts.member) ? parts.member : null;
  // A part the owner reopened (CR.2.4) keeps its answers; the form opens with them.
  const own = parts.clientManager;
  return {
    kind: "fill",
    memberName: await memberNameOf(row.team_member_id),
    beside: memberAnswersBeside(fields, memberPart),
    ...(own && wasReopened(own) ? { initialAnswers: reviewInitialAnswers(own, fields) } : {}),
  };
}
