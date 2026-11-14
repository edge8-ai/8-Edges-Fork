// The programme read on Talent › People › Training (TR.7): dense, one row per
// slice, the Admin language. Figures for a shown slice, the reason for a
// hidden one, and a refusal in place of the table when the filters would
// narrow below three reviewers. No row is a person (ADR 0016).
import { MetricCard } from "@/kernel/ui/MetricCard";
import { FilterBar, type FilterDef } from "@/kernel/ui/FilterBar";
import type { SearchParamsObj } from "@/kernel/ui/url";
import type { ProgrammeView, ViewSlice } from "../lib/programme-read";
import { hiddenSentence } from "../lib/programme-read-rules";
import { loadSegments, loadShares, notWentLine, notesLine, starsLabel, wentShare } from "./programme-format";
import { ProgrammeNotes } from "./ProgrammeNotes";
import { StoryLine } from "./ProgrammeStory";
import type { Story } from "../lib/narrations";
import { LockIcon, StarIcon } from "./programme-icons";

const GROUPS: { grain: ViewSlice["grain"]; label: string }[] = [
  { grain: "type", label: "By training type" },
  { grain: "plan", label: "By plan" },
];

export function ProgrammeTable({ view, basePath, searchParams, filters, stories = new Map() }: { view: ProgrammeView; basePath: string; searchParams: SearchParamsObj; filters: FilterDef[]; stories?: ReadonlyMap<string, Story> }) {
  return (
    <>
      <div className="admin-toolbar">
        <FilterBar basePath={basePath} searchParams={searchParams} filters={filters} />
      </div>
      {view.refused ? (
        <div className="admin-alert admin-alert--info tr-pr-refused" role="status">
          <LockIcon />
          <div>
            <strong>This combination is not shown.</strong> Fewer than three people reviewed the trainings it would leave, so showing it could single someone out. Widen the period or clear the type or plan.
          </div>
        </div>
      ) : (
        <Read view={view} stories={stories} />
      )}
    </>
  );
}

function Read({ view, stories }: { view: Extract<ProgrammeView, { refused: false }>; stories: ReadonlyMap<string, Story> }) {
  if (view.slices.length === 0) return <p className="admin-empty">No training in this period has started yet.</p>;
  return (
    <>
      {view.totals ? (
        <div className="admin-kpi-grid u-mb-5">
          <MetricCard label="Reviews" value={view.totals.reviews} />
          <MetricCard label="Average stars" value={view.totals.stars.toFixed(1)} />
          <MetricCard label="Went, of those on the list" value={`${view.totals.went} of ${view.totals.listed}`} />
        </div>
      ) : (
        <div className="admin-callout tr-pr-refused u-mb-5">
          <LockIcon />
          <div>
            <strong>No figures yet.</strong> No training type has been reviewed by three people. Reviews open on My Training once a training ends; each slice shows here once three people have reviewed it.
          </div>
        </div>
      )}
      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Slice</th>
                <th className="u-right">Reviewers</th>
                <th>Stars</th>
                <th>Load</th>
                <th>Feelings</th>
                <th>Went</th>
                <th>Did not go</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => {
                const rows = view.slices.filter((s) => s.grain === g.grain);
                if (rows.length === 0) return null;
                return [
                  <tr key={g.grain} className="admin-table-group-row">
                    <td colSpan={8}>{g.label}</td>
                  </tr>,
                  ...rows.map((s) => <SliceRow key={s.key} slice={s} story={stories.get(s.key) ?? null} />),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="tr-hint u-mt-3">The figures above add up the training types shown only, so they cannot be used to work out a hidden one. A note shows its writer&apos;s name only when they signed it and are still on the team.</p>
    </>
  );
}

function SliceRow({ slice: s, story }: { slice: ViewSlice; story: Story | null }) {
  const name = (
    <td>
      <span className="tr-pr-slice">
        <span className="admin-cell-strong">{s.name}</span>
        <span className="admin-cell-muted">{s.sub}</span>
      </span>
    </td>
  );
  if (!s.shown) {
    return (
      <tr>
        {name}
        <td colSpan={7} className="admin-cell-muted">
          <span className="tr-pr-lock">
            <LockIcon />
            Hidden: {hiddenSentence(s).replace(/^./, (c) => c.toLowerCase())}
          </span>
        </td>
      </tr>
    );
  }
  const f = s.figures;
  const load = loadShares(f);
  const notes = notesLine(f);
  return (
    <>
      <tr>
        {name}
        <td className="u-right">
          <span className="admin-cell-mono">{f.reviewers}</span>
        </td>
        <td>
          <span className="tr-pr-stars">
            <StarIcon />
            {starsLabel(f)}
          </span>
          <div className="admin-cell-muted">{f.reviews} reviews</div>
        </td>
        <td>
          {load.answered > 0 ? (
            <>
              <div className="tr-pr-mix" role="img" aria-label={`${load.little}% too little, ${load.right}% about right, ${load.much}% too much`}>
                {loadSegments(f).map((c, i) => (
                  <span key={i} className={c} />
                ))}
              </div>
              <div className="admin-cell-muted">
                {load.right}% about right · {load.much}% too much
              </div>
            </>
          ) : (
            <span className="admin-cell-muted">No answers</span>
          )}
        </td>
        <td>
          <div className="tr-pr-tags">
            {f.tags.slice(0, 3).map((t) => (
              <span key={t.label} className="tr-pr-tag">
                {t.label} {t.n}
              </span>
            ))}
          </div>
        </td>
        <td>
          <span className="admin-cell-mono">
            {f.went} of {f.listed}
          </span>
          <div className="admin-cell-muted">{wentShare(f)}%</div>
        </td>
        <td>
          <span className="admin-cell-muted">{notWentLine(f)}</span>
        </td>
        <td>
          {notes ? (
            <span className="tr-pr-slice">
              <span className="admin-cell-muted">{notes}</span>
              <ProgrammeNotes slice={s.name} notes={s.notes} />
            </span>
          ) : (
            <span className="admin-cell-muted">None</span>
          )}
        </td>
      </tr>
      {/* The week's story (TR.9), the reader's own, under its slice's row. */}
      {story && (
        <tr className="tr-nr-row">
          <td />
          <td colSpan={7}>
            <StoryLine story={story} />
          </td>
        </tr>
      )}
    </>
  );
}
