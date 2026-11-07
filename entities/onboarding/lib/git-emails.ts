import { companyOs } from "@/kernel/data/supabase";

// What htt asks of the git addresses people's commits are authored with, and
// the one it records (A.70, ADR 0018). Until A.70 the door handed out
// `selectPersonGitEmails` and `insertPersonGitEmails`, and htt chained its own
// filter onto them. Each function here is the exact query or write htt made:
// same columns, filter, single-row form and payload.
// entities/onboarding/lib/onboarding-door.test.ts pins each one.

/** The claim on this git address, as `{ id }` or null (htt, before recording one it discovered). */
export function gitEmailClaim(gitEmail: string) {
  return companyOs.from("person_git_emails").select("id").eq("git_email", gitEmail).maybeSingle();
}

/** Records a git address HTT discovered for a person, as `source: "discovered"`. Resolves to `{ error }`. */
export function recordDiscoveredGitEmail(gitEmail: string, personId: string) {
  return companyOs.from("person_git_emails").insert({ git_email: gitEmail, person_id: personId, source: "discovered" });
}
