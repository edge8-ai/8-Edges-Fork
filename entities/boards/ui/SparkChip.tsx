import type { CardSpark } from "@/entities/boards/lib/card-spark";

// The mark of a card picked up from a spark (TH.4.2), on the card face and in
// My week. It speaks the team sky's language: a piece of the night with the
// star in it, amber while the card is open and mint once it lands, the colours
// the sky's legend gives Picked up and Shipped (W.190).
//
// On the card face it is a link to the spark; inside a row that is already a
// link (My week) it is a plain label, because a link cannot hold a link.

function label(spark: CardSpark): string {
  return spark.authorFirst ? `${spark.authorFirst}'s spark` : "From a spark";
}

function title(spark: CardSpark): string {
  const from = spark.authorName ? `Picked up from ${spark.authorName}'s spark` : "Picked up from a spark";
  return spark.title ? `${from}: ${spark.title}` : from;
}

export function SparkStar({ spark }: { spark: CardSpark }) {
  return (
    <span className="wb-spark-sky" aria-hidden="true">
      <span className={`wb-spark-star is-${spark.stage}`} />
    </span>
  );
}

export function SparkChip({ spark, asLabel = false }: { spark: CardSpark; asLabel?: boolean }) {
  const inner = (
    <>
      <SparkStar spark={spark} />
      {label(spark)}
    </>
  );
  if (asLabel) {
    return (
      <span className="wb-spark-chip" title={title(spark)}>
        {inner}
      </span>
    );
  }
  return (
    <a
      className="wb-spark-chip"
      href={`/team/ideas/${spark.ideaId}`}
      title={title(spark)}
      // The card under the chip opens its drawer on a click and starts a drag
      // on a press; the chip is a way out instead, as the PR chip is.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </a>
  );
}
