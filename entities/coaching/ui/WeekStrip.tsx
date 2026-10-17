import Link from "next/link";
import Image from "next/image";
import type { WeekDay } from "@/entities/coaching/lib/week-strip";
import { describeDay } from "@/entities/coaching/lib/cadence";

// The coach's week at a glance (K.80): Monday to Friday, each day with the
// sessions on it. Held sessions are quiet, booked ones are the week's shape,
// and a day the employee proposed is marked as waiting on the coach. Each
// entry links to the person; the strip has no actions of its own, so the
// rows below stay the one place a thing gets done.
export function WeekStrip({ days }: { days: WeekDay[] }) {
  return (
    <section className="coach-week" aria-label="This week at a glance">
      {days.map((d) => (
        <div key={d.iso} className={`coach-week-day${d.isToday ? " is-today" : ""}${d.isPast ? " is-past" : ""}`}>
          <div className="coach-week-label">
            {weekdayLabel(d.iso)}
            {d.isToday && <span className="coach-week-today"> · today</span>}
          </div>
          {d.items.length === 0 ? (
            <div className="coach-week-free">Free</div>
          ) : (
            <ul className="coach-week-items">
              {d.items.map((it) => (
                <li key={`${it.profileId}-${it.kind}`}>
                  <Link href={`/team/coaching/${it.profileId}`} className={`coach-week-item coach-week-item--${it.kind}`}>
                    {it.avatarUrl ? (
                      <Image src={it.avatarUrl} alt="" width={28} height={28} className="coach-week-face" />
                    ) : (
                      <span className="coach-week-face coach-week-face--initial" aria-hidden>
                        {it.name.slice(0, 1)}
                      </span>
                    )}
                    {it.time && <span className="coach-week-time">{it.time}</span>}
                    <span className="coach-week-name">{it.name}</span>
                    <span className="coach-week-note">{it.note}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

// "Mon 5": a week reads as weekdays, so a day is never "yesterday" here.
function weekdayLabel(iso: string): string {
  const [weekday, date] = describeDay(iso).split(" ");
  return `${weekday.slice(0, 3)} ${date}`;
}
