"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge } from "@/kernel/ui/Badge";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { externalHref } from "@/kernel/ui/url";

// Server actions arrive as props so the same board serves two audiences with
// two different gates: /team/onboarding passes manager-scoped actions
// (requireTeamMember + scope assertions) and /admin/talent/onboarding passes
// admin-gated ones (requireAdmin). The board itself never touches data.
export type BoardActionResult = { ok: true } | { ok: false; error: string };
export type BoardActions = {
  setPlanLink: (journeyId: string, url: string) => Promise<BoardActionResult>;
  uploadPlan: (journeyId: string, formData: FormData) => Promise<BoardActionResult>;
  toggleTask: (taskId: string, done: boolean) => Promise<BoardActionResult>;
  // Move a journey to a stage — from a board drag or the drawer select. The
  // stored stage is authoritative for display; the daily clock only ever
  // advances it forward, so a manual move sticks.
  setStage: (journeyId: string, stage: string) => Promise<BoardActionResult>;
  // Admin-only: adjust the cycle's Day 1 (team_members.start_date). The /team
  // surface omits it, so managers see the date read-only.
  setStartDate?: (journeyId: string, date: string) => Promise<BoardActionResult>;
};

// Mirror of CYCLE_STAGES in lib/onboarding-cycle.ts — duplicated here because
// that lib is server-only (service-role client) and this is a client component.
const STAGE_COLUMNS = [
  { key: "preboarding", label: "Preboarding" },
  { key: "day_1", label: "Day 1 · Orientation" },
  { key: "day_8", label: "Day 8 · Feedback" },
  { key: "day_45", label: "45 Day Review" },
  { key: "day_60", label: "60 Day Decision" },
  { key: "day_180", label: "180 Day Stay Interview" },
] as const;

export type BoardCard = {
  id: string;
  columnId: string;
  complete: boolean;
  name: string;
  avatarUrl: string | null;
  positionTitle: string | null;
  startDate: string | null;
  dayNumber: number | null;
  probationEndsOn: string | null;
  contractStartDate: string | null;
  planUrl: string | null;
  planHasFile: boolean;
  planAddedAt: string | null;
  day8SurveySentAt: string | null;
  day8Score: number | null;
  day45EmailSentAt: string | null;
  decision: string | null;
  decisionAt: string | null;
  promotedAt: string | null;
  day180SentAt: string | null;
  tasks: { id: string; title: string; done: boolean; group: string }[];
};

const STAGE_ACCENTS: Record<string, string> = {
  preboarding: "var(--admin-muted)",
  day_1: "var(--admin-chart-6)",
  day_8: "var(--admin-chart-3)",
  day_45: "var(--admin-warn-strong)",
  day_60: "var(--admin-chart-2)",
  day_180: "var(--admin-ink)",
};

const DECISION_LABEL: Record<string, string> = {
  offer_full_time: "Offer full time",
  extend_probation_30: "Extended 30 days",
  terminate: "Terminate",
};

const COLUMNS: KanbanColumn[] = STAGE_COLUMNS.map((c) => ({
  id: c.key,
  label: c.label,
  accent: STAGE_ACCENTS[c.key],
}));

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dayLabel(card: BoardCard): string {
  if (card.dayNumber === null) return "No start date";
  if (card.dayNumber < 1) return `Starts in ${1 - card.dayNumber}d`;
  return `Day ${card.dayNumber}`;
}

function stageLabel(card: BoardCard): string {
  if (card.complete) return "Complete";
  return STAGE_COLUMNS.find((c) => c.key === card.columnId)?.label ?? card.columnId;
}

function planMissing(card: BoardCard): boolean {
  return !externalHref(card.planUrl) && !card.planHasFile;
}

function Avatar({ card, size = 28 }: { card: BoardCard; size?: number }) {
  return card.avatarUrl ? (
    <Image
      src={card.avatarUrl}
      alt=""
      width={size}
      height={size}
      className="admin-avatar"
    />
  ) : (
    <span
      aria-hidden
      className="admin-avatar admin-avatar--tint" style={{ width: size, height: size }} /* layout-ok: size from props */
    >
      {card.name.slice(0, 1)}
    </span>
  );
}

export function OnboardingCycleBoard({
  cards,
  actions,
  planHrefBase,
}: {
  cards: BoardCard[];
  actions: BoardActions;
  // Route serving the in-app plan view for this surface, e.g.
  // "/team/onboarding/plan" or "/admin/talent/onboarding/plan".
  planHrefBase: string;
}) {
  const [view, setView] = useState<"board" | "list">("board");
  // Local copy for optimistic drag moves; server state re-syncs via props.
  const [localCards, setLocalCards] = useState(cards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setLocalCards(cards), [cards]);

  const selected = localCards.find((c) => c.id === selectedId) ?? null;

  function openCard(id: string) {
    setError(null);
    setLinkDraft("");
    setSelectedId(id);
  }

  function moveStage(cardId: string, stage: string) {
    setError(null);
    setLocalCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, columnId: stage, complete: false } : c)),
    );
    startTransition(async () => {
      const res = await actions.setStage(cardId, stage);
      if (!res.ok) {
        setError(res.error);
        setLocalCards(cards); // roll back to server truth
      }
    });
  }

  function submitPlanLink(card: BoardCard) {
    const url = linkDraft.trim();
    if (!url) return;
    setError(null);
    startTransition(async () => {
      const res = await actions.setPlanLink(card.id, url);
      if (!res.ok) setError(res.error);
      else setLinkDraft("");
    });
  }

  function submitPlanFile(card: BoardCard, file: File) {
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await actions.uploadPlan(card.id, fd);
      if (!res.ok) setError(res.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function submitStartDate(card: BoardCard, date: string) {
    setError(null);
    startTransition(async () => {
      const res = await actions.setStartDate!(card.id, date);
      if (!res.ok) setError(res.error);
    });
  }

  // Tasks arrive ordered by category then position, so grouping is a walk that
  // preserves that order — no sorting, which would scramble Week 10 before 2.
  function taskGroups(tasks: BoardCard["tasks"]): [string, BoardCard["tasks"]][] {
    const out: [string, BoardCard["tasks"]][] = [];
    for (const t of tasks) {
      const last = out[out.length - 1];
      if (last && last[0] === t.group) last[1].push(t);
      else out.push([t.group, [t]]);
    }
    return out;
  }

  function toggleTask(taskId: string, done: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await actions.toggleTask(taskId, done);
      if (!res.ok) setError(res.error);
    });
  }

  // List order: furthest along first (stage order, then day number descending),
  // completed journeys at the bottom.
  const stageOrder = (c: BoardCard) =>
    c.complete ? STAGE_COLUMNS.length : STAGE_COLUMNS.findIndex((s) => s.key === c.columnId);
  const listCards = [...localCards].sort(
    (a, b) => stageOrder(b) - stageOrder(a) || (b.dayNumber ?? -999) - (a.dayNumber ?? -999),
  );

  return (
    <>
      <div className="u-row u-end u-mb-3">
        <button
          type="button"
          className={`admin-btn${view === "board" ? " admin-btn--primary" : ""}`}
          aria-pressed={view === "board"}
          onClick={() => setView("board")}
        >
          Board
        </button>
        <button
          type="button"
          className={`admin-btn${view === "list" ? " admin-btn--primary" : ""}`}
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          List
        </button>
      </div>

      {view === "board" ? (
        <KanbanBoard
          columns={COLUMNS}
          cards={localCards}
          onMove={(cardId, toColumnId) => moveStage(cardId, toColumnId)}
          onCardClick={(card) => openCard(card.id)}
          renderCard={(card) => (
            <>
              <div className="u-row">
                <Avatar card={card} />
                <div className="u-min-0">
                  <div className="admin-cell-strong u-sm">
                    {card.name}
                  </div>
                  <div className="admin-cell-muted u-sm">
                    {card.positionTitle ?? "—"}
                  </div>
                </div>
              </div>
              <div className="u-row u-wrap u-mt-2 u-xs">
                <Badge>{dayLabel(card)}</Badge>
                {planMissing(card) && !card.complete && <Badge tone="err">Plan missing</Badge>}
                {card.day8Score !== null && <Badge tone="info">Day 8: {card.day8Score}/5</Badge>}
                {card.decision && (
                  <Badge tone={card.decision === "terminate" ? "err" : "ok"}>
                    {DECISION_LABEL[card.decision] ?? card.decision}
                  </Badge>
                )}
                {card.promotedAt && <Badge tone="ok">Full time ✓</Badge>}
                {card.complete && <Badge tone="ok">Cycle complete ✓</Badge>}
              </div>
            </>
          )}
        />
      ) : (
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Stage</th>
                  <th>Day</th>
                  <th>Start date</th>
                  <th>Plan</th>
                  <th>Day 8</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {listCards.map((card) => (
                  <tr key={card.id} onClick={() => openCard(card.id)} className="u-pointer">
                    <td>
                      <div className="u-row">
                        <Avatar card={card} size={24} />
                        <div className="u-min-0">
                          <div className="admin-cell-strong">{card.name}</div>
                          <div className="admin-cell-muted u-sm">
                            {card.positionTitle ?? "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="u-row">
                        <span
                          aria-hidden
                          className="admin-dot" style={{ background: card.complete ? "var(--admin-ok-strong)" : STAGE_ACCENTS[card.columnId] }} /* layout-ok: stage colour is a token var chosen at runtime */
                        />
                        {stageLabel(card)}
                      </span>
                    </td>
                    <td>{dayLabel(card)}</td>
                    <td>{fmt(card.startDate)}</td>
                    <td>
                      {externalHref(card.planUrl) ? (
                        <ExternalLink href={card.planUrl} onClick={(e) => e.stopPropagation()}>
                          View plan
                        </ExternalLink>
                      ) : card.planHasFile ? (
                        <a
                          href={`${planHrefBase}/${card.id}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Read plan
                        </a>
                      ) : card.complete ? (
                        <span className="admin-cell-muted">—</span>
                      ) : (
                        <Badge tone="err">Missing</Badge>
                      )}
                    </td>
                    <td>
                      {card.day8Score !== null ? (
                        `${card.day8Score}/5`
                      ) : (
                        <span className="admin-cell-muted">{card.day8SurveySentAt ? "Sent" : "—"}</span>
                      )}
                    </td>
                    <td>
                      {card.decision ? (
                        <Badge tone={card.decision === "terminate" ? "err" : "ok"}>
                          {DECISION_LABEL[card.decision] ?? card.decision}
                        </Badge>
                      ) : card.promotedAt ? (
                        <Badge tone="ok">Full time ✓</Badge>
                      ) : (
                        <span className="admin-cell-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        eyebrow="Onboarding journey"
        title={selected?.name ?? ""}
      >
        {selected && (
          <div className="u-stack u-gap-5">
            <dl className="admin-kv">
              <div>
                <dt>Stage</dt>
                <dd>
                  <select
                    key={selected.id}
                    className="admin-select u-p-1 u-w-auto"
                    value={selected.complete ? "complete" : selected.columnId}
                    disabled={pending}
                    onChange={(e) => {
                      if (e.target.value !== "complete") moveStage(selected.id, e.target.value);
                    }}
                  >
                    {STAGE_COLUMNS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                    {selected.complete && <option value="complete">Complete</option>}
                  </select>
                </dd>
              </div>
              <div>
                <dt>Position</dt>
                <dd>{selected.positionTitle ?? "—"}</dd>
              </div>
              <div>
                <dt>Day 1</dt>
                <dd>
                  {actions.setStartDate ? (
                    <input
                      key={selected.id}
                      type="date"
                      className="admin-input u-p-1 u-w-auto"
                      defaultValue={selected.startDate ?? ""}
                      disabled={pending}
                      onChange={(e) => {
                        if (e.target.value) submitStartDate(selected, e.target.value);
                      }}
                    />
                  ) : (
                    fmt(selected.startDate)
                  )}
                </dd>
              </div>
              <div>
                <dt>Probation ends</dt>
                <dd>{fmt(selected.probationEndsOn)}</dd>
              </div>
              <div>
                <dt>Contract start</dt>
                <dd>{fmt(selected.contractStartDate)}</dd>
              </div>
            </dl>

            <section>
              <h3 className="u-mb-2">Onboarding plan</h3>
              {externalHref(selected.planUrl) ? (
                <p className="u-sm">
                  Added {fmt(selected.planAddedAt)} ·{" "}
                  <ExternalLink href={selected.planUrl}>View plan</ExternalLink>
                </p>
              ) : selected.planHasFile ? (
                <p className="u-sm">
                  Added {fmt(selected.planAddedAt)} ·{" "}
                  <a href={`${planHrefBase}/${selected.id}`} target="_blank" rel="noreferrer">
                    Read plan
                  </a>
                </p>
              ) : (
                <p className="admin-cell-muted">
                  No plan yet — due one week before Day 1. Daily reminders run until it is here.
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitPlanLink(selected);
                }}
                className="u-row u-mt-2"
              >
                <input
                  type="url"
                  className="admin-input u-grow"
                  placeholder="Paste the plan link (Google Doc, Lark…)"
                  value={linkDraft}
                  disabled={pending}
                  onChange={(e) => setLinkDraft(e.target.value)}
                />
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={pending || linkDraft.trim().length === 0}
                >
                  Save
                </button>
              </form>
              <p className="admin-cell-muted u-sm u-m-0 u-mt-3 u-mb-1">
                …or upload the file — Markdown preferred, it reads right in the app:
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".md,.markdown,.pdf,.doc,.docx,image/jpeg,image/png,image/webp"
                disabled={pending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && selected) submitPlanFile(selected, f);
                }}
              />
            </section>

            <section>
              <h3 className="u-mb-2">
                Checklist
                {selected.tasks.length > 0 && (
                  <span className="admin-cell-muted u-ml-2">
                    {selected.tasks.filter((t) => t.done).length} of {selected.tasks.length} done
                  </span>
                )}
              </h3>
              {selected.tasks.length === 0 ? (
                <p className="admin-cell-muted">
                  The three orientation sessions appear here once the journey starts.
                </p>
              ) : (
                <div className="u-stack u-gap-4">
                  {taskGroups(selected.tasks).map(([group, items]) => {
                    const done = items.filter((t) => t.done).length;
                    return (
                      <div key={group}>
                        <div
                          className="admin-cell-muted u-mb-2 u-xs u-label"
                        >
                          {group} · {done}/{items.length}
                        </div>
                        <ul className="u-stack u-m-0 u-p-0 u-list-plain">
                          {items.map((t) => (
                            <li key={t.id}>
                              <label className="u-row-top u-pointer">
                                <input
                                  type="checkbox"
                                  checked={t.done}
                                  disabled={pending}
                                  onChange={(e) => toggleTask(t.id, e.target.checked)}
                                  className="u-mt-1"
                                />
                                <span style={t.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                                  {t.title}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h3 className="u-mb-2">Milestones</h3>
              <dl className="admin-kv">
                <div>
                  <dt>Day 8 survey</dt>
                  <dd>
                    {selected.day8Score !== null
                      ? `Answered · ${selected.day8Score}/5`
                      : selected.day8SurveySentAt
                        ? `Sent ${fmt(selected.day8SurveySentAt)} · awaiting answer`
                        : "Sends automatically on Day 8"}
                  </dd>
                </div>
                <div>
                  <dt>45-day review</dt>
                  <dd>
                    {selected.decision
                      ? `${DECISION_LABEL[selected.decision] ?? selected.decision} · ${fmt(selected.decisionAt)}`
                      : selected.day45EmailSentAt
                        ? `Review emailed ${fmt(selected.day45EmailSentAt)} · decision pending`
                        : "Review emails the manager 15 days before probation ends"}
                  </dd>
                </div>
                <div>
                  <dt>Day 60</dt>
                  <dd>
                    {selected.promotedAt
                      ? `Promoted to full time ${fmt(selected.promotedAt)}`
                      : "Automatic promotion at probation end after a pass decision"}
                  </dd>
                </div>
                <div>
                  <dt>Day 180</dt>
                  <dd>
                    {selected.day180SentAt
                      ? `Stay interview triggered ${fmt(selected.day180SentAt)}`
                      : "Stay-interview prompt goes to the Talent Director on Day 180"}
                  </dd>
                </div>
              </dl>
            </section>

            {error && (
              <p className="u-err" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
