"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import { restoreBoard } from "@/entities/boards/lib/board-actions";
import type { BoardListItem } from "@/entities/boards/lib/data";

// The archived boards. An archived board does not open (its page reads live
// boards only), so a row here is not a link: it says when the board was
// archived and offers the way back.
export function InactiveBoards({ boards }: { boards: BoardListItem[] }) {
  const router = useRouter();

  return boards.length === 0 ? (
    <div className="admin-card admin-section-card">
      <span className="admin-cell-muted">No inactive boards.</span>
    </div>
  ) : (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Board</th>
              <th>Client</th>
              <th>Archived</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {boards.map((b) => (
              <tr key={b.id}>
                <td className="admin-cell-strong">{b.name}</td>
                <td>
                  {b.client_name ?? (
                    <span className="admin-cell-muted">Internal</span>
                  )}
                </td>
                <td>{formatDate(b.archived_at)}</td>
                <td className="u-right">
                  <ConfirmButton
                    label="Restore"
                    className="admin-btn admin-btn--sm"
                    title="Restore this board?"
                    body={
                      <>
                        <strong>{b.name}</strong> comes back to everyone&apos;s
                        boards with its cards as they were.
                      </>
                    }
                    confirmLabel="Restore"
                    onConfirm={() => restoreBoard(b.id)}
                    onDone={() => router.refresh()}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
