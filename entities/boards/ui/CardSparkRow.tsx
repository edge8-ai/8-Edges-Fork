"use client";

import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import { cardSpark } from "@/entities/boards/lib/card-spark";
import { initials } from "@/kernel/ui/format";
import { SparkStar } from "./SparkChip";

const STAGE: Record<"picked_up" | "shipped", string> = { picked_up: "Picked up", shipped: "Shipped" };

// The spark a card was picked up from, in the drawer under Client and Board
// (TH.4.2). Until now the only trace was a path pasted into the description
// and "picked up from a spark" in the activity. It is drawn on every board,
// including a single board's page where the where-rows are not, and only on a
// saved card that carries an idea_id. The note says the loop closes: the
// spark's author hears when the card lands, which onCardCompleted makes true
// (entities/ideas/lib/subscriptions.ts). It is left out for the author, who
// would be told about their own card.
export function CardSparkRow({ card, viewerPersonId }: { card: WorkboardCard | null; viewerPersonId: string | null }) {
  const spark = card ? cardSpark(card) : null;
  if (!spark) return null;
  const who = spark.authorName ? `${spark.authorName}'s spark` : "A teammate's spark";
  return (
    <div className="wb-core-fields wb-spark" role="group" aria-label="Picked up from a spark">
      <div className="wb-core-row">
        <span className="wb-core-label">Spark</span>
        <span className="wb-core-value wb-spark-value">
          <a className="wb-spark-link" href={`/team/ideas/${spark.ideaId}`}>
            <SparkStar spark={spark} />
            {spark.authorName && (
              <span className="wb-chip-avatar" aria-hidden="true">
                {initials(spark.authorName)}
              </span>
            )}
            <span className="wb-spark-text">
              <strong>
                {who} · {STAGE[spark.stage]}
              </strong>
              {spark.title && <span>{spark.title}</span>}
            </span>
            <span className="wb-spark-open">Open →</span>
          </a>
        </span>
      </div>
      {spark.stage === "picked_up" && spark.authorFirst && spark.authorId !== viewerPersonId && (
        <p className="wb-spark-hint">{spark.authorFirst} hears when this card lands in Done, and the star turns to Shipped.</p>
      )}
    </div>
  );
}
