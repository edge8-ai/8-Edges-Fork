import Link from "next/link";
import type { SharedIdea } from "@/entities/team/lib/data";
import { formatDate } from "@/kernel/ui/format";
import { Icon } from "@/kernel/ui/Icon";
import { joinNames, type CameBack } from "@/entities/ideas";
import { KIND_LABEL, sparkKind } from "./sparks-model";

// Your sparks (ID.2.2): private, and measured against your own past only. It
// lists what came back on your sparks and what you shared; it never counts,
// ranks or nudges.

const SHOWN = 4;

export function YourSparks({ mine, cameBack }: { mine: SharedIdea[]; cameBack: CameBack[] }) {
  return (
    <aside className="sparks-mine" aria-labelledby="mine-h">
      <div className="sparks-mine-head">
        <h2 id="mine-h">Your sparks</h2>
        <span className="sparks-private">
          <Icon name="lock" />
          Only you see this
        </span>
      </div>
      {cameBack.length > 0 && (
        <div className="sparks-came-back">
          <h3>What came back</h3>
          <ul className="sparks-mine-list">
            {cameBack.map((c) => (
              <li key={`${c.ideaId}:${c.line}:${c.at}`}>
                <Link className="sparks-mine-item" href={`/team/ideas/${c.ideaId}`}>
                  <span className="sparks-came-line">
                    <strong>{joinNames(c.who)}</strong> {c.line} “{c.title}”
                  </span>
                  {c.quote && <span className="sparks-came-quote">“{c.quote}”</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mine.length === 0 ? (
        <>
          <span className="sparks-mine-tag">Your first star</span>
          <p className="sparks-mine-note">
            Nothing shared yet. <strong>One line</strong> in the box above lights your first star in the team sky.
          </p>
        </>
      ) : (
        <ul className="sparks-mine-list">
          {mine.slice(0, SHOWN).map((s) => (
            <li key={s.id}>
              {/* Tinted by kind (W.190): blue for a build, mint for a learning, the same two colours as the composer. */}
              <Link className={`sparks-mine-item sparks-mine-item--${sparkKind(s)}`} href={`/team/ideas/${s.id}`}>
                <strong>{s.title}</strong>
                <span>
                  {KIND_LABEL[sparkKind(s)]} · {formatDate(s.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {mine.length > SHOWN && (
        <p className="sparks-mine-note">Your earlier sparks are in All sparks, and lit in the team sky.</p>
      )}
    </aside>
  );
}
