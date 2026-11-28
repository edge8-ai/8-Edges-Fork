import { heatLevel } from "@/entities/coaching/lib/history-shared";
import { formatDate } from "@/kernel/ui/format";

// One square of the History heatmap (K.28). Colour alone said how a meeting
// went, which is nothing to a screen reader and little to a colour-blind
// reader, so the square is an image with a text alternative: the date and the
// kept-out-of-made count it stands for. The title stays for a sighted reader's
// hover. The square describes a meeting's commitments, never a person.

export function HeatSquare({ heldOn, kept, made }: { heldOn: string; kept: number; made: number }) {
  const text = `${formatDate(heldOn)}: ${kept} of ${made} kept`;
  return (
    <span
      role="img"
      className={`admin-heatmap-square admin-heatmap-square--${heatLevel(kept, made)}`}
      title={text}
    >
      <span className="u-sr-only">{text}</span>
    </span>
  );
}
