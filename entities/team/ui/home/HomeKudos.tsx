// Kudos on the team Home (TH.1.8, approved on the TH.1 canvas 2026-10-09): the
// right third of the foot of the page, beside the clients. Thank a teammate in
// one line; the month's newest thanks sit underneath, and the whole month and
// last month's keepsake are a click away. The team used a Lark "Kudos" channel
// for this before; this brings it home.
import Link from "next/link";
import type { KudosNote } from "@/entities/team/lib/kudos";
import { KudosComposer, type KudosFace } from "@/entities/team/ui/kudos/KudosComposer";
import { KudosNotes } from "@/entities/team/ui/kudos/KudosNotes";
import type { MayProp } from "@/kernel/identity/may-prop";

/** How many of the month's notes the Home card shows; the rest are on the month's page. */
const ON_HOME = 3;

export function KudosHand() {
  return (
    <svg className="th-kd-hand" viewBox="0 0 48 52" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 30V12a3 3 0 0 1 6 0v14" />
      <path d="M22 24V8a3 3 0 0 1 6 0v16" />
      <path d="M28 24V10a3 3 0 0 1 6 0v16" />
      <path d="M34 22v-6a3 3 0 0 1 6 0v14c0 9-6 16-15 16h-2c-6 0-9-3-12-8l-6-10a3 3 0 0 1 5-3l6 6" />
      <path d="M6 8l3 3M4 16h4M10 3l1 4" />
    </svg>
  );
}

export function HomeKudos({
  month,
  currentMonth,
  prevMonth,
  kudosHref,
  notes,
  viewerPersonId,
  quick,
  everyone,
  may,
}: {
  month: string;
  currentMonth: string;
  prevMonth: { label: string; href: string };
  kudosHref: string;
  notes: KudosNote[] | null;
  viewerPersonId: string;
  quick: KudosFace[];
  everyone: KudosFace[];
  may: MayProp;
}) {
  return (
    <section className="th-card th-kd" aria-labelledby="th-kd-h">
      <div className="th-kd-top">
        <KudosHand />
        <div className="th-eyebrow">Kudos · thank a teammate</div>
        <h2 id="th-kd-h">{month} kudos</h2>
        <Link href={prevMonth.href}>{prevMonth.label} kudos →</Link>
      </div>
      <div className="th-kd-b">
        {everyone.length > 0 ? (
          <KudosComposer quick={quick} everyone={everyone} may={may} />
        ) : (
          <p className="th-meta">The team list could not be loaded, so kudos cannot be sent just now.</p>
        )}
        {notes === null ? (
          <p className="th-meta">This month&rsquo;s kudos could not be loaded. Yours still sends.</p>
        ) : notes.length === 0 ? (
          <p className="th-kd-empty">Nobody has said thanks yet this month. Be the first.</p>
        ) : (
          <>
            <KudosNotes notes={notes.slice(0, ON_HOME)} viewerPersonId={viewerPersonId} currentMonth={currentMonth} may={may} />
            {notes.length > ON_HOME && (
              <Link className="th-kd-all" href={kudosHref}>
                See all of {month} →
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}
