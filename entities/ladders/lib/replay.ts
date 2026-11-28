// The nightly replay and the launch backfill (LD.1; spec "How positions are
// written"). The replay recomputes everyone who could have a place: the team
// of today, plus everyone who already has a position or an unlock row (a
// person who left keeps theirs). It is idempotent and safe to run by hand:
// run twice, it writes the same rows.
//
// The launch backfill is the replay run once with `source = "launch"`, which
// marks every unlock it writes as shown. Rather than a switch somebody has to
// remember to flip once and never again, the replay decides for itself: while
// nobody has ever been credited anything (no unlock row exists), the run is
// the launch and history is credited quietly; from the first unlock on, every
// run is a replay and a tier it finds waits to be shown. `source` can still be
// forced, for a test or a deliberate re-launch after the unlocks were emptied.
import { listCurrentTeamPeople } from "@/kernel/identity/team-people";
import { liveDeps, recomputePeople, type Deps, type Recomputed, type Source } from "./recompute";

/** How many people one pass over the doors covers. */
const BATCH = 50;

export type ReplayDeps = Deps & { teamPeople: () => Promise<string[]> };

export function liveReplayDeps(): ReplayDeps {
  return { ...liveDeps(), teamPeople: async () => (await listCurrentTeamPeople()).map((p) => p.id) };
}

export type Replayed = {
  source: Source;
  /** The source the badges were written as: "launch" on the first run that finds any (LD.7). */
  badgeSource: Source;
  people: number;
  /** Tier unlocks this run wrote. */
  unlocked: number;
  /** Badge unlocks this run wrote. */
  badges: number;
  results: Recomputed[];
};

export async function replayAll(deps: ReplayDeps = liveReplayDeps(), opts: { source?: Source } = {}): Promise<Replayed> {
  const [team, withRows] = await Promise.all([deps.teamPeople(), deps.store.peopleWithRows()]);
  const people = [...new Set([...team, ...withRows])];
  const source: Source = opts.source ?? ((await deps.store.anyUnlock()) ? "replay" : "launch");
  // The badges launch on their own: the ladders may have launched long before
  // the catalogue arrived, and the history the badges find then is credited
  // quietly all the same. Decided once, before the first batch writes any.
  const badgeSource: Source = opts.source ?? ((await deps.store.anyUnlock("badge")) ? "replay" : "launch");
  const results: Recomputed[] = [];
  for (let i = 0; i < people.length; i += BATCH) {
    results.push(...(await recomputePeople(people.slice(i, i + BATCH), source, deps, { badges: badgeSource })));
  }
  return {
    source,
    badgeSource,
    people: people.length,
    unlocked: results.reduce((n, r) => n + r.newTiers.length, 0),
    badges: results.reduce((n, r) => n + r.newBadges.length, 0),
    results,
  };
}
