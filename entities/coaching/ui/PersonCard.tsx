import Link from "next/link";
import Image from "next/image";
import type { CoachRosterRow } from "@/entities/coaching/lib/data/roster";
import { goalMeta } from "@/entities/coaching/lib/goal-line";
import { goalProgressPct } from "@/entities/coaching/lib/goal-percent";
import { cardWhen, sinceLine, type HomeRow } from "@/entities/coaching/lib/home-lines";
import { dayInSentence } from "@/entities/coaching/lib/day-choices";
import { rowActions, type RowActionBar } from "@/entities/coaching/lib/row-actions";
import { RosterRowActions } from "@/entities/coaching/ui/RosterRowActions";

// One person on the coach's home page (K.82). The card answers what a phone
// call would, in the order a manager wants it (research: Gallup, Kim Scott,
// Lara Hogan, Amabile and Kramer): when you meet, their latest words, what
// changed since last time, their FAST goal on its own scale, one action.
//
// The whole card opens the person's page. The name is a real link inside the
// heading, stretched over the card by CSS, so a click anywhere lands there and
// a screen reader hears one link; the action buttons sit above it as their own
// targets (Inclusive Components; NN/g "click uncertainty"; Baymard). Nothing
// here scores the person, compares them with anybody, or turns red.
export function PersonCard({
  row,
  home,
  marker,
  today,
  index,
}: {
  row: CoachRosterRow;
  home: HomeRow;
  marker: string | null;
  today: string;
  index: number;
}) {
  const href = `/team/coaching/${row.profileId}`;
  const first = row.member.name.split(" ")[0] || row.member.name;
  const words = row.signals.latestWords;
  const since = sinceLine(row.lastHeldOn, today, {
    topicsFromThem: row.signals.topicsFromThem,
    kept: row.facts.kept,
    stuck: row.facts.stuck,
    onTheGo: Math.max(row.facts.openCommitments - row.facts.stuck, 0),
  });
  const pct = row.goal ? goalProgressPct(row.goal) : null;

  return (
    <article className="coach-pcard" id={`person-${row.profileId}`}>
      {marker && <span className="coach-pcard-marker">{marker}</span>}
      <div className="coach-pcard-head">
        {row.member.avatarUrl ? (
          <Image
            src={row.member.avatarUrl}
            alt=""
            width={64}
            height={64}
            loading={index < 6 ? "eager" : "lazy"}
            className="coach-pcard-avatar"
          />
        ) : (
          <span className="coach-pcard-avatar coach-pcard-avatar--initial" aria-hidden>
            {row.member.name.slice(0, 1)}
          </span>
        )}
        <div className="coach-pcard-who">
          <h3 className="coach-pcard-name">
            <Link href={href} className="coach-pcard-link">
              {row.member.name}
            </Link>
          </h3>
          {row.member.positionTitle && <span className="coach-pcard-role">{row.member.positionTitle}</span>}
        </div>
      </div>

      <p className="coach-pcard-when">{cardWhen(home, today)}</p>

      {words ? (
        <blockquote className="coach-pcard-quote">
          <p>“{words.text}”</p>
          {/* Not a <footer>: the site's global footer rule paints it dark. */}
          <span className="coach-pcard-quote-by">
            {words.label}, {dayInSentence(words.on, today)}
          </span>
        </blockquote>
      ) : (
        <p className="coach-pcard-quiet">No check-in or note yet: ask what is on their mind.</p>
      )}

      <p className="coach-pcard-since">
        <b>{since.label}</b> {since.text}
      </p>

      {row.goal ? (
        <div className="coach-pcard-goal">
          <span className="coach-pcard-eyebrow">FAST goal</span>
          <span className="coach-pcard-goal-title">{row.goal.title}</span>
          {/* A native progress element: no inline style object (design ratchet),
              and a screen reader hears the share of the way, on its own scale. */}
          {pct !== null && (
            <progress className="coach-pcard-bar" max={100} value={pct} aria-label={`${row.goal.title}: ${pct}% of the way`} />
          )}
          <span className="coach-pcard-goal-meta">{goalMeta(row.goal, today) || "No number yet: ask what would show progress"}</span>
        </div>
      ) : (
        <div className="coach-pcard-goal coach-pcard-goal--none">
          <span className="coach-pcard-eyebrow">FAST goal</span>
          <span className="coach-pcard-goal-meta">None yet: shape one together.</span>
        </div>
      )}

      <div className="coach-pcard-foot">
        <span className="coach-pcard-open" aria-hidden>
          Open {first}’s page →
        </span>
        <div className="coach-pcard-actions">
          <RosterRowActions
            bar={trim(
              rowActions({
                profileId: row.profileId,
                name: row.member.name,
                proposedOn: row.proposedOn,
                proposedBy: row.proposedBy,
                nextOneOnOneOn: row.nextOneOnOneOn,
                nextMeetingId: row.nextMeetingId,
                nextStartsAt: row.nextStartsAt,
                agendaWritten: row.agendaWritten,
                todayISO: today,
                missedOn: row.missedOn,
                leave: row.leave,
                missedMeetingId: row.missedMeetingId,
                hasHeldOneOnOne: row.heldCount > 0,
                suggestedOn: row.suggestedOn,
              }),
            )}
            profileId={row.profileId}
            name={row.member.name}
            missedMeetingId={row.missedMeetingId}
            missedOn={row.missedOn}
            nextOn={row.nextOneOnOneOn}
            missedStartsAt={row.missedStartsAt}
            nextMeetingId={row.nextMeetingId}
            nextStartsAt={row.nextStartsAt}
            todayIso={today}
          />
        </div>
      </div>
    </article>
  );
}

// On a card the filled control leads and one quiet one may follow. "Open
// <name>" and "Last recap" are dropped: the whole card is the way in, and the
// person's page opens on their last session. The prep link is dropped too,
// for the same reason, unless it is the filled control.
function trim(bar: RowActionBar): RowActionBar {
  const quiet = bar.quiet.filter((a) => a.id !== "open" && a.id !== "last-recap" && a.id !== "open-prep");
  return { filled: bar.filled, quiet: quiet.slice(0, 1) };
}
