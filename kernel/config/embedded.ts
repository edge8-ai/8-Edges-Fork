// PostgREST embeds (`select("*, people(*)")`) come back as either a single
// object or a one-element array depending on how the relationship is declared
// (and whether a FK is unique), so every reader used to carry its own `one()`.
// This is the single copy: flatten to the row, or null. `undefined` is folded to
// null too, because callers often reach through optional chaining first.
export type Embedded<T> = T | T[] | null | undefined;

export function one<T>(e: Embedded<T>): T | null {
  return Array.isArray(e) ? (e[0] ?? null) : (e ?? null);
}
