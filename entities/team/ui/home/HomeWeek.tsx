// Your week on Home (TH.1.3): a doorway to My week, not a second one. It reads
// the same model the My week page draws (boards' readMyWeek + myWeek), so the
// two can never count a person's cards differently, and shows only what
// matters this morning: the plant, what is late or due, and Next up with Start.
// Everything else is one click away on My week, which has it all (Khoa,
// 2026-10-09).
import Link from "next/link";
import { MyWeekSprout, MyWeekStart, sproutStage, PRIORITY_LABEL, type MyWeekModel } from "@/entities/boards";

const MY_WEEK = "/team/my-week";

function dayName(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

type Chip = { label: string; tone: "late" | "today" | "plain" | "clear" };

/** The chips: late, due today, due tomorrow, then the rest of the sprint by day. */
export function weekChips(model: MyWeekModel): Chip[] {
  const chips: Chip[] = [];
  if (model.counts.late > 0) chips.push({ label: `${model.counts.late} late`, tone: "late" });
  if (model.counts.dueToday > 0) chips.push({ label: `${model.counts.dueToday} due today`, tone: "today" });
  const ahead = model.days.filter((d) => !d.isPast && !d.isToday && d.open.length > 0);
  ahead.forEach((d, i) => {
    const when = i === 0 && d.date === nextDay(model.today) ? "tomorrow" : dayName(d.date).split(" ")[0];
    chips.push({ label: `${d.open.length} due ${when}`, tone: "plain" });
  });
  if (chips.length === 0) chips.push({ label: "Nothing late or due this week", tone: "clear" });
  return chips;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function HomeWeek({ model }: { model: MyWeekModel }) {
  const fed = model.rail.fed;
  const next = model.rail.nextUp;
  return (
    <section className="th-card" aria-labelledby="th-week-h">
      <div className="th-card-h">
        <h2 id="th-week-h">Your week</h2>
        <Link href={MY_WEEK}>Open My week →</Link>
      </div>
      <div className="th-week">
        <div className="th-plant">
          <MyWeekSprout fed={fed.length} names={fed.map((f) => f.title)} />
          <div>
            <b>{sproutStage(fed.length)}</b>
            <span>this sprint&rsquo;s plant</span>
          </div>
        </div>
        <div className="th-week-main">
          <div className="th-chips">
            {weekChips(model).map((c) => (
              <Link key={c.label} href={MY_WEEK} className={`th-chip${c.tone === "plain" ? "" : ` is-${c.tone}`}`}>
                {c.label}
              </Link>
            ))}
          </div>
          {next ? (
            <div className="th-next">
              <div className="th-next-main">
                <div className="th-eyebrow">Next up</div>
                <h3>{next.href ? <Link href={next.href}>{next.title}</Link> : next.title}</h3>
                <div className="th-meta">
                  {PRIORITY_LABEL[next.priority]} · {next.place}
                  {next.due ? ` · due ${dayName(next.due)}` : ""}
                </div>
              </div>
              <MyWeekStart taskId={next.id} title={next.title} />
            </div>
          ) : (
            <p className="th-meta">Nothing waiting to start. Your sprint&rsquo;s open cards are all under way.</p>
          )}
        </div>
      </div>
      <div className="th-week-foot">
        <span>Your plan for the sprint, day by day, lives on My week.</span>
        <Link href={MY_WEEK}>My week →</Link>
      </div>
    </section>
  );
}
