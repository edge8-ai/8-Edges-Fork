import { Icon } from "@/kernel/ui/Icon";

// The deck's three resting cards (TH.4.3). "You're caught up" only when no
// spark is left; between rounds, "Three answered" with the choice to go on;
// and a goodbye that says the rest keep their place. Never a wall of 37 and
// never "caught up" while sparks still wait.

export function DeckPause({
  kind,
  answered,
  waiting,
  onKeepGoing,
  onRest,
}: {
  kind: "done" | "round" | "rest";
  /** How many sparks the round just finished held; the check-in is not one, so a full round says three. */
  answered: number;
  waiting: number;
  onKeepGoing: () => void;
  onRest: () => void;
}) {
  return (
    <div className="sparks-deck-card sparks-deck-card--done">
      <span className="sparks-deck-check" aria-hidden="true">
        <Icon name="check" />
      </span>
      {kind === "done" ? (
        <>
          <strong>You&apos;re caught up.</strong>
          <p>Whoever shared those knows someone read them. More arrive as teammates share.</p>
        </>
      ) : kind === "round" ? (
        <>
          <strong>{answered === 3 ? "Three answered." : `${answered} answered.`}</strong>
          <p>
            {waiting} more {waiting === 1 ? "is" : "are"} waiting, a different teammate each time. Whoever shared those knows someone read
            them.
          </p>
          <div className="sparks-deck-next">
            <button type="button" className="sparks-btn-dark" onClick={onKeepGoing}>
              Keep going
            </button>
            <button type="button" className="sparks-answer-text" onClick={onRest}>
              That&apos;s enough for today
            </button>
          </div>
        </>
      ) : (
        <>
          <strong>See you next time.</strong>
          <p>
            {waiting} {waiting === 1 ? "spark stays" : "sparks stay"} in your deck, in the same order, for whenever you come back.
          </p>
          <div className="sparks-deck-next">
            <button type="button" className="sparks-answer-text" onClick={onKeepGoing}>
              Keep going now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
