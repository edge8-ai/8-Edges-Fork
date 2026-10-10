// The Invitations tab of Settings → Access (AE.4): everyone invited from the
// invite drawer who has not signed in yet. There is no invitations table (the
// spec settled that): an invite is an auth user that was invited and never
// signed in, carrying the marker the drawer writes into its metadata, joined
// to People by email and to the grants the invite made.
//
// Status is Sent or Expired only. Supabase records nothing between sending the
// link and redeeming it: the /verify interstitial redeems the token and signs
// the person in in the same step, so email_confirmed_at and last_sign_in_at
// arrive together and there is no "link opened" moment to show.

/** The marker the invite writes into the auth user's metadata, and what it remembers. */
export const INVITE_MARKER = "access_invite";
export type InviteMetadata = { grant_ids: string[]; inviter_person_id: string | null; landing: "admin" | "team" };

/** Supabase caps the email link lifetime at 24 hours, which is also its default. */
export const DEFAULT_LINK_LIFETIME_HOURS = 24;

/**
 * The project's email link lifetime, from AUTH_EMAIL_LINK_LIFETIME_HOURS (set
 * it to match Authentication → Email → "Email OTP expiration" in the Supabase
 * dashboard). Unset, unreadable or above Supabase's cap reads as the 24-hour
 * default, so the tab never calls a live link expired early by more than the
 * configuration says.
 */
export function linkLifetimeHours(raw: string | undefined = process.env.AUTH_EMAIL_LINK_LIFETIME_HOURS): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= DEFAULT_LINK_LIFETIME_HOURS ? n : DEFAULT_LINK_LIFETIME_HOURS;
}

export type InvitedUser = {
  id: string;
  email: string | null;
  invited_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type InvitePerson = { id: string; email: string; name: string };
export type InviteGrant = { id: string; personId: string; roleName: string; grantedByName: string | null };

export type Invitation = {
  authUserId: string;
  email: string;
  personId: string | null;
  name: string;
  roles: string[];
  inviter: string | null;
  sentAt: string;
  status: "Sent" | "Expired";
  /** The live grants this invite made, which Cancel revokes. */
  grantIds: string[];
};

export function inviteMetadataOf(user: Pick<InvitedUser, "user_metadata">): InviteMetadata | null {
  const raw = user.user_metadata?.[INVITE_MARKER];
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<InviteMetadata>;
  return {
    grant_ids: Array.isArray(m.grant_ids) ? m.grant_ids.filter((g): g is string => typeof g === "string") : [],
    inviter_person_id: typeof m.inviter_person_id === "string" ? m.inviter_person_id : null,
    landing: m.landing === "admin" ? "admin" : "team",
  };
}

/** The pending invitations, newest first. `grants` are live grants only. */
export function pendingInvitations(input: {
  users: readonly InvitedUser[];
  people: readonly InvitePerson[];
  grants: readonly InviteGrant[];
  now: Date;
  lifetimeHours: number;
}): Invitation[] {
  const personByEmail = new Map(input.people.map((p) => [p.email.trim().toLowerCase(), p]));
  const lifetimeMs = input.lifetimeHours * 3_600_000;
  return input.users
    .filter((u) => u.invited_at && !u.last_sign_in_at && inviteMetadataOf(u))
    .map((u) => {
      const meta = inviteMetadataOf(u) as InviteMetadata;
      const email = (u.email ?? "").trim().toLowerCase();
      const person = personByEmail.get(email) ?? null;
      const held = person ? input.grants.filter((g) => g.personId === person.id) : [];
      const made = held.filter((g) => meta.grant_ids.includes(g.id));
      const sentAt = u.invited_at as string;
      return {
        authUserId: u.id,
        email,
        personId: person?.id ?? null,
        name: person?.name ?? email,
        roles: held.map((g) => g.roleName).sort(),
        inviter: made.find((g) => g.grantedByName)?.grantedByName ?? null,
        sentAt,
        status: input.now.getTime() - new Date(sentAt).getTime() > lifetimeMs ? ("Expired" as const) : ("Sent" as const),
        grantIds: made.map((g) => g.id),
      };
    })
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}
