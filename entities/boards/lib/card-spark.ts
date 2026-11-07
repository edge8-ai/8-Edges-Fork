// The spark a card was picked up from (TH.4.2). The link has lived in the
// card's metadata since ID.2.8 (idea_id); the spark's line and who shared it
// are copied beside it at pick-up, because boards cannot read Spark: a
// deployment may install the Workboard alone (deployments/minimal.json), and
// there no card ever has an idea_id. Pure and browser-safe, so the card face,
// the drawer and My week all read the same answer.
import { greetingName } from "@/kernel/config/people-name";
import { isDone } from "./card-stage";

export type SparkLabel = { title: string; authorName: string; authorId: string | null };

export function sparkLabelMetadata(label: SparkLabel): Record<string, string | null> {
  return { idea_title: label.title, idea_author_name: label.authorName, idea_author_id: label.authorId };
}

export type CardSpark = {
  ideaId: string;
  /** Null on a card picked up before the label was copied: the mark still shows, without a name. */
  title: string | null;
  authorName: string | null;
  authorFirst: string | null;
  authorId: string | null;
  /** Where this card puts the spark: Shipped once the card is done, Picked up before. */
  stage: "picked_up" | "shipped";
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function cardSpark(card: { metadata: Record<string, unknown> | null; status: string }): CardSpark | null {
  const ideaId = text(card.metadata?.["idea_id"]);
  if (!ideaId) return null;
  const authorName = text(card.metadata?.["idea_author_name"]);
  return {
    ideaId,
    title: text(card.metadata?.["idea_title"]),
    authorName,
    // The name is a display_name (Given Family); the kernel cuts it to a word,
    // the one place a name is cut (S.14), as the board's own chips do.
    authorFirst: authorName ? greetingName({ display_name: authorName }, null) : null,
    authorId: text(card.metadata?.["idea_author_id"]),
    stage: isDone(card) ? "shipped" : "picked_up",
  };
}
