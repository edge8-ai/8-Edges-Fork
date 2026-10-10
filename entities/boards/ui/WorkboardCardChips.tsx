"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { Icon } from "@/kernel/ui/Icon";
import { formatDate } from "@/kernel/ui/format";
import { externalHref } from "@/kernel/ui/url";
import { SUBJECT_BACKLOG_ITEM, SUBJECT_COMMITMENT, cardPrSync, cardPrUrl, cardSnoozedUntil, cardStuck } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";
import { blockedLabel, facePrLabel } from "./card-face";

/** How many identity chips a card shows before the rest fold into "+N". */
export const CHIP_CAP = 2;

/** What the card's chips need to know that is not on the card itself. */
export type ChipContext = {
  board: WorkboardBoard | undefined;
  /** Several boards are in scope, so the card says whose it is. */
  showBoard: boolean;
  /** This card is freshly assigned to the reader (WorkboardCard.isNewForViewer). */
  isNew: boolean;
  /** Unresolved blockers on the card (card-facts). */
  openBlockers: number;
  /** Days in this column when that is long enough to be a warning, else null (card-facts). */
  agingDays: number | null;
  sprintFilter: string;
  sprintName: Map<string, string>;
  hideInternal: boolean;
  hideClient: boolean;
  hideSprint: boolean;
};

/**
 * Which labels a card wears, and in what order (W.92.3).
 *
 * The ORDER is the whole decision, because the cap takes the front of the
 * list: the chips are sorted by how much each one distinguishes THIS card
 * from the cards beside it in the same column.
 *
 *  - "New" is about the reader and changes what they do next, so it leads.
 *    "Mine" went with W.160: the avatar at the end of the meta line says it;
 *  - the kind of work comes next, then the sprint it was promised in;
 *  - Internal and the client go near the back, because they are the two most
 *    often true of a whole column — and a chip true of every card on screen
 *    distinguishes none of them. Where that is true of ALL of them the board
 *    has already dropped the chip entirely (workboard-chip-scope.ts, and the
 *    playbook's last consequence); this ordering handles the ordinary case
 *    where it is merely true of most;
 *  - the PR is last because it is a link out — the one chip you reach for
 *    deliberately rather than notice.
 */
export function cardChips(c: Card, ctx: ChipContext): { always: ReactNode[]; capped: ReactNode[] } {
  const snoozedUntil = cardSnoozedUntil(c);
  const prUrl = cardPrUrl(c);
  // Only a real http(s) link becomes the chip (W.116): a stored value with no
  // scheme was a path inside this app, and a `javascript:` one ran on click.
  const prHref = externalHref(prUrl);
  const prState = cardPrSync(c)?.state ?? null;
  return {
    // Two states the card can be parked in, and neither may ever be the one
    // hidden behind a "+2". Both wear --admin-warn, which the colour
    // hierarchy reserves ON A CARD for overdue, blocked and aging: a card
    // asking for a hand is the blocked family, and a snoozed card shown on
    // purpose has to say why it is out of the normal flow.
    // Blocked and aging are trouble of the same family, so they never fold
    // either (W.160 made them chips; they were counts in a facts row).
    always: [
      ctx.openBlockers > 0 ? (
        <Badge key="blocked" tone="err">
          <Icon name="alert" /> {blockedLabel(ctx.openBlockers)}
        </Badge>
      ) : null,
      ctx.agingDays !== null ? (
        // The clock and the days, as the facts row had it: a sentence here
        // was cut by the chip cap on a busy card. The title says it in full.
        <Badge key="aging" tone="warn" title={`In this column for ${ctx.agingDays} days`}>
          <Icon name="clock" /> {ctx.agingDays}d
        </Badge>
      ) : null,
      cardStuck(c) ? <Badge key="stuck" tone="warn">Needs a hand</Badge> : null,
      snoozedUntil ? <Badge key="snoozed" tone="warn">Snoozed to {formatDate(snoozedUntil)}</Badge> : null,
    ].filter(Boolean),
    capped: [
      ctx.isNew ? <Badge key="new" tone="info">New</Badge> : null,
      c.subject_type === SUBJECT_COMMITMENT ? <Badge key="commitment" tone="ok">Commitment</Badge> : null,
      c.subject_type === SUBJECT_BACKLOG_ITEM ? <Badge key="roadmap" tone="info">Roadmap</Badge> : null,
      c.agent ? <Badge key="agent" tone="neutral">Agent</Badge> : null,
      // The sprint, Internal and the client are no longer chips (W.107). All
      // three are IDENTITY, not state: under "All sprint weeks" the sprint chip
      // sat on every card, and with the client already on the edge and the
      // epic already the eyebrow, the row read as three labels saying where
      // the card lives, over and over down the lane. The client keeps one
      // quiet pill at the end of the meta line (WorkboardCard); the sprint
      // and Internal are in the drawer and the filters, which is where you
      // look for them. What is left here is what CHANGES: the reader's
      // relation to the card, the kind of work, and the way out to its PR.
      prHref ? (
        <a
          key="pr"
          className={`wb-chip-link${prState ? ` is-${prState}` : ""}`}
          href={prHref}
          target="_blank"
          rel="noreferrer"
          title={prUrl}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="branch" /> {facePrLabel(prUrl, prState)}
        </a>
      ) : null,
    ].filter(Boolean),
  };
}

/**
 * The chips on a Workboard card, capped (W.92.3).
 *
 * A busy card carried up to eight at once — New, Mine, Commitment, Roadmap,
 * Agent, a sprint, Internal, a client, a PR link — which wrapped to three
 * lines and made every card a different height, so a column could not be
 * scanned. Two are shown and the rest become one "+N" the reader can open.
 *
 * WHICH TWO IS NOT A GUESS. The caller passes them already ordered by how
 * much they distinguish THIS card from the cards beside it, and the cap takes
 * the front of that list (WorkboardCard decides the order and says why).
 *
 * WHAT NEVER FOLDS. Anything saying something is WRONG is passed as `always`
 * and is drawn outside the cap. The colour hierarchy reserves amber and red
 * on a card for overdue, blocked and aging (playbook, rule 5), and a
 * reservation is worthless if the chip that carries it can be the one hidden
 * behind a "+2" — scanning a column asks "is anything wrong here", and that
 * question has to be answerable without opening anything.
 *
 * THE DISCLOSURE IS OPERABLE, not a hover trick. It is a real button with
 * `aria-expanded`, so it works from a keyboard and on a touch screen where
 * there is no hover at all; the CSS additionally reveals the rest on hover
 * and on focus-within, which is the fast path for a mouse and costs the other
 * two nothing.
 */
export function WorkboardCardChips({ always, capped }: { always: ReactNode[]; capped: ReactNode[] }) {
  const [open, setOpen] = useState(false);
  // An empty row is still drawn (W.114): the Workboard keeps its height so a
  // card with no chips is as tall as one with them and the lanes stay in line
  // row by row. `:empty` hides it on every other surface, as the eyebrow does.
  if (always.length === 0 && capped.length === 0) return <div className="admin-kanban-card-meta wb-chips" />;
  const shown = capped.slice(0, CHIP_CAP);
  const hidden = capped.slice(CHIP_CAP);
  return (
    <div className={`admin-kanban-card-meta wb-chips${open ? " is-open" : ""}`}>
      {always}
      {shown}
      {hidden.length > 0 && (
        <>
          {/* The hidden chips are in the markup all along rather than mounted
              on demand: a card's height must not jump under the pointer as it
              crosses the row, and CSS can reveal what is already there
              without the board re-rendering. */}
          <span className="wb-chips-rest">{hidden}</span>
          <button
            type="button"
            className="wb-chips-more"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} ${hidden.length} more label${hidden.length === 1 ? "" : "s"}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            +{hidden.length}
          </button>
        </>
      )}
    </div>
  );
}
