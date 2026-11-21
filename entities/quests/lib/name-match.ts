// How the assistant's quest tools find what a person named (QS.9): a person to
// call on a drafted Bounty, or the one Bounty a manager asks about. An exact
// name (case aside) wins; else every name that contains the words. The caller
// decides what one match, several or none means, so the rule is one rule.

/** The items a name means: those whose text equals it, else those whose text contains it. */
export function matchingName<T>(items: readonly T[], name: string, textOf: (item: T) => string): T[] {
  const term = name.trim().toLowerCase();
  if (!term) return [];
  const exact = items.filter((i) => textOf(i).trim().toLowerCase() === term);
  return exact.length > 0 ? exact : items.filter((i) => textOf(i).toLowerCase().includes(term));
}
