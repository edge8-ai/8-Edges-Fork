import { formSteps } from "../form-steps";
import type { SurveyFieldRow } from "../surveys-schema";
import { memberAnswersBeside, type AnswerBeside, type MemberAnswers } from "./beside";
import { averageOfRatings, isPartSubmitted, whatViewerSees, type ClientReviewFacts, type ReviewViewer } from "./rules";

// One member's client review as people inside the company read it on the team
// side (CR.3.3, stories 33, 34 and 56 to 58): the member, their manager of
// record, their coach and the review admins. Pure: the reader (./team-view)
// gathers the rows and says who is asking, and this module asks the rules what
// that viewer sees (./rules, whatViewerSees) and drops everything else before
// anything is drawn. A section the rules hold back is null here, never a
// flag the page has to remember to check.
//
// The skip-manager's comments are never part of this view, whoever asks: the
// rules give them to review admins, who read them on the owner's per-member
// page, and the team side has no place for a note meant for HR (story 55).

/** Who is asking, as the reader found them. More than one may be true. */
export type ViewerRoles = {
  isMember: boolean;
  isReviewAdmin: boolean;
  isManagerOfRecord: boolean;
  isCoach: boolean;
};

/**
 * The viewer the rules are asked about. The member comes first here, ahead of
 * a review admin: on the team side a review admin who is the member reads
 * their own review as its member does, so the skip-manager's comments (story
 * 55) and the client manager's part before release never reach them through
 * this page. The owner's per-member page refuses them for the same reason.
 * After the member, the widest role wins, as the rules module names them.
 */
export function teamViewer(roles: ViewerRoles): ReviewViewer {
  if (roles.isMember) return { kind: "member" };
  if (roles.isReviewAdmin) return { kind: "review_admin" };
  if (roles.isManagerOfRecord) return { kind: "manager_of_record" };
  if (roles.isCoach) return { kind: "coach" };
  return { kind: "other" };
}

/** One rated question: where each side put it, and what each wrote beside it. */
type RatedRow = { key: string; title: string; member: AnswerBeside | null; clientManager: AnswerBeside | null };

/** One question answered in words or by a choice, not a rating. */
type WordsRow = RatedRow;

export type TeamReviewView = {
  viewer: ReviewViewer["kind"];
  released: boolean;
  /** Whether the cycle has a skip-manager, a second reader at the client of both parts. */
  hasSkipManager: boolean;
  /** Where the review stands, for the four steps. */
  dates: { openedAt: string; memberSentAt: string | null; clientManagerSentAt: string | null; releasedAt: string | null };
  selfAverage: number | null;
  clientManagerAverage: number | null;
  /** How many rated questions both parts rated, and how many of them alike; null unless both parts are seen. */
  agreement: { same: number; of: number; higherByClient: number; lowerByClient: number } | null;
  /** The levels of the scale, lowest first, as the form words them. */
  levels: { value: number; label: string }[];
  rated: RatedRow[];
  words: WordsRow[];
  /** The owner's summary, once it may be read and if one was written. */
  summary: string | null;
};

export type TeamViewInput = {
  facts: ClientReviewFacts;
  roles: ViewerRoles;
  openedAt: string;
  raterFields: readonly SurveyFieldRow[];
  ratingKeys: readonly string[];
  memberPart: (MemberAnswers & { submitted_at: string | null }) | null;
  clientManagerPart: (MemberAnswers & { submitted_at: string | null }) | null;
  hrSummary: string | null;
  /**
   * The member's own form's wording, by the key each question maps to. The
   * member reads their review under the questions they answered ("did you"),
   * everyone else under the rater's neutral ones ("did this team member").
   */
  memberTitles?: ReadonlyMap<string, string>;
};

/**
 * What this viewer reads of the review, or null when they read nothing of it.
 * A part is shown only once it is sent: an answer still being written belongs
 * to its writer, whoever else may later read it.
 */
export function teamReviewView(input: TeamViewInput): TeamReviewView | null {
  const { facts } = input;
  const viewer = teamViewer(input.roles);
  const sees = whatViewerSees(facts, viewer);
  if (!sees.memberPart && !sees.clientManagerPart) return null;

  const memberSent = isPartSubmitted(facts.parts.member);
  const cmSent = isPartSubmitted(facts.parts.clientManager);
  const memberPart = sees.memberPart && memberSent ? input.memberPart : null;
  const cmPart = sees.clientManagerPart && cmSent ? input.clientManagerPart : null;
  // The member reads their own part before they send it on the form itself,
  // not here; anyone else has nothing to read until something is sent.
  if (!memberPart && !cmPart) return null;

  const memberBeside = memberAnswersBeside(input.raterFields, memberPart);
  const cmBeside = memberAnswersBeside(input.raterFields, cmPart);
  const rated: RatedRow[] = [];
  const words: WordsRow[] = [];
  const levels = new Map<number, string>();
  for (const [first] of formSteps(input.raterFields)) {
    const key = first.config?.maps_to;
    if (first.type === "yes_no" || typeof key !== "string") continue;
    const title = (viewer.kind === "member" ? input.memberTitles?.get(key) : undefined) ?? first.label;
    const row: RatedRow = { key, title, member: memberBeside[first.id] ?? null, clientManager: cmBeside[first.id] ?? null };
    if (!row.member && !row.clientManager) continue;
    if (first.type === "rating") {
      rated.push(row);
      for (const [value, label] of Object.entries(first.config?.levels ?? {})) {
        const n = Number(value);
        if (Number.isInteger(n) && typeof label === "string" && !levels.has(n)) levels.set(n, label);
      }
    } else {
      words.push(row);
    }
  }

  const both = rated.filter((r) => r.member?.rating != null && r.clientManager?.rating != null);
  const agreement = memberPart && cmPart
    ? {
        same: both.filter((r) => r.member!.rating === r.clientManager!.rating).length,
        of: both.length,
        higherByClient: both.filter((r) => r.clientManager!.rating! > r.member!.rating!).length,
        lowerByClient: both.filter((r) => r.clientManager!.rating! < r.member!.rating!).length,
      }
    : null;

  return {
    viewer: viewer.kind,
    released: facts.member.releasedAt !== null,
    hasSkipManager: facts.cycle.hasSkipManager,
    dates: {
      openedAt: input.openedAt,
      memberSentAt: memberSent ? (input.memberPart?.submitted_at ?? null) : null,
      clientManagerSentAt: cmPart ? (input.clientManagerPart?.submitted_at ?? null) : null,
      releasedAt: facts.member.releasedAt,
    },
    selfAverage: sees.selfAverage && memberPart ? averageOfRatings(memberPart.ratings, input.ratingKeys) : null,
    clientManagerAverage: sees.clientManagerAverage && cmPart ? averageOfRatings(cmPart.ratings, input.ratingKeys) : null,
    agreement,
    levels: [...levels].sort(([a], [b]) => a - b).map(([value, label]) => ({ value, label })),
    rated,
    words,
    summary: sees.hrSummary && input.hrSummary?.trim() ? input.hrSummary : null,
  };
}
