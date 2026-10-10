// The right column of the team Home (TH.1.6): who is out, new faces, what is
// coming up, and the person's own FAST goals stretched to the bottom of the
// column. Server components; the page reads the data and passes it in.
//
// Each card takes null for "could not read" and hides, so a failed read never
// prints "nobody is out" or "nothing coming up" (Rule 2).
import Link from "next/link";
import type { HubPrompt } from "@/entities/coaching";
import { HomeFace } from "./HomeFace";

export type RailPerson = { id: string; name: string; avatarUrl: string | null; tone: number; line: string };

function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function HomeOut({ people, timeOffHref }: { people: RailPerson[]; timeOffHref: string | null }) {
  return (
    <section className="th-card" aria-labelledby="th-out-h">
      <div className="th-card-h">
        <h2 id="th-out-h">Who&rsquo;s out today</h2>
        {timeOffHref && <Link href={timeOffHref}>Time off →</Link>}
      </div>
      <div className="th-pad">
        {people.length === 0 ? (
          <p className="th-meta">Everyone&rsquo;s in today.</p>
        ) : (
          people.map((p) => (
            <div key={p.id} className="th-person">
              <HomeFace name={p.name} avatarUrl={p.avatarUrl} tone={p.tone} />
              <div className="th-person-name">{p.name}</div>
              <span className="th-back">Back {shortDate(p.line)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function HomeNewFaces({ people, directoryHref }: { people: RailPerson[]; directoryHref: string | null }) {
  if (people.length === 0) return null;
  return (
    <section className="th-card" aria-labelledby="th-new-h">
      <div className="th-card-h">
        <h2 id="th-new-h">New faces</h2>
      </div>
      <div className="th-pad">
        {people.map((p) => (
          <div key={p.id} className="th-person">
            <HomeFace name={p.name} avatarUrl={p.avatarUrl} tone={p.tone} />
            <div className="u-min-0">
              <div className="th-person-name">{p.name}</div>
              <div className="th-meta">{p.line}</div>
            </div>
            {directoryHref && <Link href={`${directoryHref}/${p.id}`}>Say hello</Link>}
          </div>
        ))}
      </div>
    </section>
  );
}

export type ComingItem = { key: string; title: string; detail: string; on: string | null; href: string | null; survey?: boolean };

export function HomeComingUp({ items }: { items: ComingItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="th-card" aria-labelledby="th-up-h">
      <div className="th-card-h">
        <h2 id="th-up-h">Coming up</h2>
      </div>
      <div className="th-pad">
        {items.map((it) => (
          <div key={it.key} className="th-ev">
            {it.survey ? (
              <span className="th-date is-survey" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4h6l1 2h3v14H5V6h3z" /><path d="M9 12l2 2 4-4" /></svg>
              </span>
            ) : (
              <span className="th-date" aria-hidden="true">
                <span>{it.on ? new Date(`${it.on.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) : ""}</span>
                <b>{it.on ? Number(it.on.slice(8, 10)) : ""}</b>
              </span>
            )}
            <div className="u-min-0">
              <div className="th-person-name">{it.href ? <Link href={it.href}>{it.title}</Link> : it.title}</div>
              <div className="th-meta">{it.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export type RailGoal = { id: string; title: string; pct: number | null; current: number | null; target: number | null; unit: string | null; status: string };

const RING = 2 * Math.PI * 26;

/** "19 of 200 students"; a unit that opens with a number is set apart: "3 of 3 (1 on 1 counts)". */
export function goalMeasure(g: RailGoal): string | null {
  if (g.current === null || g.target === null) return null;
  const unit = g.unit?.trim();
  if (!unit) return `${g.current} of ${g.target}`;
  return /^\d/.test(unit) ? `${g.current} of ${g.target} (${unit})` : `${g.current} of ${g.target} ${unit}`;
}

function Ring({ goal }: { goal: RailGoal }) {
  const full = goal.pct !== null && goal.pct >= 100;
  return (
    <svg className="th-ring" viewBox="0 0 64 64" aria-hidden="true">
      <circle className="track" cx="32" cy="32" r="26" />
      {goal.pct !== null && (
        <circle className={`arc${full ? " is-full" : ""}`} cx="32" cy="32" r="26" strokeDasharray={`${(RING * goal.pct) / 100} ${RING}`} transform="rotate(-90 32 32)" />
      )}
      {full ? (
        <path className="tick" d="M23 32.5l6 6 12-13" />
      ) : goal.pct !== null && goal.current !== null ? (
        <text x="32" y="37" textAnchor="middle">
          {goal.current}
        </text>
      ) : null}
    </svg>
  );
}

const GOALS = "/team/my-coaching?tab=goals";

export function HomeGoals({
  goals,
  hasCoaching,
  lastOneOnOne,
  prompt,
  emptyNote,
}: {
  goals: RailGoal[];
  hasCoaching: boolean;
  lastOneOnOne: string | null;
  prompt: HubPrompt | null;
  emptyNote: string | null;
}) {
  return (
    <section className="th-card th-goals" aria-labelledby="th-goals-h">
      <div className="th-card-h">
        <div>
          <div className="th-eyebrow">Set by you, for you</div>
          <h2 id="th-goals-h">Your FAST goals</h2>
        </div>
        <Link href={GOALS}>All →</Link>
      </div>
      <div className="th-goals-b">
        {emptyNote && goals.length === 0 ? (
          <p className="th-meta">
            {emptyNote} <Link href={GOALS}>Write it →</Link>
          </p>
        ) : !hasCoaching ? (
          <p className="th-meta">Your FAST goals and 1-1s show here once your coaching is set up.</p>
        ) : goals.length === 0 ? (
          <p className="th-meta">No FAST goals yet. <Link href={GOALS}>Add your first →</Link></p>
        ) : (
          goals.slice(0, 3).map((g) => (
            <div key={g.id} className="th-goal">
              <Ring goal={g} />
              <div className="u-min-0">
                <div className="th-goal-title">{g.title}</div>
                <div className="th-meta">{goalMeasure(g) ?? g.status}</div>
              </div>
            </div>
          ))
        )}
        {hasCoaching && (prompt || lastOneOnOne) && (
          <div className="th-nudge">
            <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="th-sprout-mini">
              <circle className="bg" cx="20" cy="20" r="19" />
              <path className="stem" d="M20 30V18" />
              <path className="leaf" d="M20 22c-6 0-8-4-8-8 5 0 8 3 8 8z" />
              <path className="leaf" d="M20 19c5 0 7-3 7-6-4 0-7 2-7 6z" />
            </svg>
            <div>
              <b>{prompt ? prompt.text : `Last 1-1 on ${new Date(`${lastOneOnOne}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`}</b>
              <Link href={prompt ? prompt.href : "/team/my-coaching"}>{prompt ? `${prompt.cta} →` : "Note a win for your next one →"}</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
