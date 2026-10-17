import Link from "next/link";
import type { ClientDigest, DigestEntry, DigestList } from "@/entities/team/lib/client-digest";
import { clientTone, metPhrase } from "@/entities/team/lib/my-clients-view";
import { dayLabel } from "@/entities/boards";
import { businessDate } from "@/kernel/config/dates";
import { initials } from "@/kernel/ui/format";
import { Icon } from "@/kernel/ui/Icon";
import styles from "./my-clients.module.css";

// One client on My Clients (X.3): who they are and when we last met, then
// their work as three lanes in the Workboard's colours. Waiting comes first
// because it is the lane somebody acts on; a lane with nothing in it narrows
// to a grey column, so colour only marks where there is something to read.

export const BASE_PATH = "/team/clients";

type LaneKind = "waiting" | "now" | "shipped";

const LANES: Record<LaneKind, { label: string; empty: string; where: string }> = {
  waiting: { label: "Waiting on them", empty: "Nothing waiting", where: "on the board" },
  now: { label: "Building now", empty: "Nothing set to Now", where: "on the roadmap" },
  shipped: { label: "Shipped this week", empty: "Nothing shipped", where: "on the board" },
};

// The line under a title: who holds a waiting card and since when, the day a
// card shipped, and the program when the client has more than one.
function entryMeta(kind: LaneKind, e: DigestEntry, today: string): string {
  const day = e.at ? dayLabel(businessDate(e.at)) : null;
  const parts: string[] = [];
  if (kind === "waiting") {
    if (e.assignee) parts.push(e.assignee);
    if (day) parts.push(`waiting since ${day}`);
    if (e.due && e.due < today) parts.push(`was due ${dayLabel(e.due)}`);
  }
  if (e.program) parts.push(e.program);
  if (kind === "shipped" && day) parts.push(day);
  return parts.join(" · ");
}

function Lane({ kind, list, today }: { kind: LaneKind; list: DigestList; today: string }) {
  const lane = LANES[kind];
  const empty = list.total === 0;
  // "+3 more on the board" when the rest sit on one page; per page otherwise
  // ("+2 more in Payroll IQ"), so no link promises items its page lacks.
  const single = list.more.length === 1;
  return (
    <section
      className={`${styles.lane} ${styles[`lane_${kind}`]}${empty ? ` ${styles.laneEmpty}` : ""}`}
      aria-label={lane.label}
    >
      <div className={styles.laneHead}>
        <span className={styles.laneDot} aria-hidden="true" />
        {lane.label}
        {!empty && <span className={styles.laneCount}>{list.total}</span>}
      </div>
      {empty && <p className={styles.laneNone}>{lane.empty}</p>}
      {list.shown.map((e) => {
        const meta = entryMeta(kind, e, today);
        return (
          <Link key={e.id} href={e.href} className={styles.item} title={e.title}>
            <span className={styles.itemTitle}>{e.title}</span>
            {meta && <span className={styles.itemMeta}>{meta}</span>}
          </Link>
        );
      })}
      {list.more.map((m) => (
        <Link key={m.place.href} href={m.place.href} className={styles.more}>
          +{m.count} more {single ? lane.where : m.place.where} →
        </Link>
      ))}
    </section>
  );
}

export function MyClientCard({ d, today }: { d: ClientDigest; today: string }) {
  const href = `${BASE_PATH}/${d.id}`;
  const met = metPhrase(d.lastMeeting?.date ?? null, today);
  return (
    <article className={styles.card} aria-label={d.name}>
      <div className={styles.head}>
        <span className={`${styles.mono} ${styles[`tone${clientTone(d.id)}`]}`} aria-hidden="true">
          {initials(d.name)}
        </span>
        <div className={styles.who}>
          <div className={styles.nameRow}>
            <Link href={href} className={styles.name}>
              {d.name}
            </Link>
            {d.roleTitle && <span className={styles.role}>You: {d.roleTitle}</span>}
          </div>
          <div className={styles.programs}>
            {d.programs.length === 0 ? (
              <span className={styles.noProgram}>No active AI Program</span>
            ) : (
              d.programs.map((p) => (
                <Link key={p.id} href={`${href}/programs/${p.id}`} className={styles.program}>
                  {p.name}
                </Link>
              ))
            )}
          </div>
        </div>
        <div className={styles.side}>
          <span
            className={`${styles.met}${met.stale ? ` ${styles.metStale}` : ""}`}
            title={d.lastMeeting?.title ?? undefined}
          >
            <Icon name="clock" />
            {met.text}
          </span>
          <Link href={`${href}/meetings`} className={styles.sideLink}>
            Meetings
          </Link>
          <Link href={href} className={styles.open}>
            Open client →
          </Link>
        </div>
      </div>
      <div className={styles.lanes}>
        <Lane kind="waiting" list={d.waiting} today={today} />
        <Lane kind="now" list={d.now} today={today} />
        <Lane kind="shipped" list={d.moved} today={today} />
      </div>
    </article>
  );
}
