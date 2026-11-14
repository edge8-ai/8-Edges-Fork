// One unbiased shuffle (Fisher–Yates) for the pages that deal people in a fresh
// order on every visit, so nobody is ever first by rank, tenure or alphabet
// (team Home, TH.1; the kudos wall, TH.1.8). It moved here from the team Home
// when kudos moved to org (ADR 0025), since both draw from it.

/** A shuffle that takes its random source, so a test can pin it. */
export function shuffle<T>(xs: readonly T[], random: () => number = Math.random): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
