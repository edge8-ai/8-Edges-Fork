// Evolve's pure half (QS.7; spec "Evolve: an unlock on your own learning";
// glossary: Evolve, Held fire). Pure and browser-safe: the Lore's read and the
// Evolve action both ask it, through the same read of the quests grown from a
// learning (evolve-read), so the page and the server can never disagree about
// what unlocks what. Which fires are live is said once, by liveFires: the page
// offers a fire again exactly when the action would light one.
//
// Both thresholds live here and nowhere else:
//
// - a learning may grow into a fire once three people other than its author
//   will try it (the count is Spark's distinct others, from the Ideas door);
// - a fire is held once its session ended, was not cancelled, and someone
//   other than its Host was marked attended: what earns its Host their fire
//   on the ladders, and what lets it be lit as a Beacon. This is the one place
//   that says so (ADR 0023); the ladders take the answer from Quests' door.
//
// The only clock either reads is the moment of asking: against a session's end
// for held, and against the chosen start for a fire still to come. Neither
// reads a miss or anyone's total.
// Evolve is offered only to a learning's author, on that learning, and nothing
// here sends anything to anyone.

/** How many people other than its author must say Will try before a learning's author may host a fire on it. */
export const EVOLVE_WILL_TRY = 3;

/** Whether a learning's will-try count unlocks its author's fire. */
export function canHostFire(willTry: number): boolean {
  return willTry >= EVOLVE_WILL_TRY;
}

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

/** How many people other than the Host sat by a held fire: its attended register rows, each person once. */
export function satBy(hostId: string, session: FireSession): number {
  return new Set(session.attended.filter((p) => p !== hostId)).size;
}

/**
 * Where the author's own learning stands, as the Evolve pill draws it:
 *
 * - `fire`: three will try, so its author may host a fire on it;
 * - `lit`: the fire is lit and not held yet;
 * - `held`: the fire was held, so it may be lit as a Beacon;
 * - `beacon`: the Beacon is lit.
 *
 * A learning with none of these shows no pill.
 */
export type Evolve =
  | { step: "fire"; willTry: number }
  | { step: "lit"; questId: string }
  | { step: "held"; questId: string; title: string; heldAt: string; sat: number }
  | { step: "beacon"; questId: string };

/** A quest that grew from a learning, as the Lore's read takes it: a Raid its author hosts, or a Beacon they lit. */
export type GrownQuest = { id: string; kind: "raid" | "beacon"; title: string; trainingId: string | null; createdAt: string };

/**
 * The live fires among the quests grown from a learning, newest first: its
 * Raids (the read already left out withdrawn ones) whose Training session was
 * not cancelled. A Raid whose session was cancelled is as if it were never lit
 * (QS.5c's cancel: a cold fire hands its topic back to Wanted), so its learning
 * offers its fire again. The page's pill and the action's refusal both count
 * from this, and nothing else.
 */
export function liveFires(grown: readonly GrownQuest[], sessions: ReadonlyMap<string, FireSession>): GrownQuest[] {
  return grown
    .filter((q) => q.kind === "raid" && q.trainingId !== null && !sessions.get(q.trainingId)?.cancelled)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The cold fires among the quests grown from a learning: every Raid that is
 * not live, which is a Raid left open on a cancelled session (or with no
 * session at all). QS.7b's one-fire index counts each Raid that is not
 * withdrawn, live or cold, so a cold Raid the cancel's soft handler failed to
 * put out would refuse the fire the page offers. Evolve puts these out before
 * it lights (QS.7c); together with liveFires they are every Raid the read hands
 * here, so the page and the index never count differently.
 */
export function coldFires(grown: readonly GrownQuest[], sessions: ReadonlyMap<string, FireSession>): GrownQuest[] {
  const live = new Set(liveFires(grown, sessions));
  return grown.filter((q) => q.kind === "raid" && !live.has(q));
}

/**
 * Where one of the reader's own learnings stands. `grown` holds the live
 * (not withdrawn) Raids the reader hosts and Beacons they lit that name this
 * learning as their origin; `sessions` holds each Raid's session by its
 * training id. A Beacon lit is the last state. Otherwise the newest live fire
 * decides: held, or lit while its session is not held yet. With no live fire,
 * the learning offers one at three will try.
 */
export function evolveOf(willTry: number, hostId: string, grown: readonly GrownQuest[], sessions: ReadonlyMap<string, FireSession>, now: Date): Evolve | null {
  const beacon = grown.find((q) => q.kind === "beacon");
  if (beacon) return { step: "beacon", questId: beacon.id };
  const raid = liveFires(grown, sessions)[0];
  if (raid?.trainingId) {
    const session = sessions.get(raid.trainingId);
    if (session && isHeld(hostId, session, now)) return { step: "held", questId: raid.id, title: raid.title, heldAt: session.endsAt, sat: satBy(hostId, session) };
    return { step: "lit", questId: raid.id };
  }
  return canHostFire(willTry) ? { step: "fire", willTry } : null;
}

/** The learning as the Evolve action reads it again, through the Ideas door; null when it is no longer a learning the Lore draws. */
export type LearningToEvolve = { id: string; authorId: string; title: string; willTry: number };

/**
 * Whether the reader may host a fire on a learning, and the Raid's title when
 * they may. The action asks this of rows it read itself, never of the page:
 * only the author, only at three will try, only once while a fire from it is
 * live (liveFires, counted from the same read as the page's pill), and only
 * at a time still to come.
 */
export function planEvolveFire(
  learning: LearningToEvolve | null,
  readerId: string,
  liveCount: number,
  startsAt: string,
  now: Date,
): { ok: true; title: string } | { ok: false; error: string } {
  if (!learning) return { ok: false, error: "That learning isn't here any more." };
  if (learning.authorId !== readerId) return { ok: false, error: "Only its author can evolve a learning. Raise a hand for it instead." };
  if (!canHostFire(learning.willTry)) return { ok: false, error: `A learning evolves once ${EVOLVE_WILL_TRY} people will try it.` };
  if (liveCount > 0) return { ok: false, error: "You lit a fire on this learning already." };
  if (Date.parse(startsAt) <= now.getTime()) return { ok: false, error: "Pick a time that has not passed." };
  return { ok: true, title: learning.title };
}
