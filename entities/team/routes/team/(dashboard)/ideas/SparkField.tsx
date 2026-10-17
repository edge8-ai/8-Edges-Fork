import Link from "next/link";
import type { SharedIdea } from "@/entities/team/lib/data";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, initials } from "@/kernel/ui/format";
import { IDEA_OFFICES, OFFICE_LABEL, STAGE_LABEL, officeTone, socialFor, type IdeaOffice, type SparkSocial, type SparkStage } from "@/entities/ideas";
import { Icon } from "@/kernel/ui/Icon";
import { admireFaces } from "./spark-faces";
import {
  FIELD_FIRST,
  KIND_LABEL,
  avatarTone,
  fieldHref,
  filterField,
  isFiltered,
  sparkHook,
  sparkKind,
  type FieldFilter,
} from "./sparks-model";

// All sparks (ID.2.3): the long board, as short tiles. Filters are links, so a
// filtered field is server-rendered and can be shared; a chip keeps the scroll
// position instead of jumping to the top. The search is a plain GET form for
// the same reason (TH.4.4): it carries the chips already chosen as hidden
// fields, so a search narrows the field the person is looking at.

// The stage chips use the sky legend's words, so the Field and the sky name a
// spark's stage the same way.
const STAGE_CHIPS: { stage: SparkStage; label: string }[] = [
  { stage: "spark", label: "Waiting" },
  { stage: "echoed", label: "Echoed" },
  { stage: "picked_up", label: "Picked up" },
  { stage: "shipped", label: "Shipped" },
];

export function SparkField({
  ideas,
  filter,
  social,
  stages,
  personId,
}: {
  ideas: SharedIdea[];
  filter: FieldFilter;
  social: Map<string, SparkSocial>;
  stages: Map<string, SparkStage>;
  personId: string | null;
}) {
  const matched = filterField(ideas, filter, {
    personId,
    stageOf: (i) => stages.get(i.id) ?? "spark",
    searchText: (i) => [i.title, sparkHook(i), i.submitterName].filter(Boolean).join(" "),
  });
  const narrowed = isFiltered(filter);
  const shown = filter.all ? matched : matched.slice(0, FIELD_FIRST);

  return (
    <section className="sparks-field" aria-labelledby="field-h">
      <div className="sparks-field-head">
        <div>
          <h2 id="field-h" className="sparks-h2">
            All sparks
          </h2>
          <p className="sparks-lede">Everything the team has shared, newest first. Open one to read the whole thing.</p>
        </div>
        <span className="sparks-count" aria-live="polite">
          {narrowed ? `${matched.length} of ${ideas.length} sparks` : ideas.length === 1 ? "1 spark" : `${ideas.length} sparks`}
        </span>
      </div>

      <form className="sparks-search" action="/team/ideas" method="get" role="search">
        <Icon name="search" />
        <label className="sparks-sr" htmlFor="sparks-q">
          Search all sparks
        </label>
        <input id="sparks-q" type="search" name="q" defaultValue={filter.q} maxLength={80} placeholder="Search a word, a title or a teammate" />
        {filter.kind && <input type="hidden" name="kind" value={filter.kind} />}
        {filter.office && <input type="hidden" name="office" value={filter.office} />}
        {filter.stage && <input type="hidden" name="stage" value={filter.stage} />}
        {filter.mine && <input type="hidden" name="mine" value="1" />}
        <button type="submit" className="sparks-sr">
          Search
        </button>
      </form>

      <div className="sparks-filters">
        <div className="sparks-filter-row" role="group" aria-label="Filter by whose spark">
          <span className="sparks-filter-label">Whose</span>
          <FilterChip label="Everyone's" on={!filter.mine} href={fieldHref(filter, { mine: false })} />
          <FilterChip label="Mine" on={filter.mine} href={fieldHref(filter, { mine: !filter.mine })} />
        </div>
        <div className="sparks-filter-row" role="group" aria-label="Filter by kind">
          <span className="sparks-filter-label">Kind</span>
          <FilterChip label="Everything" on={filter.kind === null} href={fieldHref(filter, { kind: null })} />
          {(["build", "learning"] as const).map((k) => (
            <FilterChip key={k} label={KIND_LABEL[k]} on={filter.kind === k} href={fieldHref(filter, { kind: filter.kind === k ? null : k })} />
          ))}
        </div>
        <div className="sparks-filter-row" role="group" aria-label="Filter by office">
          <span className="sparks-filter-label">Office</span>
          <FilterChip label="All offices" on={filter.office === null} href={fieldHref(filter, { office: null })} />
          {IDEA_OFFICES.map((o) => (
            <FilterChip key={o} label={OFFICE_LABEL[o]} on={filter.office === o} href={fieldHref(filter, { office: filter.office === o ? null : o })} />
          ))}
          <FilterChip label="Not filed yet" on={filter.office === "none"} href={fieldHref(filter, { office: filter.office === "none" ? null : "none" })} />
        </div>
        <div className="sparks-filter-row" role="group" aria-label="Filter by stage">
          <span className="sparks-filter-label">Stage</span>
          <FilterChip label="Any stage" on={filter.stage === null} href={fieldHref(filter, { stage: null })} />
          {STAGE_CHIPS.map((c) => (
            <FilterChip key={c.stage} label={c.label} on={filter.stage === c.stage} href={fieldHref(filter, { stage: filter.stage === c.stage ? null : c.stage })} />
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="sparks-empty">
          {narrowed ? (
            <>
              No sparks match.{" "}
              <Link href="/team/ideas" scroll={false}>
                Clear the search and filters
              </Link>
            </>
          ) : (
            "No sparks yet. Yours could be the first."
          )}
        </div>
      ) : (
        <div className="sparks-grid">
          {shown.map((idea) => (
            <SparkTile key={idea.id} idea={idea} social={socialFor(idea.id, social)} stage={stages.get(idea.id) ?? "spark"} />
          ))}
        </div>
      )}

      {!filter.all && matched.length > shown.length && (
        <Link className="sparks-more" href={fieldHref(filter, { all: true })} scroll={false}>
          {narrowed ? `Show all ${matched.length} matches` : `Show all ${matched.length} sparks`}
        </Link>
      )}
    </section>
  );
}

function FilterChip({ label, on, href }: { label: string; on: boolean; href: string }) {
  return (
    <Link className="sparks-chip" href={href} aria-current={on ? "true" : undefined} scroll={false}>
      {label}
    </Link>
  );
}

function SparkTile({ idea, social, stage }: { idea: SharedIdea; social: SparkSocial; stage: SparkStage }) {
  const kind = sparkKind(idea);
  const hook = sparkHook(idea);
  const admire = admireFaces(social);
  return (
    <Link className="sparks-tile" href={`/team/ideas/${idea.id}`}>
      <div className="sparks-chips">
        <Badge tone={kind === "build" ? "info" : "ok"}>{KIND_LABEL[kind]}</Badge>
        {idea.office && <Badge tone={officeTone(idea.office)}>{OFFICE_LABEL[idea.office as IdeaOffice]}</Badge>}
        {(stage === "picked_up" || stage === "shipped") && <span className={`sparks-stage-mark sparks-stage-mark--${stage}`}>{STAGE_LABEL[stage]}</span>}
      </div>
      <div className="sparks-tile-title">{idea.title}</div>
      {hook && hook !== idea.title && <p className="sparks-tile-hook">{hook}</p>}
      <div className="sparks-by">
        <span className={`sparks-avatar sparks-avatar--${avatarTone(idea.person_id)}`} aria-hidden="true">
          {initials(idea.submitterName)}
        </span>
        <span>
          {idea.submitterName} · {formatDate(idea.created_at)}
        </span>
        <span className="sparks-tile-social">
          {admire.label && (
            <span className="sparks-faces" role="img" aria-label={admire.label} title={admire.label}>
              {admire.faces.map((f, k) => (
                <span key={k} className={`sparks-avatar sparks-avatar--sm sparks-avatar--${f.tone}`} aria-hidden="true">
                  {f.initials}
                </span>
              ))}
            </span>
          )}
          {social.builds > 0 && (
            <span className="sparks-tile-builds" aria-label={social.builds === 1 ? "1 build" : `${social.builds} builds`}>
              <Icon name="comment" />
              {social.builds}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
