"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import {
  IDEA_STATUSES,
  IDEA_STATUS_LABEL,
  OFFICE_LABEL,
  officeTone,
  type IdeaOffice,
  type IdeaStatus,
} from "@/entities/ideas/lib/ideas";
import { submitterName, type IdeaRow } from "./idea-shared";
import { retryIdeaPlan, updateIdeaStatus } from "./actions";

// Client-owned shelf for the idea backlog, same shape as VendorsShelf: one
// drawer at the provider level, rows push the selected idea into context, and
// nothing goes through DataTable's server-rendered getRowPreview.

const ShelfContext = createContext<{ open: (row: IdeaRow) => void } | null>(null);

export function IdeasShelfProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<IdeaRow | null>(null);

  return (
    <ShelfContext.Provider value={{ open: setSelected }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow={selected?.kind === "learning" ? "Learning" : "Idea"}
        title={selected?.title ?? ""}
      >
        {selected && <IdeaShelfBody row={selected} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function IdeaShelfRow({ row, children }: { row: IdeaRow; children: ReactNode }) {
  const ctx = useContext(ShelfContext);

  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    ctx?.open(row);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      ctx?.open(row);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}

const D_SECTIONS: { key: "problem" | "data_needed" | "workflow" | "roi"; label: string }[] = [
  { key: "problem", label: "Define · The problem" },
  { key: "data_needed", label: "Discover · Data it needs" },
  { key: "workflow", label: "Design · The workflow" },
  { key: "roi", label: "Determine · Expected ROI" },
];

const LEARNING_SECTIONS: { key: "story" | "takeaway"; label: string }[] = [
  { key: "story", label: "What happened" },
  { key: "takeaway", label: "The takeaway" },
];

function IdeaShelfBody({ row }: { row: IdeaRow }) {
  const router = useRouter();
  const isLearning = row.kind === "learning";
  const [status, setStatus] = useState(row.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setStatus(row.status);
    setMsg(null);
  }, [row]);

  async function changeStatus(next: string) {
    const prev = status;
    setStatus(next);
    setMsg(null);
    const r = await updateIdeaStatus(row.id, next);
    if (!r.ok) {
      setStatus(prev);
      setMsg({ ok: false, text: r.error });
      return;
    }
    router.refresh();
  }

  async function retry() {
    setBusy(true);
    setMsg(null);
    const r = await retryIdeaPlan(row.id);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setMsg({ ok: true, text: "Plan regenerated — reopen the idea to read it." });
    router.refresh();
  }

  return (
    <div className="admin-shelf-sections">
      <section>
        <div className="admin-shelf-heading">
          Backlog
          {isLearning ? (
            // Learnings skip approve/decline triage — they're shared, not
            // built. Archiving is how one comes off the team feed.
            <button
              type="button"
              className="admin-btn admin-btn--sm"
              onClick={() => changeStatus(status === "archived" ? "new" : "archived")}
            >
              {status === "archived" ? "Unarchive" : "Archive"}
            </button>
          ) : (
            <select
              className="admin-select u-w-auto"
              value={status}
              onChange={(e) => changeStatus(e.target.value)}
              aria-label="Idea status"
            >
              {IDEA_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {IDEA_STATUS_LABEL[s as IdeaStatus]}
                </option>
              ))}
            </select>
          )}
        </div>
        <dl className="admin-kv">
          <dt>Submitted by</dt>
          <dd>{submitterName(row)}</dd>
          <dt>Submitted</dt>
          <dd>{formatDate(row.created_at)}</dd>
          <dt>Office</dt>
          <dd>
            {row.office ? (
              <Badge tone={officeTone(row.office)}>{OFFICE_LABEL[row.office as IdeaOffice]}</Badge>
            ) : (
              "—"
            )}
          </dd>
          {row.ai_model && (
            <>
              <dt>Plan model</dt>
              <dd className="admin-cell-mono">{row.ai_model}</dd>
            </>
          )}
        </dl>
        {msg && (
          <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"} u-mt-3`}>
            {msg.text}
          </div>
        )}
      </section>

      <section>
        <div className="admin-shelf-heading">
          {isLearning ? "The learning (as submitted)" : "The idea (their 5D answers)"}
        </div>
        {(isLearning ? LEARNING_SECTIONS : D_SECTIONS).map((s) => (
          <div key={s.key} className="u-mb-3">
            <div className="admin-label u-mb-1">{s.label}</div>
            <div className="u-prewrap">{row[s.key]}</div>
          </div>
        ))}
      </section>

      <section>
        <div className="admin-shelf-heading">
          {isLearning ? "Shared summary" : "Product plan"}
          <button type="button" className="admin-btn admin-btn--sm" onClick={retry} disabled={busy}>
            {busy ? "Regenerating…" : row.ai_plan ? "Regenerate" : "Retry generation"}
          </button>
        </div>
        {row.planHtml ? (
          <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: row.planHtml }} />
        ) : (
          <div className="admin-cell-muted u-sm">
            {row.ai_error ? `Generation failed: ${row.ai_error}` : "No plan generated yet."}
          </div>
        )}
      </section>
    </div>
  );
}
