// The held rule (QS.7; spec "Evolve: an unlock on your own learning"; glossary:
// Held fire). The Evolve page is gone (AK.4), but the rule stays: a fire is
// held once its session ended, was not cancelled, and someone other than its
// Host was marked attended. That is what earns its Host their fire on the
// ladders (ADR 0023), so this is the one place that says so, and the ladders
// take the answer from Quests' door. Pure: the only clock it reads is the
// moment of asking, against a session's end.

/** A fire's session as the held rule needs it, from Training's door: when it ends, whether it was cancelled or self-logged, who attended. */
export type FireSession = { endsAt: string; cancelled: boolean; selfLogged: boolean; attended: readonly string[] };

/**
 * Whether a fire was held: its session ended, was not cancelled, and someone
 * other than the Host attended. A self-logged session is a person's own
 * record, never a taught one, so it holds no fire.
 */
export function isHeld(hostId: string, session: FireSession | undefined, now: Date): boolean {
  if (!session || session.cancelled || session.selfLogged) return false;
  if (Date.parse(session.endsAt) > now.getTime()) return false;
  return session.attended.some((p) => p !== hostId);
}
