import Link from "next/link";
import type { SharedIdea } from "@/entities/team/lib/data";
import { Badge } from "@/kernel/ui/Badge";
import { Icon } from "@/kernel/ui/Icon";
import { formatDate, initials } from "@/kernel/ui/format";
import { OFFICE_LABEL, officeTone, type IdeaOffice } from "@/entities/ideas";
import { STAGE_LABEL, type SparkStage } from "@/entities/ideas";
import { KIND_LABEL, avatarTone, sparkHook, sparkKind } from "../sparks-model";
import type { MayProp } from "@/kernel/identity/may-prop";
import { SparkTitle } from "./SparkTitle";
import { SparkWithdraw } from "./SparkWithdraw";

// The head of one spark's page (ID.2.4): what it is, who shared it, its
// one-line hook, and, for the author's own one-line idea, the way to grow it
// into a 5D plan. A pure function of the row, so it renders without a session.

// A learning is tried, never picked up, so its track stops at Echoed.
const BUILD_STAGES: SparkStage[] = ["spark", "echoed", "picked_up", "shipped"];
const LEARNING_STAGES: SparkStage[] = ["spark", "echoed"];

export function SparkHead({
  idea,
  isOwner,
  hasFiveD,
  stage,
  reached,
  onBoard,
  may,
  canPutBack,
}: {
  idea: SharedIdea;
  isOwner: boolean;
  hasFiveD: boolean;
  stage: SparkStage;
  /** The stages that happened (stagesReached); the rest stay grey, a skipped one included. */
  reached: SparkStage[];
  /** A card picked up from this spark is on the board, so it cannot be withdrawn (TH.4.6). */
  onBoard: boolean;
  /** Whether the viewer holds the atom own-spark-actions guards (ADR 0014). */
  may: MayProp;
  /** A withdrawn spark the author may put back: their own withdrawal, not an admin's archive. */
  canPutBack: boolean;
}) {
  const kind = sparkKind(idea);
  const hook = sparkHook(idea);
  const withdrawn = idea.status === "archived";
  // The author's own tools (TH.4.6): fix the line of a spark with no plan, and
  // withdraw or put back a spark nobody has on the board.
  const canRename = isOwner && !idea.ai_plan && !withdrawn;
  const canGrow = canRename && kind === "build";
  const canWithdraw = isOwner && (withdrawn || !onBoard);
  const STAGES = kind === "learning" ? LEARNING_STAGES : BUILD_STAGES;

  return (
    <section className="sparks-card" aria-labelledby="spark-title">
      <div className="sparks-chips">
        <Badge tone={kind === "learning" ? "ok" : "info"}>{KIND_LABEL[kind]}</Badge>
        {idea.office && <Badge tone={officeTone(idea.office)}>{OFFICE_LABEL[idea.office as IdeaOffice]}</Badge>}
      </div>
      <SparkTitle ideaId={idea.id} title={idea.title} canRename={canRename} may={may} />
      <div className="sparks-detail-by">
        <span className={`sparks-avatar sparks-avatar--lg sparks-avatar--${avatarTone(idea.person_id)}`} aria-hidden="true">
          {initials(idea.submitterName)}
        </span>
        <span>
          <strong>{isOwner ? "You" : idea.submitterName}</strong> · {formatDate(idea.created_at)}
        </span>
      </div>
      <ol className="sparks-track" aria-label={`Stage: ${STAGE_LABEL[stage]}`}>
        {STAGES.map((st) => {
          const now = st === stage;
          const past = !now && reached.includes(st);
          return (
            <li key={st} className={now ? "is-now" : past ? "is-past" : ""} aria-current={now ? "step" : undefined}>
              {past && <Icon name="check" />}
              {STAGE_LABEL[st]}
              {!now && !past && <span className="sparks-sr">, not reached</span>}
            </li>
          );
        })}
      </ol>
      {hook && hook !== idea.title && <p className="sparks-detail-hook">{hook}</p>}
      {canGrow && (
        <div className="sparks-grow">
          <p>
            {hasFiveD
              ? "Your spark has a start. Walk the rest of the 5D framework and Claude writes the product plan."
              : "This spark is one line so far. Walk the 5D framework and Claude turns it into a product plan you keep."}
          </p>
          <Link className="sparks-btn-blue" href={`/team/ideas?compose=build&from=${idea.id}`}>
            Grow it with Claude
          </Link>
        </div>
      )}
      {canWithdraw && <SparkWithdraw ideaId={idea.id} withdrawn={withdrawn} canPutBack={canPutBack} may={may} />}
    </section>
  );
}
