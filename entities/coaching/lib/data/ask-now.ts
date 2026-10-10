import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { saigonToday } from "@/kernel/config/dates";
import { notifyBoth } from "../cycle-shared";
import { myProfileId } from "./member";
import type { Result } from "./shared";

// "Ask now" on a Blocked card (K.22). A stuck commitment already carries the
// member's note about why; this is the button that puts that note in front of
// the coach today instead of at the next 1-1. One plain Lark line plus the
// email, never a card and never a cron.
//
// Member tier throughout: the commitment id is the only client input, and it is
// acted on only after it is proven to sit on the actor's own profile.

// Saigon calendar date of a timestamp — the day boundary the rate limit uses,
// so a click at 23:00 and one at 00:30 are two different days for the member
// clicking, whatever timezone the server runs in.
function saigonDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
}

// The once-per-card-per-day rule, pure so it can be tested without a database.
// A member is asking for help, not filing a ticket: the first click of the day
// goes out, and every one after it is a no-op they are told about.
export function canAskNow(input: { askNowSentAt: string | null; todayISO: string }): boolean {
  if (!input.askNowSentAt) return true;
  return saigonDateOf(input.askNowSentAt) !== input.todayISO;
}

type PersonEmbed = {
  full_name: string | null;
  preferred_name: string | null;
  email: string | null;
};

export async function askNowOnCommitment(actor: TeamActor, commitmentId: string): Promise<Result> {
  const profileId = await myProfileId(actor);
  if (!profileId || !commitmentId) return { ok: false, error: "Not found." };

  const { data, error } = await companyOs
    .from("coaching_commitments")
    .select("id, title, status, status_note, ask_now_sent_at")
    // Scoped to the actor's own profile, so a guessed id from another profile
    // matches nothing rather than messaging somebody else's coach.
    .eq("id", commitmentId)
    .eq("coaching_profile_id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/ask-now] coaching_commitments", error);
    return { ok: false, error: "Could not reach your coach." };
  }
  const row = data as {
    id: string;
    title: string;
    status: string;
    status_note: string | null;
    ask_now_sent_at: string | null;
  } | null;
  if (!row) return { ok: false, error: "Not found." };
  if (row.status !== "blocked") return { ok: false, error: "Only a blocked commitment can ask for help." };
  if (!canAskNow({ askNowSentAt: row.ask_now_sent_at, todayISO: saigonToday() }))
    return { ok: false, error: "Your coach already heard about this one today." };

  const { data: profileData, error: profileError } = await companyOs
    .from("coaching_profiles")
    .select("coach_id")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) {
    console.error("[team/coaching/ask-now] coaching_profiles", profileError);
    return { ok: false, error: "Could not reach your coach." };
  }
  const coachId = (profileData as { coach_id: string | null } | null)?.coach_id ?? null;
  if (!coachId) return { ok: false, error: "Nobody coaches you yet." };

  const { data: coachRow, error: coachError } = await companyOs
    .from("team_members")
    .select("people:people!person_id(full_name, preferred_name, email)")
    .eq("id", coachId)
    .maybeSingle();
  if (coachError) {
    console.error("[team/coaching/ask-now] team_members", coachError);
    return { ok: false, error: "Could not reach your coach." };
  }
  const coach = one(
    ((coachRow as unknown as Record<string, unknown> | null)?.people ?? null) as PersonEmbed | PersonEmbed[] | null,
  );
  const coachEmail = coach?.email ?? null;
  if (!coachEmail) return { ok: false, error: "Your coach has no contact on file." };

  const link = `${await getSiteOrigin()}/team/coaching/${profileId}`;
  const note = (row.status_note ?? "").trim();
  const text = note
    ? `${actor.displayName} is stuck on "${row.title}": ${note}`
    : `${actor.displayName} is stuck on "${row.title}".`;
  await notifyBoth({
    email: coachEmail,
    subject: `${actor.displayName} is stuck on a commitment`,
    html: `<p>${text}</p><p><a href="${link}">Their coaching page</a></p>`,
    larkText: `${text} ${link}`,
    logKind: "commitment_ask_now",
    links: [link],
  });

  // The stamp is written whether or not either channel accepted, because it is
  // the record of the member having asked. A retry tomorrow is the right cost
  // of a delivery failure; two pings today are not.
  const { error: stampError } = await companyOs
    .from("coaching_commitments")
    .update({ ask_now_sent_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("coaching_profile_id", profileId);
  if (stampError) {
    console.error("[team/coaching/ask-now] stamp", stampError);
    return { ok: false, error: "Your coach was told, but we could not record it." };
  }
  return { ok: true };
}
