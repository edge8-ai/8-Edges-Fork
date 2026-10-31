import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { mayProp } from "@/kernel/identity/may-prop";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { saigonToday } from "@/kernel/config/dates";
import { kudosBefore, kudosForMonth } from "@/entities/team/lib/kudos";
import { addMonths, kudosRecipients, monthName, monthOf, parseMonth, starterCount } from "@/entities/team/lib/kudos-rules";
import { homePeople } from "@/entities/team/lib/home-people";
import { shuffle } from "@/entities/team/lib/home-compose";
import { toneFor } from "@/entities/team/ui/home/HomeFace";
import { KudosHand } from "@/entities/team/ui/home/HomeKudos";
import { KudosComposer } from "@/entities/team/ui/kudos/KudosComposer";
import { KudosNotes } from "@/entities/team/ui/kudos/KudosNotes";
import { KudosDraftProvider, KudosStarters } from "@/entities/team/ui/kudos/KudosDraft";
import { KudosArchive } from "@/entities/team/ui/kudos/KudosArchive";

// The month's kudos board (TH.1.8, laid out as a page in TH.20). This month's
// page carries the composer beside the wall of notes; a past month
// (?month=2026-09) is a keepsake: the thanks as they were given, read only,
// with a way back and forward through the months. Every month is the whole
// company's, newest first, and nothing on it is counted per person. Under this
// month's notes (TH.21) come a few starters that open a thank-you in the
// composer, and one note from an earlier month, so the space below the wall
// encourages rather than sits empty. The month's own notes always come first.

// How many earlier notes "Another one" steps through.
const ARCHIVE_PICKS = 6;

// The tab and screen-reader title; without it the page was just "Edge8 Team" (TH.19).
export const metadata = { title: "Kudos", description: "Thanks between teammates, month by month." };

export default async function KudosPage(props: { searchParams: Promise<SearchParamsObj> }) {
  const access = await requirePermission("team.culture");
  const actor = await requireTeamMember();
  const searchParams = await props.searchParams;
  const current = monthOf(saigonToday());
  const asked = parseMonth(firstParam(searchParams.month));
  // A month in the future has no kudos yet; it shows this one instead.
  const month = asked && asked <= current ? asked : current;
  const isCurrent = month === current;
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);

  const [notes, people, earlier] = await Promise.all([
    kudosForMonth(month),
    isCurrent ? homePeople() : Promise.resolve(null),
    isCurrent ? kudosBefore(current) : Promise.resolve([]),
  ]);
  const faces = (people ?? []).map((p) => ({ personId: p.personId, name: p.name, firstName: p.firstName, avatarUrl: p.avatarUrl, tone: toneFor(p.personId) }));
  const { quick, everyone } = kudosRecipients(shuffle(faces), actor.personId);
  const name = monthName(month, current);
  const may = mayProp(access, ["team.culture"]);
  const hrefFor = (m: string) => (m === current ? "/team/kudos" : `/team/kudos?month=${m}`);
  // Starters only where the composer they fill is shown.
  const starters = isCurrent && people && may["team.culture"] ? starterCount(notes?.length ?? 0) : 0;
  const archive = shuffle(earlier).slice(0, ARCHIVE_PICKS);

  return (
    <div className="kd-page">
      <div className="kd">
        <section className="kd-hero" aria-labelledby="kd-head">
          <KudosHand />
          <p className="kd-k">Kudos · thank a teammate</p>
          <h1 className="kd-head" id="kd-head">
            {name} kudos
          </h1>
          <p className="kd-sub">
            {isCurrent ? "Thanks between teammates, in their own words. Everyone’s, newest first." : `${name}’s thanks, kept as they were given.`}
          </p>
          <nav className="kd-months" aria-label="Months">
            <Link className="kd-month" href={hrefFor(prev)}>
              ← {monthName(prev, current)}
            </Link>
            {!isCurrent && (
              <Link className="kd-month" href={hrefFor(next)}>
                {monthName(next, current)} →
              </Link>
            )}
          </nav>
        </section>

        <KudosDraftProvider>
          <div className="kd-grid">
            <section className="kd-wall" aria-label={`${name} kudos`}>
              {notes === null ? (
                <p className="kd-empty">{name}&rsquo;s kudos could not be loaded. Try again in a moment.</p>
              ) : (
                <>
                  {notes.length === 0 && (
                    <p className={starters ? "kd-empty is-soft" : "kd-empty"}>
                      {!isCurrent
                        ? `No kudos were given in ${name}.`
                        : starters
                          ? "Nobody has said thanks yet this month. Be the first: pick a spark below, or write your own."
                          : "Nobody has said thanks yet this month. Be the first."}
                    </p>
                  )}
                  <div className="kd-flow">
                    {notes.length > 0 && <KudosNotes notes={notes} viewerPersonId={actor.personId} currentMonth={current} may={may} layout="page" />}
                    <KudosStarters count={starters} />
                  </div>
                </>
              )}
              <KudosArchive notes={archive} viewerPersonId={actor.personId} currentMonth={current} />
            </section>
            <aside className="kd-side" aria-label="Give kudos">
              {isCurrent && people && <KudosComposer quick={quick} everyone={everyone} may={may} layout="page" />}
              {isCurrent && !people && (
                <section className="kd-card">
                  <p className="kd-hint">The team list could not be loaded, so kudos cannot be sent just now.</p>
                </section>
              )}
              {!isCurrent && (
                <section className="kd-card kd-keep">
                  <h2 className="kd-h">A keepsake</h2>
                  <p className="kd-hint">This is how {name}&rsquo;s thanks were given, kept as they were. New kudos go on this month&rsquo;s page.</p>
                  <Link className="kd-month kd-month-solid" href={hrefFor(current)}>
                    Go to this month
                  </Link>
                </section>
              )}
            </aside>
          </div>
        </KudosDraftProvider>
      </div>
    </div>
  );
}
