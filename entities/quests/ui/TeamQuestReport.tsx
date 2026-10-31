// The manager report as the Team view draws it (QS.3b; ADR 0020), as Khoa
// approved its prototype on 2026-10-28: the same report as the Admin view's
// (QuestReport.tsx), opened from the Team sidebar under Quests so a manager who
// is not an admin can reach it. The read, the reach and the words are shared;
// only the drawing is the Team view's. That means a face beside each name and
// the Quests page's own Standing pills, where a Missed is the page's quiet
// dashed grey rather than the Admin view's red, because /team is never
// corporate and the page is read by the person's own manager.
//
// As on the Admin view there is a quest picker and no person picker, and who
// appears is the read model's answer (lib/quest-report.ts), never this file's.
import type { ReactNode } from "react";
import { Avatar } from "@/kernel/ui/Avatar";
import { initials } from "@/kernel/ui/format";
import type { QuestReport, ReportCell, ReportQuestOption } from "../lib/quest-report";
import { QuestPicker } from "./QuestPicker";
import { choiceLabel, metaLine } from "./QuestReport";
import { portraitTone } from "./quests-model";

/** One Standing as the Quests page draws it (.qs-standing in quests.css), in the glossary's words. */
function StandingPill({ cell }: { cell: ReportCell | null }): ReactNode {
  if (!cell) return <span className="qr-none" title="Not called on this head">—</span>;
  const word =
    cell.standing === "missed"
      ? "Missed"
      : cell.standing === "turned_in"
        ? cell.late
          ? "Turned in late"
          : "Turned in"
        : cell.standing === "accepted"
          ? "Accepted"
          : cell.standing === "called"
            ? "Called"
            : "Handed back";
  return <span className={`qs-standing qs-standing--${cell.standing}`}>{word}</span>;
}

export function TeamQuestReportView({
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
    return <div className="qr-card qr-empty">No Bounty has been posted yet. Once one is, pick it here to see who missed it.</div>;
  }
  return (
    <div className="qr qr--team">
      <div className="qr-bar">
        <QuestPicker basePath={basePath} choices={options.map((o) => ({ id: o.id, label: choiceLabel(o) }))} pickedId={pickedId} />
        {report && <p className="qr-meta">{metaLine(report)}</p>}
      </div>
      {!report ? (
        <div className="qr-card qr-empty">That Bounty is not on the list. Pick one above.</div>
      ) : (
        <section className="qr-card" aria-label={`Who missed ${report.quest.title}`}>
          {report.rows.length === 0 ? (
            <p className="qr-empty">Nobody you manage was on this Bounty.</p>
          ) : (
            <div className="qr-scroll">
              <table className="qr-table qr-table--team">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    {report.heads.map((h) => (
                      <th key={h.id} scope="col">
                        {h.ask}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.personId}>
                      <td>
                        <span className="qr-who">
                          <Avatar className={`qs-av qs-tone-${portraitTone(r.personId)}`} name={r.name} initials={initials(r.name)} decorative />
                          {r.name}
                        </span>
                      </td>
                      {r.heads.map((c, i) => (
                        <td key={report.heads[i]!.id}>
                          <StandingPill cell={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <p className="qr-foot">A late turn-in lifts a Missed. A withdrawn Bounty has no Missed.</p>
    </div>
  );
}
