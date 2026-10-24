"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { humanize } from "@/kernel/ui/format";
import { appPath } from "@/kernel/config/slug";
import { moveApplicationStage } from "./actions";

export type AppCard = {
  id: string;
  columnId: string;
  candidateName: string | null;
  personId: string | null;
  headline: string | null;
  status: string | null;
  rating: number | null;
  appliedAt: string | null;
};

export function JobReqBoard({
  jobReqId,
  columns,
  initialCards,
}: {
  jobReqId: string;
  columns: KanbanColumn[];
  initialCards: AppCard[];
}) {
  const router = useRouter();
  const [cards, setCards] = useState<AppCard[]>(initialCards);
  const [banner, setBanner] = useState<string | null>(null);

  function move(cardId: string, toColumnId: string) {
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, columnId: toColumnId } : c)));
    setBanner(null);
    moveApplicationStage(cardId, toColumnId, jobReqId).then((r) => {
      if (!r.ok) {
        setCards(prev);
        setBanner(`Couldn't move applicant: ${r.error}`);
      }
    });
  }

  if (!columns.length) {
    return (
      <div className="admin-card u-p-4">
        <span className="admin-cell-muted">This req has no hiring stages defined yet.</span>
      </div>
    );
  }

  return (
    <>
      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}
      <KanbanBoard<AppCard>
        columns={columns}
        cards={cards}
        onMove={move}
        // Clicking a card opens the candidate's full application, not a summary
        // shelf — that page is where the recruiter actually works the candidate.
        onCardClick={(c) => router.push(appPath(c.candidateName, c.id))}
        renderCard={(c) => (
          <>
            <div className="admin-kanban-card-title">{c.candidateName || "(unknown)"}</div>
            <div className="admin-kanban-card-sub">{c.headline || "—"}</div>
            <div className="admin-kanban-card-meta">
              {c.status && <Badge tone={statusTone(c.status)}>{humanize(c.status)}</Badge>}
              {c.rating != null && (
                <span className="admin-kanban-card-sub u-ml-auto">{c.rating}★</span>
              )}
            </div>
          </>
        )}
      />
    </>
  );
}
