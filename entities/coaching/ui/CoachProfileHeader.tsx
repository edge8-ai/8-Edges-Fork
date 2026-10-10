import Link from "next/link";
import Image from "next/image";
import type { CoachProfileDetail, OneOnOne } from "@/entities/coaching/lib/data/profile";
import type { CommitmentStatus } from "@/entities/coaching/lib/types";
import { OPEN_COMMITMENT_STATUSES, RETENTION_ROOT_LABELS } from "@/entities/coaching/lib/types";
import { NO_LAST_MEETING, openCommitmentsNote, profileIsBare } from "@/entities/coaching/lib/profile-bare";
import { CoachHeaderActions } from "./CoachHeaderActions";
import { ProposalActions } from "./ProposalActions";
import { describeDay } from "@/entities/coaching/lib/cadence";
import { formatDate } from "@/kernel/ui/format";
import { splitBookings } from "@/entities/coaching/lib/missed";

// The person header: identity plus the six vitals a coach wants before they
// read anything, plus the quick actions. Rendered server-side; the action
// buttons are the one client island inside it.

// Days between two calendar dates. Both sides are Saigon days (the page's one
// clock, todayIso), so "tomorrow" means tomorrow in Saigon. It used to read the
// server's own clock, which on Vercel is UTC and said "in 2 days" about
// tomorrow's 1-1 from midnight to 7am Saigon time (K.79).
function daysBetween(fromIso: string, toIso: string): number {
  const at = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((at(toIso) - at(fromIso)) / 86_400_000);
}

function relDay(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

type BadgeTone = "ok" | "warn" | "info" | "muted";

function Tile({
  label,
  value,
  note,
  badge,
  badgeTone = "muted",
  attn = false,
}: {
  label: string;
  value: string;
  note?: string;
  badge?: string;
  badgeTone?: BadgeTone;
  attn?: boolean;
}) {
  return (
    <div className={`admin-glance-cell${attn ? " admin-coach-hero__cell--attn" : ""}`}>
      <span className="admin-glance-label">{label}</span>
      <span className="admin-glance-value">{value}</span>
      {(note || badge) && (
        <span className="admin-glance-note admin-coach-hero__note">
          {note}
          {badge && (
            <span
              className={`admin-badge${badgeTone === "muted" ? "" : ` admin-badge--${badgeTone}`}`}
            >
              {badge}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function CoachProfileHeader({ detail, todayIso }: { detail: CoachProfileDetail; todayIso: string }) {
  const { member } = detail;

  // Next 1-1 = the earliest booking still to come, never one whose day has
  // passed (splitBookings); the meetings card picks the same row. Last = the
  // latest held.
  const { next: nextMeeting, passed } = splitBookings(detail.meetings);
  // The booking's own time, else the member's standing preference — the same
  // fallback the roster and the member's own page use, so the three agree.
  const nextTime = nextMeeting ? (nextMeeting.startsAt ?? detail.preferredTime) : null;
  const lastMeeting = detail.meetings
    .filter((m) => m.status === "held")
    .reduce<OneOnOne | null>((latest, m) => (!latest || m.heldOn > latest.heldOn ? m : latest), null);

  const open = detail.commitments.filter((c) =>
    (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status),
  );
  const openThem = open.filter((c) => c.owner === "member").length;
  const openMe = open.filter((c) => c.owner === "coach").length;

  const activeGoals = detail.goals.filter((g) => g.status === "active");
  const draftGoals = detail.goals.filter((g) => g.status === "draft").length;
  const ladderedGoals = activeGoals.filter((g) => g.ladder != null).length;

  const o = detail.ocean;
  const retentionLabel = detail.retentionRoot ? RETENTION_ROOT_LABELS[detail.retentionRoot] : "Not flagged";

  // Six tiles saying "nothing" six ways is what a coach with a new person saw
  // (L.13). The tiles earn the screen when they have something to report — the
  // same rule practiceIsBare applies on the roster, one level down.
  const bare = profileIsBare({
    // A passed booking still counts as something between them, the same way
    // CoachProfileView reads it, so the two halves of the page agree.
    hasNextMeeting: Boolean(nextMeeting) || passed.length > 0,
    hasHeldMeeting: Boolean(lastMeeting),
    openCommitments: open.length,
    goals: detail.goals.length,
  });

  return (
    <header className="admin-coach-hero">
      <Link className="admin-eyebrow admin-coach-hero__back" href="/team/coaching">
        ← Coaching
      </Link>

      <div className="admin-coach-hero__id">
        {member.avatarUrl ? (
          <Image src={member.avatarUrl} alt="" width={40} height={40} className="admin-avatar admin-avatar--lg" />
        ) : (
          <span className="admin-avatar admin-avatar--lg admin-avatar--tint" aria-hidden>
            {member.name.slice(0, 1)}
          </span>
        )}
        <div className="admin-coach-hero__id-text">
          <div className="admin-coach-hero__name">{member.name}</div>
          <div className="admin-coach-hero__role">
            {member.positionTitle ?? "—"} · 1-1 every {detail.cadenceDays} days
          </div>
        </div>
        <CoachHeaderActions
          profileId={detail.profileId}
          name={member.name}
          todayIso={todayIso}
          next={nextMeeting}
          passedDay={passed[0]?.heldOn ?? null}
          suggestedOn={detail.suggestedOn}
          preferredTime={detail.preferredTime}
          // With nothing behind the two of them, booking the first 1-1 is the
          // only thing to do — and the first-visit block below is where a coach
          // who has just landed is looking, so the date field lives there and
          // this cluster does not offer a second one (G.1).
          scheduleLivesBelow={bare}
        />
      </div>

      {/* Bare: one sentence and the one action, rather than the tiles. The
          block itself lives on the Next tab, where a coach who has just landed
          is looking; this line is the header's half of the same answer. */}
      {bare && (
        <p className="admin-hint admin-coach-hero__bare">
          Nothing has happened between you two yet. Book the first 1-1 below and this page fills itself in.
        </p>
      )}

      {!bare && (
      <div className="admin-glance admin-coach-hero__stats">
        <Tile
          label="Next session"
          value={nextMeeting ? `${formatDate(nextMeeting.heldOn)}${nextTime ? ` · ${nextTime}` : ""}` : "None scheduled"}
          note={nextMeeting ? relDay(daysBetween(todayIso, nextMeeting.heldOn)) : undefined}
          badge={!nextMeeting && passed.length > 0 ? "last one not marked done" : undefined}
          badgeTone="warn"
          attn
        />
        {/* A date the member proposed sits beside the Next 1-1 tile rather
            than inside it: the tile states a fact, and this is a question
            waiting on an answer, with the two buttons that answer it. */}
        {detail.proposedOn && (
          <div className="admin-glance-cell admin-coach-hero__cell--attn">
            <span className="admin-glance-label">Proposed</span>
            <span className="admin-glance-value">{describeDay(detail.proposedOn)}</span>
            <span className="admin-glance-note admin-coach-hero__note">
              {member.name} asked for this day
            </span>
            <ProposalActions profileId={detail.profileId} />
          </div>
        )}
        <Tile
          label="Last session"
          value={lastMeeting ? formatDate(lastMeeting.heldOn) : NO_LAST_MEETING}
          note={lastMeeting ? undefined : "the first one is still ahead"}
          badge={
            lastMeeting
              ? lastMeeting.sharedPublishedAt
                ? "note left"
                : undefined
              : undefined
          }
          badgeTone={lastMeeting?.sharedPublishedAt ? "ok" : "warn"}
        />
        <Tile
          label="Promises"
          value={open.length === 1 ? "1 open" : `${open.length} open`}
          // "All clear" was said about zero, which reads as a positive report
          // on a relationship where nothing was ever promised (L.13).
          note={openCommitmentsNote({
            open: open.length,
            them: openThem,
            me: openMe,
            everMade: detail.commitments.length > 0,
          })}
        />
        <Tile
          label="FAST goals"
          value={activeGoals.length === 1 ? "1 active" : `${activeGoals.length} active`}
          note={
            activeGoals.length
              ? ladderedGoals
                ? `${ladderedGoals} laddered to Edges`
                : "quarterly"
              : draftGoals
                ? `${draftGoals} in draft`
                : "none yet"
          }
        />
      </div>
      )}
    </header>
  );
}
