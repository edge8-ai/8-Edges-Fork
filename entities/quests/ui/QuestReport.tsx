// The manager report as the Admin view draws it (QS.3; ADR 0020), as Khoa
// approved it on 2026-10-27: a quest picker with the Bounty's facts beside it,
// then one row per person the reader reaches on that one Bounty with their
// Standing on each head as a pill, and a footnote on what lifts a Missed. It is
// a plain, dense admin table, because the admin surface is corporate and the
// Quests page is the game. There is no person picker and no search box: the
// only way in is a quest, so nothing here can be turned into a person's record
// across quests. Who appears is the read model's answer (lib/quest-report.ts),
// never this file's.
import type { ReactNode } from "react";
import { Badge } from "@/kernel/ui/Badge";
import type { QuestReport, ReportCell, ReportQuestOption } from "../lib/quest-report";
import { QuestPicker } from "./QuestPicker";
import { dueParts } from "./quests-model";

/** "Fri 24 Oct", read in Saigon. */
const dayOf = (iso: string) => dueParts(iso).day;
/** "24 Oct": the picker's shorter form of the same day. */
const dateOf = (iso: string) => dayOf(iso).replace(/^\S+\s/, "");

/** A Bounty as the picker lists it: "<title> · closed 24 Oct", or "<title> · open". */
export function choiceLabel(o: ReportQuestOption): string {
  if (o.state === "open") return `${o.title} · open`;
  return o.closedAt ? `${o.title} · closed ${dateOf(o.closedAt)}` : `${o.title} · closed`;
}

/** The line beside the picker: "Required · closed Fri 24 Oct · 2 heads · given by Dave". */
export function metaLine(r: QuestReport): string {
  const q = r.quest;
  const state = q.state === "open" ? "open" : q.state === "withdrawn" ? "withdrawn" : q.closedAt ? `closed ${dayOf(q.closedAt)}` : "closed";
  return [q.required ? "Required" : "Optional", state, ...(r.heads.length > 1 ? [`${r.heads.length} heads`] : []), `given by ${q.giverName}`].join(" · ");
}

/** One Standing as a pill, in the glossary's words: Missed in the error tokens, a Turn-in in the ok tokens, the rest neutral grey. */
function StandingPill({ cell }: { cell: ReportCell | null }): ReactNode {
  if (!cell) return <span className="admin-cell-muted" title="Not called on this head">—</span>;
  switch (cell.standing) {
    case "missed":
      return <Badge tone="err">Missed</Badge>;
    case "turned_in":
      return <Badge tone="ok">{cell.late ? "Turned in late" : "Turned in"}</Badge>;
    case "accepted":
      return <Badge>Accepted</Badge>;
    case "called":
      return <Badge>Called</Badge>;
    case "handed_back":
      return <Badge>Handed back</Badge>;
  }
}

export function QuestReportView({
  basePath,
  options,
  pickedId,
  report,
}: {
  basePath: string;
  options: ReportQuestOption[];
  /** The quest asked for, or null when none was asked for and none could be offered. */
  pickedId: string | null;
  /** That quest's report for the reader, or null when it is not a Bounty on the list. */
  report: QuestReport | null;
}) {
  if (options.length === 0) {
    return <div className="admin-table-wrap qr-empty">No Bounty has been posted yet. Once one is, pick it here to see who missed it.</div>;
  }
  return (
    <div className="qr">
      <div className="qr-bar">
        <QuestPicker basePath={basePath} choices={options.map((o) => ({ id: o.id, label: choiceLabel(o) }))} pickedId={pickedId} />
        {report && <p className="qr-meta">{metaLine(report)}</p>}
      </div>
      {!report ? (
        <div className="admin-table-wrap qr-empty">That Bounty is not on the list. Pick one above.</div>
      ) : (
        <section className="admin-table-wrap" aria-label={`Who missed ${report.quest.title}`}>
          {report.rows.length === 0 ? (
            <p className="qr-empty">Nobody you manage was on this Bounty.</p>
          ) : (
            <table className="admin-table qr-table">
              <thead>
                <tr>
                  <th>Person</th>
                  {report.heads.map((h) => (
                    <th key={h.id}>{h.ask}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.personId}>
                    <td className="admin-cell-strong">{r.name}</td>
                    {r.heads.map((c, i) => (
                      <td key={report.heads[i]!.id}>
                        <StandingPill cell={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      <p className="qr-foot">A late turn-in lifts a Missed. A withdrawn Bounty has no Missed.</p>
    </div>
  );
}
