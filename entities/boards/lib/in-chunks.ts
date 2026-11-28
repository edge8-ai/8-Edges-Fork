// A read filtered by a list of ids, in pieces small enough to send (W.138).
//
// PostgREST takes `.in("task_id", ids)` as a query string, so the request
// grows with the list. The all-boards workboard holds about 680 cards, and
// 680 uuids is a URL of roughly 25 KB, which the gateway refuses with a bare
// `400 Bad Request`. The loader logged that and carried on, so every card on
// that scope showed no comments and no column moves, and a comment written in
// the drawer vanished on the refresh after it. One board is small enough to
// fit, which is why the bug only ever showed on the scope with the most cards.
//
// The pieces run in parallel and are joined in list order. A caller that
// orders its rows gets them ordered within each piece. Every row for one id
// lands in the same piece, so a per-id order (the comments on one card, oldest
// first) survives the join. An order across ids does not.

/** Ids per request: about 6 KB of query string, well inside every limit on the path. */
export const IN_CHUNK = 150;

type Piece<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Runs `read` once per slice of `ids` and joins the rows. The result has the
 * shape of one PostgREST response, so a caller handles its error exactly as
 * before: any failed slice fails the whole read, rather than showing the rows
 * of the slices that happened to succeed as if they were all of them.
 */
export async function readInChunks<T>(
  ids: readonly string[],
  read: (slice: string[]) => PromiseLike<Piece<T>>,
): Promise<Piece<T>> {
  const slices: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) slices.push(ids.slice(i, i + IN_CHUNK));
  const pieces = await Promise.all(slices.map((slice) => read(slice)));
  const failed = pieces.find((p) => p.error);
  if (failed) return { data: null, error: failed.error };
  return { data: pieces.flatMap((p) => p.data ?? []), error: null };
}
