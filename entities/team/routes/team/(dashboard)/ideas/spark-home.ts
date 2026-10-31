// Spark on the team Home (TH.1.5): the sky, one card from the person's deck and
// the newest sparks, read the way /team/ideas reads them so the two pages can
// never disagree about a spark's stage or whose deck holds what.
//
// It lives beside the ideas page because the sky, the deck and the composer are
// that page's components; Home is a route of the same entity and borrows them.
import { getSharedIdeas, type SharedIdea } from "@/entities/team/lib/data";
import { deckFor, readSparkSignals, socialByIdea, socialFor, sparkStage, type SparkStage } from "@/entities/ideas";
import { cardsForIdeas } from "@/entities/boards";
import { skyStars, skyTicks, type SkyStar, type SkyTick } from "./sparks-model";
import { deckCard } from "./spark-faces";
import type { DeckCard } from "./SparkDeck";

// `deckAuthors` maps each deck card to its author's person id, so Home can draw
// the author's photo on the card the way it does on the list below (TH.25). It
// stays on the server: Home resolves it to an avatar URL before the card reaches
// the browser.
export type SparkHome = { stars: SkyStar[]; ticks: SkyTick[]; deck: DeckCard[]; deckAuthors: Record<string, string>; latest: SharedIdea[] };

/** Home shows a taste of Spark, not the page: one deck card and the three newest sparks. */
const DECK_ON_HOME = 1;
const LATEST_ON_HOME = 3;

export async function sparkForHome(personId: string): Promise<SparkHome> {
  const all = await getSharedIdeas();
  const { reactions, builds } = await readSparkSignals();
  const social = socialByIdea(reactions, builds);
  const byId = new Map(all.map((i) => [i.id, i]));
  const deck = deckFor(personId, all, reactions, builds, DECK_ON_HOME).map((ref) => deckCard(byId.get(ref.id)!, socialFor(ref.id, social)));
  const cards = await cardsForIdeas(all.map((i) => i.id));
  const stages = new Map<string, SparkStage>(
    all.map((i) => [i.id, sparkStage(socialFor(i.id, social).builds, cards.filter((c) => c.ideaId === i.id))]),
  );
  const now = new Date();
  const inDeck = new Set(deck.map((d) => d.id));
  return {
    stars: skyStars(all, now, personId, (id) => stages.get(id) ?? "spark"),
    ticks: skyTicks(all, now),
    deck,
    deckAuthors: Object.fromEntries(deck.map((d) => [d.id, byId.get(d.id)!.person_id])),
    // The deck card already shows one spark; the list shows the others.
    latest: all.filter((i) => !inDeck.has(i.id)).slice(0, LATEST_ON_HOME),
  };
}
