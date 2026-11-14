"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents, formatDate } from "@/kernel/ui/format";
import { dealPath } from "@/kernel/config/slug";
import { useServerSyncedState } from "@/kernel/ui/hooks/useServerSyncedState";
import { useWrite } from "@/kernel/ui/hooks/useWrite";
import { decideHandoff, reorderDeals } from "./actions";
import { moveDealAccepting } from "./move-deal";
import { bulkArchiveDeals, bulkDeleteDeals, bulkUpdateDeals } from "./bulk-actions";
import { HANDOFF_COLUMN_ID } from "./constants";
import { type StageOption, type MoveOpts, type DealCard, REJECT_REASONS } from "./types";
import { idleDays, cardMatches, type ListSort, makeDealComparator } from "./board-helpers";
import { DealsList } from "./DealsList"; import { BulkEditModal } from "./BulkEditModal";
import { CloseDealDialog } from "./CloseDealDialog";

// Won and Lost ride twice: as lanes, and as drop targets pinned to the bottom of
// the screen while a card is dragged (.deals-dock). Lost is the last lane, past
// every Won card, so on a laptop it is off-screen; on 9 Nov the CEO could not
// drag WHA there. A droppable id is unique, so the pinned pair carries a prefix.
const DOCK = "dock:";
const FIRST_WORKING_STAGE = "Discovery";

// One line, so a long note cannot make a card a screen tall; the whole note is
// on the deal's page, and in the tooltip.
function NextStepLine({ card }: { card: DealCard }) {
  if (card.status !== "open") return null;
  if (!card.nextStepDate) {
    return (
      <div className="admin-kanban-card-sub u-strong u-err">
        No next step
      </div>
    );
  }
  // This year's date drops its year: ", 2026" took a third of the line the note
  // has. A date in another year keeps it.
  const date = formatDate(card.nextStepDate);
  const thisYear = card.nextStepDate.startsWith(String(new Date().getFullYear()));
  return (
    <div className="admin-kanban-card-sub deals-card-next">
      <span title={card.nextStep ?? undefined}>→ {card.nextStep || "next step"}</span>
      <span>· {thisYear ? date.replace(/, \d{4}$/, "") : date}</span>
    </div>
  );
}

export function DealsBoard({
  columns,
  initialCards,
  lostStageIds,
  wonStageIds,
  stageOptions, focusLocked,
}: {
  columns: KanbanColumn[];
  initialCards: DealCard[];
  lostStageIds: string[];
  wonStageIds: string[];
  stageOptions: StageOption[]; focusLocked?: boolean;
}) {
  const router = useRouter();
  // Follows `initialCards` across every re-render so the positions and
  // statuses the server actually wrote (renumbered siblings, handoff status,
  // closed dates, other admins' moves) replace the optimistic guess. Every
  // optimistic write goes through `run` (A.33): it is released however the
  // request ends, a write the server took comes back with the page
  // re-rendered because each deals action revalidates it, and only a refused
  // or unanswered one is refreshed back to server truth.
  const [cards, setCards, { pending: inFlight, run }] = useServerSyncedState(initialCards);
  // The handoff decision and the bulk verbs change the cards only once the
  // server has said yes, so a refusal leaves nothing to take back and is not
  // refreshed (A.33, decision Q5); useWrite asks again only when a request
  // went unanswered.
  const write = useWrite();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [listSort, setListSort] = useState<ListSort | null>(null);
  // Board (kanban) is the default; the last-picked view is remembered in
  // localStorage. Init to "board" on both server and first client render to
  // avoid a hydration mismatch, then hydrate the saved choice in an effect.
  const [view, setView] = useState<"board" | "list">("board");
  useEffect(() => {
    const saved = localStorage.getItem("deals-view");
    if (saved === "board" || saved === "list") setView(saved);
  }, []);
  function changeView(next: "board" | "list") {
    setView(next);
    clearSelection();
    try {
      localStorage.setItem("deals-view", next);
    } catch {
      // private mode / storage disabled — the toggle still works this session.
    }
  }
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closing, setClosing] = useState<
    { kind: "lost" | "won"; cardId: string; toColumnId: string; toIndex?: number } | null
  >(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");

  const lostSet = new Set(lostStageIds);
  const wonSet = new Set(wonStageIds);
  const query = search.trim().toLowerCase();
  // Sort by position (not just filter) so a reorder's patched position values
  // are always reflected, regardless of the underlying array's insert order.
  const byPosition = (a: DealCard, b: DealCard) => a.position - b.position;
  const activeCards = cards.filter((c) => !c.archivedAt && cardMatches(c, query)).sort(byPosition);
  const archivedCards = cards.filter((c) => c.archivedAt && cardMatches(c, query)).sort(byPosition);
  // The entry columns — the synthetic SDR handoff bucket and every stage before
  // Discovery (New, Contacted) — collapse away when empty: intake belongs to
  // Leads, and an empty Contacted lane was a lane of nothing (CEO, 9 Nov).
  // Discovery onward always shows, even at zero deals. A pipeline with no
  // Discovery stage collapses only its first stage, as before.
  const stageColumns = columns.filter((c) => c.id !== HANDOFF_COLUMN_ID);
  const workingAt = Math.max(stageColumns.findIndex((c) => c.label === FIRST_WORKING_STAGE), 1);
  const collapsibleIds = new Set([HANDOFF_COLUMN_ID, ...stageColumns.slice(0, workingAt).map((c) => c.id)]);
  const boardColumns = columns.filter(
    (col) => !collapsibleIds.has(col.id) || activeCards.some((c) => c.columnId === col.id),
  );
  const dockColumns = columns
    .filter((c) => lostSet.has(c.id) || wonSet.has(c.id))
    .map((c) => ({ ...c, id: DOCK + c.id, variant: "strip" as const }));
  const isDock = (col: KanbanColumn) => col.id.startsWith(DOCK);
  const listCards = showArchived ? archivedCards : activeCards;
  const stageLabelMap = new Map(columns.map((c) => [c.id, c.label]));
  const sortedListCards = listSort ? [...listCards].sort(makeDealComparator(listSort, stageLabelMap)) : listCards;

  function sortList(key: string) {
    setListSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  // A board card or list row opens the deal's own full-page record (replaces the
  // old side drawer). The label mirrors the card title fallback so the slug reads.
  function openDeal(c: DealCard) {
    router.push(dealPath(c.title || c.contactName || c.companyName || "", c.id));
  }

  // Reorders `toColumnId`'s cards so `cardId` lands at `toIndex`, returning the
  // new full order for that column (used both to patch local state and to
  // persist positions for every card whose rank shifted).
  function reorderColumn(all: DealCard[], cardId: string, toColumnId: string, toIndex?: number): DealCard[] {
    const destBefore = all.filter((c) => c.columnId === toColumnId && c.id !== cardId);
    const insertAt = toIndex != null ? Math.min(Math.max(toIndex, 0), destBefore.length) : destBefore.length;
    const moved = all.find((c) => c.id === cardId);
    if (!moved) return destBefore;
    return [...destBefore.slice(0, insertAt), moved, ...destBefore.slice(insertAt)];
  }

  function applyMove(cardId: string, toColumnId: string, opts?: MoveOpts, toIndex?: number) {
    const destOrdered = reorderColumn(cards, cardId, toColumnId, toIndex);
    const positionById = new Map(destOrdered.map((c, i) => [c.id, i]));
    setCards((cs) =>
      cs.map((c) => {
        if (c.id === cardId) {
          return {
            ...c,
            columnId: toColumnId,
            stageId: toColumnId,
            position: positionById.get(c.id) ?? c.position,
            handoffStatus: c.handoffStatus === "pending" ? "accepted" : c.handoffStatus,
            ...(opts?.wonAmount != null ? { amountCents: Math.round(opts.wonAmount * 100) } : {}),
          };
        }
        const pos = positionById.get(c.id);
        return pos != null ? { ...c, position: pos } : c;
      }),
    );
    setBanner(null);
    const card = cards.find((c) => c.id === cardId);
    void run(
      () =>
        moveDealAccepting(cardId, toColumnId, { handoffPending: card?.handoffStatus === "pending", ...opts }).then((r) =>
          r.ok ? reorderDeals(destOrdered.map((c) => c.id), toColumnId) : r,
        ),
      {
        onError: (message) => {
          setNotice(null);
          setBanner(`Couldn't move deal: ${message}`);
        },
      },
    );
  }

  function move(cardId: string, droppedOn: string, toIndex?: number) {
    const toColumnId = droppedOn.startsWith(DOCK) ? droppedOn.slice(DOCK.length) : droppedOn;
    if (toColumnId === HANDOFF_COLUMN_ID || cards.find((c) => c.id === cardId)?.columnId === toColumnId) return;
    if (lostSet.has(toColumnId) || wonSet.has(toColumnId)) {
      setClosing({ kind: lostSet.has(toColumnId) ? "lost" : "won", cardId, toColumnId, toIndex });
      return;
    }
    applyMove(cardId, toColumnId, undefined, toIndex);
  }
  const closingCard = closing ? cards.find((c) => c.id === closing.cardId) : undefined;

  // Same-column drag: card stays in its stage, just changes rank within it.
  function reorder(cardId: string, columnId: string, toIndex: number) {
    const destOrdered = reorderColumn(cards, cardId, columnId, toIndex);
    const positionById = new Map(destOrdered.map((c, i) => [c.id, i]));
    setCards((cs) => cs.map((c) => (positionById.has(c.id) ? { ...c, position: positionById.get(c.id)! } : c)));
    void run(() => reorderDeals(destOrdered.map((c) => c.id)), {
      onError: (message) => setBanner(`Couldn't reorder: ${message}`),
    });
  }

  function decide(cardId: string, decision: "accepted" | "rejected", rejectReason?: string) {
    setBanner(null);
    void write(() => decideHandoff(cardId, decision, rejectReason), {
      onError: setBanner,
      onOk: () => {
        setRejecting(null);
        setCards((cs) =>
          cs
            .map((c) =>
              c.id === cardId
                ? decision === "accepted"
                  ? { ...c, handoffStatus: "accepted", columnId: c.stageId ?? c.columnId }
                  : { ...c, handoffStatus: "rejected" } // set aside, not lost: it leaves the board
                : c,
            )
            .filter((c) => !(c.id === cardId && decision === "rejected")),
        );
      },
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds((s) =>
      listCards.every((c) => s.has(c.id)) ? new Set() : new Set(listCards.map((c) => c.id)),
    );
  }
  function clearSelection() {
    setSelectedIds(new Set());
    setBulkOpen(false);
  }

  const selectedIdList = [...selectedIds];

  return (
    <>
      <div className="u-row u-gap-3 u-between u-wrap u-mb-3">
        <div className="u-row u-gap-3 u-wrap u-grow">
          <form className="admin-search" onSubmit={(e) => e.preventDefault()}>
            <svg className="admin-search-icon" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals, contact, company…"
              aria-label="Search deals"
            />
            {search && (
              <button type="button" className="admin-search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
                <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </form>
          {view === "list" && (
            <button
              type="button"
              className={`admin-btn admin-btn--sm${showArchived ? " admin-btn--primary" : ""}`}
              onClick={() => {
                setShowArchived((v) => !v);
                clearSelection();
              }}
            >
              {showArchived ? "Showing archived" : "Show archived"}
            </button>
          )}
        </div>
        <div className="admin-viewtoggle" role="group" aria-label="Deal view">
          <button
            type="button"
            className={view === "board" ? "is-active" : ""}
            aria-pressed={view === "board"}
            onClick={() => changeView("board")}
          >
            Board
          </button>
          <button
            type="button"
            className={view === "list" ? "is-active" : ""}
            aria-pressed={view === "list"}
            onClick={() => changeView("list")}
          >
            List
          </button>
        </div>
      </div>

      {banner && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {banner}
        </div>
      )}
      {notice && (
        <div className="admin-alert admin-alert--ok u-mb-3">
          {notice}
        </div>
      )}

      {closing && (
        <CloseDealDialog
          kind={closing.kind}
          dealTitle={closingCard?.title || closingCard?.companyName || "This deal"}
          currency={closingCard?.currency ?? "usd"}
          initialAmount={closingCard?.amountCents != null ? (closingCard.amountCents / 100).toString() : ""}
          onCancel={() => setClosing(null)}
          onConfirm={(value) => {
            const opts = closing.kind === "lost" ? { lostReason: value } : { wonAmount: Number(value) };
            applyMove(closing.cardId, closing.toColumnId, opts, closing.toIndex);
            setNotice(`Moved “${closingCard?.title || "the deal"}” to ${closing.kind === "lost" ? "Lost" : "Won"}.`);
            setClosing(null);
          }}
        />
      )}

      {view === "board" ? (
        <KanbanBoard<DealCard>
          columns={[...boardColumns, ...dockColumns]} boardClassName="deals-board"
          columnClassName={(col) => (isDock(col) ? `deals-dock deals-dock--${lostSet.has(col.id.slice(DOCK.length)) ? "lost" : "won"}` : undefined)}
          renderColumnHead={(col) => (isDock(col) ? <span className="deals-dock-label">{col.label}<span>Drop to close as {col.label.toLowerCase()}</span></span> : null)}
          cards={activeCards}
          disabled={inFlight > 0}
          onMove={move}
          onReorder={reorder}
          onCardClick={openDeal}
          renderCard={(c) => (
            <>
              <div className="admin-kanban-card-title admin-kanban-card-title--clamp">{c.title || c.contactName || c.companyName || "(untitled deal)"}</div>
              <div className="admin-kanban-card-sub">{c.companyName || c.contactName || "—"}</div>
              <NextStepLine card={c} />
              <div className="admin-kanban-card-meta">
                <Badge tone="info">{formatCents(c.amountUsdCents, "usd")}</Badge>
                {c.probability != null && <span className="admin-kanban-card-sub">{c.probability}%</span>}
                {(() => {
                  const d = idleDays(c.updatedAt);
                  return c.status === "open" && d != null && d > 14 ? (
                    <Badge tone="warn">idle {d}d</Badge>
                  ) : null;
                })()}
              </div>
              {c.columnId === HANDOFF_COLUMN_ID && (
                <div className="admin-kanban-card-handoff u-row u-wrap u-mt-2" onClick={(e) => e.stopPropagation()}>
                  {rejecting === c.id ? (
                    <>
                      <select className="admin-input u-max-2" value={reason} onChange={(e) => setReason(e.target.value)}>
                        <option value="">Reason…</option>
                        {REJECT_REASONS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="admin-btn admin-btn--danger" disabled={!reason} onClick={() => decide(c.id, "rejected", reason)}>
                        Confirm
                      </button>
                      <button type="button" className="admin-btn" onClick={() => setRejecting(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="admin-btn admin-btn--primary" onClick={() => decide(c.id, "accepted")}>
                        Accept
                      </button>
                      <button
                        type="button"
                        className="admin-btn"
                        onClick={() => {
                          setRejecting(c.id);
                          setReason("");
                        }}
                      >
                        Reject…
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          columnFooter={(col, colCards) => {
            if (isDock(col)) return null;
            const total = colCards.reduce((s, c) => s + (c.amountUsdCents ?? 0), 0);
            const weighted = colCards.reduce(
              (s, c) => s + (c.amountUsdCents ?? 0) * ((c.probability ?? 0) / 100),
              0,
            );
            return (
              <div className="admin-kanban-col-foot">
                <span>{formatCents(total)}</span>
                <span className="admin-kanban-card-sub">{formatCents(weighted)} weighted</span>
              </div>
            );
          }}
        />
      ) : (
        <>
          <DealsList
            cards={sortedListCards}
            columns={columns}
            selected={selectedIds}
            onToggle={toggleSelect}
            onToggleAll={toggleSelectAll}
            onRowClick={openDeal}
            sort={listSort}
            onSort={sortList}
            // Drag-to-reorder only makes sense against the natural priority
            // order — once a column sort or search is applied, rows no longer
            // sit at a rank you can meaningfully drag.
            reorderEnabled={!listSort && !query && !focusLocked}
            onReorder={reorder}
            emptyText={query ? "No deals match your search." : showArchived ? "No archived deals." : "No deals yet."}
          />

          {selectedIds.size > 0 && (
            <div className="admin-bulkbar">
              <span className="admin-bulkbar-count">{selectedIds.size} selected</span>
              {!showArchived && (
                <>
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => setBulkOpen(true)}>
                    Edit…
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--sm"
                    onClick={() => {
                      setBanner(null);
                      void write(() => bulkArchiveDeals(selectedIdList), {
                        onError: setBanner,
                        onOk: (r) => {
                          const now = new Date().toISOString();
                          setCards((cs) => cs.map((c) => (selectedIds.has(c.id) ? { ...c, archivedAt: now } : c)));
                          setNotice(r.message ?? null);
                          clearSelection();
                        },
                      });
                    }}
                  >
                    Archive
                  </button>
                </>
              )}
              <button
                type="button"
                className="admin-btn admin-btn--sm admin-btn--danger"
                onClick={() => {
                  setBanner(null);
                  void write(() => bulkDeleteDeals(selectedIdList), {
                    onError: setBanner,
                    onOk: (r) => {
                      const gone = new Set(r.deletedIds);
                      setCards((cs) => cs.filter((c) => !gone.has(c.id)));
                      setNotice(r.message ?? null);
                      clearSelection();
                    },
                  });
                }}
              >
                Delete
              </button>
              <div className="admin-bulkbar-spacer" />
              <button type="button" className="admin-btn admin-btn--sm" onClick={clearSelection}>
                Clear
              </button>
            </div>
          )}
        </>
      )}

      {bulkOpen && (
        <BulkEditModal
          count={selectedIds.size}
          stageOptions={stageOptions}
          onCancel={() => setBulkOpen(false)}
          onApply={async (patch) => {
            // A refusal comes back to the modal, which keeps it open and shows it.
            return write(() => bulkUpdateDeals(selectedIdList, patch), {
              onOk: (r) => {
                setCards((cs) =>
                  cs.map((c) =>
                    selectedIds.has(c.id)
                      ? {
                          ...c,
                          ...(patch.stage_id !== undefined ? { stageId: patch.stage_id, columnId: patch.stage_id, status: "open" } : {}),
                          ...(patch.probability !== undefined ? { probability: patch.probability } : {}),
                          ...(patch.expected_close_date !== undefined ? { expectedClose: patch.expected_close_date } : {}),
                          ...(patch.source !== undefined ? { source: patch.source } : {}),
                        }
                      : c,
                  ),
                );
                setNotice(r.message ?? null);
                setBulkOpen(false);
                clearSelection();
              },
            });
          }}
        />
      )}
    </>
  );
}
