// What comes back on a spark (ID.2.6, ID.2.7): who admires it, who has hit it
// too or will try it, who built on it, and which sparks a person should be
// shown next. Pure functions of the rows, so the rules are pinned by tests.
//
// Two rules shape all of it. Nothing ranks a person: there are faces and names,
// never a tally per person, and no sort by popularity. And a skip is private:
// it only keeps an idea out of the skipper's own deck, and appears nowhere else.

export type ReactionKind = "admire" | "me_too" | "skip" | "held" | "trying" | "unstuck";

export type ReactionRow = { ideaId: string; personId: string; name: string; kind: ReactionKind; createdAt: string };
export type BuildRow = { id: string; ideaId: string; personId: string; name: string; body: string; createdAt: string };
export type IdeaRef = { id: string; person_id: string; kind: string; title: string; created_at: string };

export type Face = { personId: string; name: string };
export type SparkSocial = { admirers: Face[]; meToo: Face[]; builds: number };

const EMPTY: SparkSocial = { admirers: [], meToo: [], builds: 0 };

export function socialFor(ideaId: string, social: Map<string, SparkSocial>): SparkSocial {
  return social.get(ideaId) ?? EMPTY;
}

// Per idea, the faces of those who admire it or said "me too", oldest first, and
// how many builds it has. Skips and check-in answers are not part of it.
export function socialByIdea(reactions: ReactionRow[], builds: BuildRow[]): Map<string, SparkSocial> {
  const out = new Map<string, SparkSocial>();
  const at = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { admirers: [], meToo: [], builds: 0 }));
    return s;
  };
  for (const r of [...reactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (r.kind === "admire") at(r.ideaId).admirers.push({ personId: r.personId, name: r.name });
    else if (r.kind === "me_too") at(r.ideaId).meToo.push({ personId: r.personId, name: r.name });
  }
  for (const b of builds) at(b.ideaId).builds += 1;
  return out;
}

/** "Việt Hà", "Quân and Ethan", "Quân, Ethan and 2 more". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export const DECK_SIZE = 3;

// The sparks a person has not answered yet, three at a time. A spark someone
// has admired, me-too'd, skipped or built on is answered for them. Order is
// fairness, not popularity: the sparks fewest teammates have answered come
// first, newest first among equals, and one author at a time, so the three
// people who write most cannot fill a deck between them.
export function deckFor(
  personId: string,
  ideas: IdeaRef[],
  reactions: ReactionRow[],
  builds: BuildRow[],
  size = DECK_SIZE,
): IdeaRef[] {
  const answered = new Set<string>();
  const responders = new Map<string, Set<string>>();
  const note = (ideaId: string, who: string, counts: boolean) => {
    if (who === personId) answered.add(ideaId);
    if (!counts) return;
    let s = responders.get(ideaId);
    if (!s) responders.set(ideaId, (s = new Set()));
    s.add(who);
  };
  for (const r of reactions) note(r.ideaId, r.personId, r.kind !== "skip");
  for (const b of builds) note(b.ideaId, b.personId, true);

  const open = ideas
    .filter((i) => i.person_id !== personId && !answered.has(i.id))
    .sort((a, b) => (responders.get(a.id)?.size ?? 0) - (responders.get(b.id)?.size ?? 0) || b.created_at.localeCompare(a.created_at));

  const deck: IdeaRef[] = [];
  const taken = new Set<string>();
  while (deck.length < size && taken.size < open.length) {
    const authors = new Set<string>();
    for (const i of open) {
      if (deck.length >= size) break;
      if (taken.has(i.id) || authors.has(i.person_id)) continue;
      authors.add(i.person_id);
      taken.add(i.id);
      deck.push(i);
    }
  }
  return deck;
}

export type CameBack = { ideaId: string; title: string; who: string[]; line: string; quote: string | null; at: string };

// What came back on a person's own sparks, newest first: one line per spark and
// kind of answer ("Quân and Derek admire …"), and one per build with its words.
// Only what teammates did; nothing the person did themselves, and never a skip.
/** A card picked up from a spark, as What came back needs it (the boards entity reads it). */
export type PickedCard = { ideaId: string; status: string; assigneeId: string | null; assigneeName: string | null; createdAt: string; completedAt: string | null };

export function cameBackFor(
  personId: string,
  ideas: IdeaRef[],
  reactions: ReactionRow[],
  builds: BuildRow[],
  limit = 4,
  cards: PickedCard[] = [],
): CameBack[] {
  const mine = new Map(ideas.filter((i) => i.person_id === personId).map((i) => [i.id, i]));
  const groups = new Map<string, CameBack & { names: string[] }>();
  for (const r of reactions) {
    const idea = mine.get(r.ideaId);
    if (!idea || r.personId === personId || !["admire", "me_too", "held", "unstuck"].includes(r.kind)) continue;
    const key = `${r.ideaId}:${r.kind}`;
    const g = groups.get(key) ?? { ideaId: r.ideaId, title: idea.title, who: [], names: [], line: "", quote: null, at: r.createdAt };
    if (!g.names.includes(r.name)) g.names.push(r.name);
    if (r.createdAt > g.at) g.at = r.createdAt;
    const plural = g.names.length > 1;
    g.line =
      r.kind === "admire"
        ? plural ? "admire" : "admires"
        : r.kind === "held"
          ? "tried it, and it held:"
          : r.kind === "unstuck"
            ? "tried it; it didn't stick:"
            : idea.kind === "learning" ? "will try" : plural ? "have hit this too:" : "has hit this too:";
    groups.set(key, g);
  }
  const items: CameBack[] = [...groups.values()].map(({ names, ...g }) => ({ ...g, who: names }));
  for (const b of builds) {
    const idea = mine.get(b.ideaId);
    if (!idea || b.personId === personId) continue;
    items.push({ ideaId: b.ideaId, title: idea.title, who: [b.name], line: "built on", quote: b.body, at: b.createdAt });
  }
  // A teammate taking a spark on, and the card landing, are the two answers
  // worth most (ID.2.8): "Khoa picked up …", then "… shipped". A card set aside
  // says nothing, and nor does a spark its author picked up themselves.
  for (const c of cards) {
    const idea = mine.get(c.ideaId);
    if (!idea || c.status === "not_doing" || c.assigneeId === personId) continue;
    const who = [c.assigneeName ?? "A teammate"];
    if (c.status === "done") items.push({ ideaId: c.ideaId, title: idea.title, who, line: "shipped", quote: null, at: c.completedAt ?? c.createdAt });
    else items.push({ ideaId: c.ideaId, title: idea.title, who, line: "picked up", quote: null, at: c.createdAt });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// Where a spark has got to (ID.2.8). One action moves it, never a count:
// a card linked to it and done is Shipped, one still open is Picked up, a
// build makes it Echoed, and otherwise it is a Spark.
export type SparkStage = "spark" | "echoed" | "picked_up" | "shipped";

export const STAGE_LABEL: Record<SparkStage, string> = {
  spark: "Spark",
  echoed: "Echoed",
  picked_up: "Picked up",
  shipped: "Shipped",
};

export function sparkStage(builds: number, cards: { status: string }[]): SparkStage {
  if (cards.some((c) => c.status === "done")) return "shipped";
  if (cards.some((c) => c.status !== "not_doing")) return "picked_up";
  return builds > 0 ? "echoed" : "spark";
}

// The stages that actually happened, each from its own fact (W.185). The track
// lit every stage before the current one, so a spark picked up with no builds
// showed Echoed as reached. A shipped card was picked up first, so Shipped
// implies Picked up; nothing implies Echoed but a build.
export function stagesReached(builds: number, cards: { status: string }[]): Set<SparkStage> {
  const reached = new Set<SparkStage>(["spark"]);
  if (builds > 0) reached.add("echoed");
  if (cards.some((c) => c.status !== "not_doing")) reached.add("picked_up");
  if (cards.some((c) => c.status === "done")) reached.add("shipped");
  return reached;
}

export const CHECK_IN_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

// "Did it hold?" (ID.2.9): one learning a person said they would try, at least
// two weeks ago, that they have not answered yet. "Still trying" asks again two
// weeks after it was said; "it held" and "it didn't stick" close it. Oldest
// first, one at a time, so the deck never turns into a to-do list.
export function checkInFor(personId: string, ideas: IdeaRef[], reactions: ReactionRow[], now: Date): IdeaRef | null {
  const ripe = (at: string) => now.getTime() - new Date(at).getTime() >= CHECK_IN_AFTER_DAYS * DAY_MS;
  const mine = reactions.filter((r) => r.personId === personId);
  const due = ideas
    .filter((i) => i.kind === "learning" && i.person_id !== personId)
    .filter((i) => {
      const said = mine.find((r) => r.ideaId === i.id && r.kind === "me_too");
      if (!said || !ripe(said.createdAt)) return false;
      if (mine.some((r) => r.ideaId === i.id && (r.kind === "held" || r.kind === "unstuck"))) return false;
      const trying = mine.find((r) => r.ideaId === i.id && r.kind === "trying");
      return !trying || ripe(trying.createdAt);
    })
    .map((i) => ({ i, at: mine.find((r) => r.ideaId === i.id && r.kind === "me_too")!.createdAt }))
    .sort((a, b) => a.at.localeCompare(b.at));
  return due[0]?.i ?? null;
}
