import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { mayProp } from "@/kernel/identity/may-prop";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { saigonToday } from "@/kernel/config/dates";
import { kudosForMonth } from "@/entities/team/lib/kudos";
import { addMonths, kudosRecipients, monthName, monthOf, parseMonth } from "@/entities/team/lib/kudos-rules";
import { homePeople } from "@/entities/team/lib/home-people";
import { shuffle } from "@/entities/team/lib/home-compose";
import { toneFor } from "@/entities/team/ui/home/HomeFace";
import { KudosHand } from "@/entities/team/ui/home/HomeKudos";
import { KudosComposer } from "@/entities/team/ui/kudos/KudosComposer";
import { KudosNotes } from "@/entities/team/ui/kudos/KudosNotes";

// The month's kudos board (TH.1.8). This month's page carries the composer;
// a past month (?month=2026-09) is a keepsake: the thanks as they were given,
// read only, with a way back and forward through the months. Every month is
// the whole company's, newest first, and nothing on it is counted per person.

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

  const [notes, people] = await Promise.all([kudosForMonth(month), isCurrent ? homePeople() : Promise.resolve(null)]);
  const faces = (people ?? []).map((p) => ({ personId: p.personId, name: p.name, firstName: p.firstName, avatarUrl: p.avatarUrl, tone: toneFor(p.personId) }));
  const { quick, everyone } = kudosRecipients(shuffle(faces), actor.personId);
  const name = monthName(month, current);
  const may = mayProp(access, ["team.culture"]);
  const hrefFor = (m: string) => (m === current ? "/team/kudos" : `/team/kudos?month=${m}`);

  return (
    <div className="th-home th-kd-page">
      <section className="th-card th-kd" aria-labelledby="th-kd-h">
        <div className="th-kd-top">
          <KudosHand />
          <div className="th-eyebrow">Kudos · thank a teammate</div>
          <h1 id="th-kd-h">{name} kudos</h1>
          <div className="th-kd-months" role="navigation" aria-label="Months">
            <Link href={hrefFor(prev)}>← {monthName(prev, current)}</Link>
            {!isCurrent && <Link href={hrefFor(next)}>{monthName(next, current)} →</Link>}
          </div>
        </div>
        <div className="th-kd-b">
          {isCurrent && people && <KudosComposer quick={quick} everyone={everyone} may={may} />}
          {isCurrent && !people && <p className="th-meta">The team list could not be loaded, so kudos cannot be sent just now.</p>}
          {notes === null ? (
            <p className="th-meta">{name}&rsquo;s kudos could not be loaded. Try again in a moment.</p>
          ) : notes.length === 0 ? (
            <p className="th-kd-empty">{isCurrent ? "Nobody has said thanks yet this month. Be the first." : `No kudos were given in ${name}.`}</p>
          ) : (
            <KudosNotes notes={notes} viewerPersonId={actor.personId} currentMonth={current} may={may} />
          )}
        </div>
      </section>
    </div>
  );
}
