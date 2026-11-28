// Which existing asset a writer output replaces when a campaign is re-drafted
// (M.26 item A, 18 Nov). The writer drafts two posts on some channels, a
// Personal and a Company LinkedIn post for example, and the store used to key
// existing assets by channel alone: on a re-draft both outputs updated the same
// row, the last one won, and the other row kept its old copy.
//
// Each existing row is now used once. An output first takes the row whose title
// starts with the same label ("Personal LinkedIn: …" → "personal"), so the
// Personal post stays on the Personal row; whatever is left is paired in the
// order the rows were created. An output with no row left is a new asset.
// Pure, so it is tested without a database.

type Titled = { channel: string; title?: string | null };

function label(title: string | null | undefined): string {
  return (title ?? "").trim().split(/[\s:]+/)[0]?.toLowerCase() ?? "";
}

export function matchExistingAssets<E extends Titled>(existing: E[], outputs: Titled[]): (E | null)[] {
  const pool = new Map<string, E[]>();
  for (const e of existing) pool.set(e.channel, [...(pool.get(e.channel) ?? []), e]);

  const matched: (E | null)[] = outputs.map(() => null);
  const take = (channel: string, i: number) => pool.get(channel)!.splice(i, 1)[0];

  // First pass: same channel and the same title label.
  outputs.forEach((o, n) => {
    const rows = pool.get(o.channel);
    const want = label(o.title);
    if (!rows?.length || !want) return;
    const i = rows.findIndex((r) => label(r.title) === want);
    if (i >= 0) matched[n] = take(o.channel, i);
  });
  // Second pass: anything unmatched takes the oldest row left on its channel.
  outputs.forEach((o, n) => {
    if (matched[n]) return;
    const rows = pool.get(o.channel);
    if (rows?.length) matched[n] = take(o.channel, 0);
  });
  return matched;
}
