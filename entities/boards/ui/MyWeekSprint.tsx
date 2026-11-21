// Your sprint (W.173): the progress half of My Week. The agenda says what you
// owe; these say what to do now and what you have done.
//
// THE BAND. On a wide screen the page opens on a band across the top: this
// card (the ring and Next up side by side) and the Shipped shelf beside it,
// so the plant and its badges are on screen without scrolling. Below the band
// the agenda runs in two columns, and the side column holds the garden and
// the boards. It was chosen on 2026-10-07 from four prototypes measured at a
// 2000 × 1050 window; a rail beside the agenda put the badges and garden below
// the fold and left a block under the agenda empty.
//
// The rules it plays by are written where its figures are made
// (lib/my-week-sprint.ts): your own sprint and your own past, nothing that
// scores, ranks or wilts.
import type { ReactNode } from "react";
import Link from "next/link";
import type { MyWeekModel } from "@/entities/boards/lib/my-week";
import { MyWeekRing } from "./MyWeekRing";
import { MyWeekSprout, sproutStage } from "./MyWeekSprout";
import { MyWeekStart } from "./MyWeekStart";
import { dueWords, nearDate } from "./my-week-dates";

/** The ring and the one card to pick up next, in one card. */
export function MyWeekSprintCard({ model }: { model: MyWeekModel }) {
  return (
    <section className="admin-myweek-card admin-myweek-sprint" aria-labelledby="my-week-sprint-h">
      <h2 className="admin-myweek-rail-h" id="my-week-sprint-h">
        Your sprint
      </h2>
      <div className="admin-myweek-sprint-body">
        <MyWeekRing ring={model.rail.ring} weekday={nearDate(model.today, model.today)} />
        <NextUp model={model} />
      </div>
    </section>
  );
}

/** The side column under the band: the garden, then whatever the page puts below it (the boards). */
export function MyWeekSide({ model, children }: { model: MyWeekModel; children?: ReactNode }) {
  return (
    <div className="admin-myweek-side">
      <Garden model={model} />
      {children}
    </div>
  );
}

/** One card, picked by a rule anyone can predict: most late, then priority, then due. */
function NextUp({ model }: { model: MyWeekModel }) {
  const next = model.rail.nextUp;
  return (
    <div className="admin-myweek-next">
      <h3 className="admin-myweek-next-h">Next up</h3>
      {next ? (
        <>
          <p className="admin-myweek-next-title">
            <span className={`admin-myweek-pri${next.priority === "p1" ? " is-lead" : ""}`}>{next.priority.toUpperCase()}</span>{" "}
            {next.href ? <Link href={next.href}>{next.title}</Link> : next.title}
          </p>
          <p className="admin-myweek-next-when">
            {next.lateDays > 0 ? (
              <span className="admin-myweek-late">{next.lateDays}d late</span>
            ) : next.due ? (
              dueWords(next.due, model.today, model.window.endsOn)
            ) : (
              "No date"
            )}
            {" · "}picked because it is the {next.lateDays > 0 ? "most overdue" : "most urgent"} card you have not started
          </p>
          <MyWeekStart taskId={next.id} title={next.title} />
        </>
      ) : (
        <p className="admin-myweek-next-when">
          {model.counts.doing > 0 ? "Everything open has started. Finish one and your plant grows a leaf." : "Nothing waiting to start."}
        </p>
      )}
    </div>
  );
}

/** The sprints before this one, a plant each, grown to what they finished. */
function Garden({ model }: { model: MyWeekModel }) {
  const { garden, fed } = model.rail;
  if (garden.length === 0) return null;
  return (
    <section className="admin-myweek-card admin-myweek-garden" aria-labelledby="my-week-garden-h">
      <h2 className="admin-myweek-rail-h" id="my-week-garden-h">
        Your garden
      </h2>
      <ol className="admin-myweek-garden-row">
        {garden.map((g) => (
          <li key={g.week} className="admin-myweek-garden-plot">
            <MyWeekSprout fed={g.finished} size="sm" />
            <span className="admin-myweek-garden-week">{g.week}</span>
            <span className="u-sr-only">
              {sproutStage(g.finished)}, {g.finished} {g.finished === 1 ? "card" : "cards"}
            </span>
          </li>
        ))}
        <li className="admin-myweek-garden-plot is-now">
          <MyWeekSprout fed={fed.length} size="sm" />
          <span className="admin-myweek-garden-week">Now</span>
          <span className="u-sr-only">This sprint: {sproutStage(fed.length)}</span>
        </li>
      </ol>
      <p className="admin-myweek-hint">One plant per sprint, grown by the cards you finished in it. Hover a leaf on this sprint&apos;s plant to see what fed it.</p>
    </section>
  );
}
