import type { TeamActor } from "@/kernel/identity/team-auth";
import { saigonToday } from "@/kernel/config/dates";
import { TALENT_DIRECTOR_EMAIL } from "@/entities/onboarding";
import { addReviewer, ensureCycle, findTeamMembers, type ReviewerSpec, type SubjectSummary } from "./requests";
import { sendReviewLink } from "./talent";

// The team assistant's one write: request_review_link (docs:
// /workflows/review-requests, "the request" diagram). It resolves the subject,
// makes sure they have a cycle, resolves each reviewer, inserts or reuses a
// row, and hands back one link per reviewer. Every refusal is a plain sentence
// for the model to relay; nothing is guessed and nothing is emailed unless the
// caller said so in as many words.

export type ReviewLinkRequest = {
  subject: string;
  reviewers: Array<{ name?: string; email?: string }>;
  send?: boolean;
};

export type ReviewLinkOutcome = {
  ok: boolean;
  message?: string;
  subject?: string;
  cycle?: { label: string; type: string; opened: boolean };
  links: Array<{ name: string; kind: "reviewer" | "external"; link: string; created: boolean; emailedTo?: string }>;
  skipped: Array<{ who: string; why: string }>;
};

// Who may add reviewers: admins, the talent director, and the subject's manager.
function mayAssign(actor: TeamActor, subject: SubjectSummary): boolean {
  if (actor.isAdmin) return true;
  if (actor.email === TALENT_DIRECTOR_EMAIL) return true;
  return !!subject.managerId && subject.managerId === actor.teamMemberId;
}

export async function requestReviewLinks(actor: TeamActor, input: ReviewLinkRequest): Promise<ReviewLinkOutcome> {
  const fail = (message: string): ReviewLinkOutcome => ({ ok: false, message, links: [], skipped: [] });

  const subjectQuery = (input.subject ?? "").trim();
  if (!subjectQuery) return fail("Say who is being reviewed.");
  const matches = await findTeamMembers(subjectQuery);
  if (matches.length === 0) return fail(`No current team member matches "${subjectQuery}".`);
  if (matches.length > 1) return fail(`"${subjectQuery}" matches more than one team member: ${matches.map((m) => m.name).join(", ")}. Ask which one.`);
  const subject = matches[0];

  if (!mayAssign(actor, subject)) {
    return fail(`Only ${subject.name}'s manager, the talent director, or an admin can add reviewers for them.`);
  }

  const cycle = await ensureCycle(subject, saigonToday());
  if (!cycle.ok) return fail(cycle.error);

  const out: ReviewLinkOutcome = {
    ok: true,
    subject: subject.name,
    cycle: { label: cycle.cycleLabel, type: cycle.reviewType, opened: cycle.opened },
    links: [],
    skipped: [],
  };

  for (const r of input.reviewers ?? []) {
    const name = (r.name ?? "").trim();
    const email = (r.email ?? "").trim().toLowerCase();
    const who = name || email;
    if (!who) {
      out.skipped.push({ who: "(blank)", why: "no name or email given" });
      continue;
    }
    // An email that belongs to a team member makes them a team reviewer; any
    // other email is an external reviewer. A bare name must match exactly one
    // team member, otherwise we need an email rather than a guess.
    let spec: ReviewerSpec | null = null;
    if (email) {
      const byEmail = await findTeamMembers(email);
      if (byEmail.length === 1) spec = { kind: "team", teamMemberId: byEmail[0].teamMemberId };
      // An external reviewer needs a real name: the invitation greets them by
      // it, and the email's local part is not one ("Hi jsmith,", S.19.15).
      else if (!name) {
        out.skipped.push({ who, why: "an external reviewer needs their name as well as their email" });
        continue;
      } else spec = { kind: "external", email, name };
    } else {
      const byName = await findTeamMembers(name);
      if (byName.length === 1) spec = { kind: "team", teamMemberId: byName[0].teamMemberId };
      else if (byName.length > 1) {
        out.skipped.push({ who, why: `matches several team members (${byName.map((m) => m.name).join(", ")}); say which, or give an email` });
        continue;
      } else {
        out.skipped.push({ who, why: "not a team member; give their email to add them as an external reviewer" });
        continue;
      }
    }
    const added = await addReviewer({ teamMemberId: subject.teamMemberId, cycleLabel: cycle.cycleLabel, reviewType: cycle.reviewType, reviewer: spec });
    if (!added.ok) {
      out.skipped.push({ who, why: added.error });
      continue;
    }
    const entry: ReviewLinkOutcome["links"][number] = {
      name: added.link.label,
      kind: added.link.raterKind,
      link: added.link.link,
      created: added.link.created,
    };
    if (input.send) {
      const sent = await sendReviewLink(added.link.reviewId);
      if (sent.ok) entry.emailedTo = sent.to;
      else out.skipped.push({ who, why: `link made but not emailed: ${sent.error}` });
    }
    out.links.push(entry);
  }
  return out;
}
