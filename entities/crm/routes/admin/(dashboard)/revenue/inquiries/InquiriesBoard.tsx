"use client";

import { useState } from "react";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { STAGE_LEAD, STAGE_NEUTRAL, STAGE_WON, STAGE_LOST } from "@/kernel/ui/stageColors";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge } from "@/kernel/ui/Badge";
import { humanize, timeAgo } from "@/kernel/ui/format";
import type { MayProp } from "@/kernel/identity/may-prop";
import { qualifierChip, type QualifierView } from "@/entities/crm/lib/inquiry-triage-shapes";
import type { InquiryCard } from "./inquiry-card";
import { moveInquiryStatus, archiveInquiry, markInquirySpam, promoteInquiryToLead } from "./actions";
import { InquiryDetail } from "./InquiryDetail";

export type { InquiryCard } from "./inquiry-card";

const COLUMNS: KanbanColumn[] = [
  { id: "new_lead", label: "New inquiry", accent: STAGE_LEAD },
  { id: "contacted", label: "Contacted", accent: STAGE_NEUTRAL },
  { id: "qualified", label: "Promote to lead", accent: STAGE_WON },
  { id: "no_action", label: "No action", accent: STAGE_LOST },
];

// `may` (ADR 0014): moves and the drawer's controls show only to someone who
// may work the board; each action's own guard still refuses.
export function InquiriesBoard({ initialCards, may }: { initialCards: InquiryCard[]; may: MayProp }) {
  const canWork = may["crm.pipeline"] === true;
  const [cards, setCards] = useState<InquiryCard[]>(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = cards.find((c) => c.id === selectedId) ?? null;

  function move(cardId: string, toColumnId: string) {
    if (!canWork) return;
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, columnId: toColumnId } : c)));
    setBanner(null);
    // Dropping on "Promote to lead" is more than a status change: the person
    // also joins the SDR queue on /admin/revenue/leads.
    const action =
      toColumnId === "qualified" ? promoteInquiryToLead(cardId) : moveInquiryStatus(cardId, toColumnId);
    action.then((r) => {
      if (!r.ok) {
        setCards(prev);
        setBanner({ ok: false, text: `Couldn't move card: ${r.error}` });
      } else if (toColumnId === "qualified") {
        setBanner({ ok: true, text: "Promoted: this contact is now in the lead queue." });
      }
    });
  }

  function remove(cardId: string, kind: "archive" | "spam") {
    const prev = cards;
    setCards((cs) => cs.filter((c) => c.id !== cardId));
    setSelectedId(null);
    const action = kind === "spam" ? markInquirySpam(cardId) : archiveInquiry(cardId);
    action.then((r) => {
      if (!r.ok) {
        setCards(prev);
        setBanner({ ok: false, text: `Couldn't ${kind === "spam" ? "mark as spam" : "archive"}: ${r.error}` });
      }
    });
  }

  return (
    <>
      {banner && (
        <div
          className={`admin-alert ${banner.ok ? "admin-alert--ok" : "admin-alert--err"} u-mb-3`}
        >
          {banner.text}
        </div>
      )}

      <KanbanBoard<InquiryCard>
        columns={COLUMNS}
        cards={cards}
        onMove={move}
        onCardClick={(c) => setSelectedId(c.id)}
        renderCard={(c) => (
          <>
            <div className="admin-kanban-card-title">{c.personName || c.personEmail || "(unknown)"}</div>
            <div className="admin-kanban-card-sub">{c.subject || humanize(c.type)}</div>
            <div className="admin-kanban-card-meta">
              {c.qualifier ? <QualifierBadge q={c.qualifier} /> : c.type && <Badge>{humanize(c.type)}</Badge>}
              {c.doNotContact && <Badge tone="err">DNC</Badge>}
              <span className="admin-kanban-card-sub u-ml-auto">
                {timeAgo(c.created_at)}
              </span>
            </div>
          </>
        )}
      />

      <DetailDrawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        eyebrow={selected ? humanize(selected.type) : ""}
        title={selected?.personName || selected?.personEmail || "Inquiry"}
      >
        {selected && (
          <InquiryDetail
            card={selected}
            may={may}
            onPromote={() => move(selected.id, "qualified")}
            onArchive={() => remove(selected.id, "archive")}
            onSpam={() => remove(selected.id, "spam")}
          />
        )}
      </DetailDrawer>
    </>
  );
}

// The qualifier's chip on a card: Sales 4/5, Job seeker, Vendor pitch, From a
// current client, Not read; marked Shadow when the chain only recorded it.
function QualifierBadge({ q }: { q: QualifierView }) {
  const chip = qualifierChip(q);
  return (
    <>
      <Badge tone={chip.tone}>{chip.label}</Badge>
      {q.mode === "shadow" && <Badge>Shadow</Badge>}
    </>
  );
}
