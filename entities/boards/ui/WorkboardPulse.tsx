"use client";

import { useMemo, type CSSProperties } from "react";
import { saigonToday } from "@/kernel/config/dates";
import { Icon } from "@/kernel/ui/Icon";
import { attentionFor, needsAttention, ATTENTION_LABEL, type AttentionId } from "@/entities/boards/lib/card-attention";
import { cardsDrawnOnBoard } from "@/entities/boards/lib/workboard-columns-window";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { WorkboardFilters } from "./useWorkboardFilters";
import { groupColumns, groupingVocabulary } from "./workboard-grouping";
import { closedLaneIds } from "./workboard-column-state";
import { WorkboardFilterSentence } from "./WorkboardFilterSentence";

// The pulse (W.174): the shape of what is in view, in My Week's strip
// language. One cell per lane, coloured by the lane's own accent so it reads as
// the board in miniature, then the two kinds of attention the Flow tiles count.
// Khoa, 2026-10-07: the board's UX was right and its page looked boring beside
// My Week, whose strip is what makes that page feel alive.
//
// EVERY CELL IS A WAY IN, as each of My Week's cells is. Pressing one sets the
// same lane or attention filter the toolbar's pickers set, so a number is
// never decoration: "3 overdue" is one click from being the three cards.
//
// It counts the scope BEFORE those two filters (scopeCards), or pressing Doing
// would zero every other cell and leave nothing to press next. The Done cell
// counts what the board draws in Done, through the same window, so it agrees
// with the column it stands for. Not Doing is left out: it is where work went
// to stop, and the strip is about the work.
//
// It sits where the filter sentence was and carries that sentence at its right
// end. The lanes' height is whatever the window has left under the chrome
// (useBoardViewport), so a new row here would have come out of every lane on a
// laptop; sharing the row costs them nothing.
export function WorkboardPulse({ data, f, doneWindowStart }: { data: WorkboardData; f: WorkboardFilters; doneWindowStart: string | null }) {
  const lanes = useMemo(() => {
    const accent = new Map(groupColumns("lane", [], groupingVocabulary(data)).map((c) => [c.id, c.accent]));
    return data.lanes.filter((l) => !l.isNotDoing).map((l) => ({ ...l, accent: accent.get(l.id) }));
  }, [data]);
  const kinds = useMemo(() => attentionFor({ clientSafe: data.clientSafe }), [data.clientSafe]);

  // Read every render and named in the deps, as the filter hook does, so an
  // open tab crossing Saigon midnight moves Overdue with the board.
  const today = saigonToday();
  const counts = useMemo(() => {
    // The board's own rule for which columns the window shortens: closed lanes,
    // and only while the board is grouped by lane (useBoardColumnRules).
    const drawn = cardsDrawnOnBoard(f.scopeCards, { doneColumnIds: closedLaneIds(f.group, data.lanes), windowStart: doneWindowStart });
    const byLane = new Map<string, number>();
    for (const c of drawn) byLane.set(c.columnId, (byLane.get(c.columnId) ?? 0) + 1);
    const byKind = new Map(kinds.map((k) => [k, drawn.filter((c) => needsAttention(c, [k], today)).length]));
    return { byLane, byKind };
  }, [data.lanes, f.scopeCards, f.group, doneWindowStart, kinds, today]);

  if (data.cards.length === 0) return <WorkboardFilterSentence f={f} data={data} totalCards={data.cards.length} />;

  const toggle = <T extends string>(list: T[], id: T) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    // On a phone the Board view draws one lane at a time behind its own picker
    // (WorkboardColumnPicker), which already counts each lane; the board modifier
    // lets the stylesheet drop the lane cells there rather than say it twice.
    <div className={`wb-pulse${f.view === "board" ? " wb-pulse--board" : ""}`}>
      <ul className="wb-pulse-cells" aria-label="What is in view">
        {lanes.map((l) => {
          const n = counts.byLane.get(l.id) ?? 0;
          const on = f.laneFilter.includes(l.id);
          return (
            <li key={l.id} className="wb-pulse-lane">
              <button
                type="button"
                className={`wb-pulse-cell${l.isDone ? " wb-pulse-cell--done" : ""}${n === 0 ? " is-quiet" : ""}${on ? " is-on" : ""}`}
                style={l.accent ? ({ "--wb-pulse-accent": l.accent } as CSSProperties) : undefined}
                aria-pressed={on}
                disabled={n === 0 && !on}
                title={on ? `Show every lane again` : `Show only ${l.name}`}
                onClick={() => f.setLaneFilter(toggle(f.laneFilter, l.id))}
              >
                <span className="wb-pulse-dot" aria-hidden="true" />
                <span className="wb-pulse-label">{l.name}</span>
                <span key={n} className="wb-pulse-n">{n}</span>
              </button>
            </li>
          );
        })}
        {kinds.map((k, i) => (
          <AttentionCell key={k} kind={k} first={i === 0} n={counts.byKind.get(k) ?? 0} on={f.attentionFilter.includes(k)} onPress={() => f.setAttentionFilter(toggle(f.attentionFilter, k))} />
        ))}
      </ul>
      <WorkboardFilterSentence f={f} data={data} totalCards={data.cards.length} />
    </div>
  );
}

/**
 * Overdue and Blocked. Tinted only while they hold something: a red cell that
 * says 0 is an alarm about nothing, and the one alert colour stays for lateness
 * (My Week's rule).
 */
function AttentionCell({ kind, first, n, on, onPress }: { kind: AttentionId; first: boolean; n: number; on: boolean; onPress: () => void }) {
  return (
    <li className={first ? "wb-pulse-split" : undefined}>
      <button
        type="button"
        className={`wb-pulse-cell wb-pulse-cell--${kind}${n === 0 ? " is-quiet" : " has-any"}${on ? " is-on" : ""}`}
        aria-pressed={on}
        disabled={n === 0 && !on}
        title={on ? "Show every card again" : `Show only ${ATTENTION_LABEL[kind].toLowerCase()} cards`}
        onClick={onPress}
      >
        <Icon name={kind === "overdue" ? "clock" : "alert"} />
        <span className="wb-pulse-label">{ATTENTION_LABEL[kind]}</span>
        <span key={n} className="wb-pulse-n">{n}</span>
      </button>
    </li>
  );
}
