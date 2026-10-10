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
// position instead of jumping to the top.

export function SparkField({
  ideas,
  filter,
  social,
  stages,
}: {
  ideas: SharedIdea[];
  filter: FieldFilter;
  social: Map<string, SparkSocial>;
  stages: Map<string, SparkStage>;
}) {
  const matched = filterField(ideas, filter);
  const narrowed = isFiltered(filter);
  const shown = filter.all || narrowed ? matched : matched.slice(0, FIELD_FIRST);

  return (
    <section className="sparks-field" aria-labelledby="field-h">
      <div className="sparks-field-head">
        <div>
          <h2 id="field-h" className="sparks-h2">
            All sparks
          </h2>
          <p className="sparks-lede">Everything the team has shared, newest first. Open one to read the whole thing.</p>
        </div>
        {narrowed && (
          <span className="sparks-count" aria-live="polite">
            {matched.length === 1 ? "1 spark matches" : `${matched.length} sparks match`}
          </span>
        )}
      </div>

      <div className="sparks-filters">
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
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="sparks-empty">{narrowed ? "No sparks match. Clear a filter to see more." : "No sparks yet. Yours could be the first."}</div>
      ) : (
        <div className="sparks-grid">
          {shown.map((idea) => (
            <SparkTile key={idea.id} idea={idea} social={socialFor(idea.id, social)} stage={stages.get(idea.id) ?? "spark"} />
          ))}
        </div>
      )}

      {!filter.all && !narrowed && matched.length > shown.length && (
        <Link className="sparks-more" href={fieldHref(filter, { all: true })} scroll={false}>
          Show all {matched.length} sparks
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
