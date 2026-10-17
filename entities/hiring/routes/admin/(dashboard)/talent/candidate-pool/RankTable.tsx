"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { externalHref } from "@/kernel/ui/url";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { ApplicantStatusSelect } from "@/entities/hiring/client";
import { formatDate, humanize } from "@/kernel/ui/format";
import { updateApplication } from "@/entities/hiring/lib/application-actions";

export type RankRow = {
  applicationId: string;
  personId: string;
  family: string | null; // null: applied only to reqs without a role family
  name: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  reqTitle: string | null;
  reqTitles: string[];
  status: string | null;
  appliedAt: string | null;
  resumeDocumentId: string | null;
  rating: number | null; // AI fit, 0-5
  recruiterStars: number | null; // recruiter's own 1-5 rating (applications.rating)
  overview: string | null;
  strengths: string[];
  gaps: string[];
  // Which screen the narrative came from: the role-family comparison or the
  // per-application screen (fallback when the req has no role family).
  screenSource: "family" | "app" | null;
  recruiterRating: string | null; // legacy imported score, e.g. "8.5/10" — read-only reference
  proposeHref?: string | null; // Z.9: where Hired and Rejected are proposed, for a live chain application
};

type SortKey = "name" | "family" | "req" | "ai" | "recruiter" | "status" | "applied";

// Text columns open ascending (A→Z); numeric and date columns open descending
// (best fit / newest first).
const TEXT_KEYS = new Set<SortKey>(["name", "family", "req", "status"]);
const SORT_LABEL: Record<SortKey, string> = {
  name: "candidate",
  family: "family",
  req: "applied for",
  ai: "AI fit",
  recruiter: "recruiter rating",
  status: "status",
  applied: "applied date",
};

export function RankTable({
  rows,
  poolRows,
  families,
}: {
  rows: RankRow[]; // per-(family, person) rows for the family tabs
  poolRows: RankRow[]; // one row per person for the All tab
  families: { key: string; label: string }[];
}) {
  const router = useRouter();
  // "" = All: the whole pool across families, still ranked by AI fit.
  const [family, setFamily] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "ai", dir: "desc" });

  // Recruiter ratings the user has just changed, applied optimistically over the
  // server value so the table re-sorts before the refresh lands.
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const recruiterOf = useCallback(
    (r: RankRow) => (r.applicationId in overrides ? overrides[r.applicationId] : r.recruiterStars), [overrides]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.family) m.set(r.family, (m.get(r.family) ?? 0) + 1);
    return m;
  }, [rows]);

  const famRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (family ? rows.filter((r) => r.family === family) : poolRows)
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          r.reqTitles.some((t) => t.toLowerCase().includes(q)),
      );
    const val = (r: RankRow): string | number | null => {
      switch (sort.key) {
        case "name":
          return r.name || null;
        case "family":
          return r.family ? families.find((f) => f.key === r.family)?.label ?? r.family : null;
        case "req":
          return r.reqTitles.join(", ") || null;
        case "ai":
          return r.rating;
        case "recruiter":
          return recruiterOf(r);
        case "status":
          return r.status;
        case "applied":
          return r.appliedAt ? new Date(r.appliedAt).getTime() : null;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      // Empty values always sink to the bottom, regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }, [rows, poolRows, family, families, query, sort, recruiterOf]);

  const selected = openId ? famRows.find((r) => r.applicationId === openId) ?? null : null;

  function onSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: TEXT_KEYS.has(key) ? "asc" : "desc" },
    );
  }

  async function setRecruiter(r: RankRow, star: number) {
    const next = recruiterOf(r) === star ? null : star; // click the current value to clear
    setSavingId(r.applicationId);
    setSaveErr(null);
    const res = await updateApplication(r.applicationId, { rating: next });
    setSavingId(null);
    if (!res.ok) {
      setSaveErr(res.error);
      return;
    }
    setOverrides((o) => ({ ...o, [r.applicationId]: next }));
    router.refresh();
  }

  const sortArrow = (key: SortKey) => (sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "");

  return (
    <>
      <div className="admin-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={family === ""}
          className={`admin-tab${family === "" ? " is-active" : ""}`}
          onClick={() => {
            setFamily("");
            setOpenId(null);
          }}
        >
          All ({poolRows.length})
        </button>
        {families.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={family === f.key}
            className={`admin-tab${family === f.key ? " is-active" : ""}`}
            onClick={() => {
              setFamily(f.key);
              setOpenId(null);
            }}
          >
            {f.label} ({counts.get(f.key) ?? 0})
          </button>
        ))}
      </div>

      <div className="admin-toolbar u-gap-3 u-wrap">
        <input
          className="admin-input u-max-4"
          placeholder="Search name, email, req…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search candidates"
        />
        <span className="admin-cell-muted u-ml-auto u-sm">
          Sorted by {SORT_LABEL[sort.key]} ({sort.dir === "desc" ? "high→low" : "low→high"})
        </span>
      </div>

      {saveErr && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {saveErr}
        </div>
      )}

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-th--xs">#</th>
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("name")}>
                    Candidate{sortArrow("name")}
                  </button>
                </th>
                {family === "" && (
                  <th>
                    <button type="button" className="admin-th-sort" onClick={() => onSort("family")}>
                      Family{sortArrow("family")}
                    </button>
                  </th>
                )}
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("req")}>
                    Applied for{sortArrow("req")}
                  </button>
                </th>
                <th className="u-right">
                  <button type="button" className="admin-th-sort" onClick={() => onSort("ai")}>
                    AI fit{sortArrow("ai")}
                  </button>
                </th>
                <th className="u-right">
                  <button type="button" className="admin-th-sort" onClick={() => onSort("recruiter")}>
                    Recruiter{sortArrow("recruiter")}
                  </button>
                </th>
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("status")}>
                    Status{sortArrow("status")}
                  </button>
                </th>
                <th>
                  <button type="button" className="admin-th-sort" onClick={() => onSort("applied")}>
                    Applied{sortArrow("applied")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {famRows.length === 0 ? (
                <tr>
                  <td colSpan={family === "" ? 8 : 7}>
                    <div className="admin-empty">
                      {family === "" ? "No candidates match." : "No candidates in this family match."}
                    </div>
                  </td>
                </tr>
              ) : (
                famRows.map((r, i) => {
                  const rec = recruiterOf(r);
                  return (
                    <tr
                      key={`${r.family}:${r.personId}`}
                      className="is-clickable"
                      onClick={() => setOpenId(r.applicationId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(r.applicationId);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-haspopup="dialog"
                    >
                      <td className="admin-cell-mono">{i + 1}</td>
                      <td>
                        <span className="admin-cell-strong">{r.name}</span>
                        {r.email && <div className="admin-cell-muted">{r.email}</div>}
                      </td>
                      {family === "" && (
                        <td>
                          {r.family ? (
                            families.find((f) => f.key === r.family)?.label ?? r.family
                          ) : (
                            <span className="admin-cell-muted">—</span>
                          )}
                        </td>
                      )}
                      <td>{r.reqTitles.join(", ") || <span className="admin-cell-muted">—</span>}</td>
                      <td className="admin-cell-mono u-right">
                        {r.rating != null ? r.rating.toFixed(1) : <span className="admin-cell-muted">—</span>}
                      </td>
                      <td className="admin-cell-mono u-right">
                        {rec != null ? `${rec}★` : <span className="admin-cell-muted">—</span>}
                      </td>
                      <td>
                        {r.status ? (
                          <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge>
                        ) : (
                          <span className="admin-cell-muted">—</span>
                        )}
                      </td>
                      <td>{r.appliedAt ? formatDate(r.appliedAt) : <span className="admin-cell-muted">—</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DetailDrawer
        open={!!selected}
        onClose={() => setOpenId(null)}
        eyebrow={
          selected
            ? `${families.find((f) => f.key === selected.family)?.label ?? "Candidate"}${
                selected.rating != null ? ` · AI fit ${selected.rating.toFixed(1)}/5` : ""
              }`
            : "Candidate"
        }
        title={selected?.name ?? "Candidate"}
        action={
          selected?.resumeDocumentId ? (
            <a
              className="admin-btn admin-btn--sm"
              href={`/admin/talent/resume/${selected.resumeDocumentId}`}
              target="_blank"
              rel="noreferrer"
            >
              Resume ↗
            </a>
          ) : undefined
        }
      >
        {selected && (
          <div className="u-stack u-gap-4 u-lg">
            {selected.appliedAt && (
              <div className="admin-cell-muted u-sm">
                Applied {formatDate(selected.appliedAt)}
              </div>
            )}

            {/* Same status control as the applications and contact surfaces. */}
            <ApplicantStatusSelect
              applicationId={selected.applicationId}
              status={selected.status}
              label="Status"
              save={updateApplication}
              proposeHref={selected.proposeHref ?? null}
            />

            {/* Recruiter's own rating — editable, saves on click */}
            <div>
              <div className="admin-label u-mb-1">
                Recruiter rating{" "}
                {savingId === selected.applicationId ? <span className="admin-cell-muted">· saving…</span> : null}
              </div>
              <StarRating
                value={recruiterOf(selected)}
                disabled={savingId === selected.applicationId}
                onPick={(n) => setRecruiter(selected, n)}
              />
              {selected.recruiterRating && (
                <div className="admin-cell-muted u-sm u-mt-1">
                  Imported score: {selected.recruiterRating}
                </div>
              )}
            </div>

            {selected.reqTitles.length > 0 && (
              <div>
                <div className="admin-label u-mb-1">Applied for</div>
                <div>{selected.reqTitles.join(", ")}</div>
              </div>
            )}

            {selected.overview ? (
              <>
                <div>
                  <div className="admin-label u-mb-1">
                    AI screen — overview{selected.rating != null ? ` · fit ${selected.rating.toFixed(1)}/5` : ""}
                  </div>
                  <div className="u-prewrap">{selected.overview}</div>
                </div>
                {selected.strengths.length > 0 && (
                  <div>
                    <div className="admin-label u-mb-1">
                      {selected.screenSource === "app" ? "Skills & assessment" : "Strengths"}
                    </div>
                    <ul className="u-stack u-gap-1 u-m-0 u-pl-4">
                      {selected.strengths.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.gaps.length > 0 && (
                  <div>
                    <div className="admin-label u-mb-1">Gaps</div>
                    <ul className="u-stack u-gap-1 u-m-0 u-pl-4">
                      {selected.gaps.map((g, j) => (
                        <li key={j}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="admin-empty">
                {selected.family ? "Not yet AI-screened for this family" : "Not yet AI-screened"}
                {selected.resumeDocumentId ? "" : " (no resume on file)"}.
              </div>
            )}

            <div>
              <div className="admin-label u-mb-1">Contact</div>
              <div className="u-stack">
                {selected.email ? <a href={`mailto:${selected.email}`}>{selected.email}</a> : null}
                {selected.phone && <span>{selected.phone}</span>}
                <ExternalLink href={selected.linkedinUrl}>LinkedIn ↗</ExternalLink>
                {!selected.email && !selected.phone && !externalHref(selected.linkedinUrl) && (
                  <span className="admin-cell-muted">No contact details on file.</span>
                )}
              </div>
            </div>

            <div className="u-row u-gap-4 u-pt-1">
              <Link href={`/admin/contacts/${selected.personId}`} className="admin-btn">
                Open person record →
              </Link>
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}

// 1–5 stars. Picking the current value clears it back to none.
function StarRating({
  value,
  disabled,
  onPick,
}: {
  value: number | null;
  disabled?: boolean;
  onPick: (n: number) => void;
}) {
  return (
    <div className="u-row u-gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value != null && n <= value}
          disabled={disabled}
          onClick={() => onPick(n)}
          className="admin-btn-reset admin-star-btn"
        >
          {value != null && n <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}
