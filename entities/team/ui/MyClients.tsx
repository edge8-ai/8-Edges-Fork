import Link from "next/link";
import type { ClientDigest } from "@/entities/team/lib/client-digest";
import { clientTone, matchesShow, metPhrase, waitingHeadline, type ShowFilter } from "@/entities/team/lib/my-clients-view";
import { dayLabel } from "@/entities/boards";
import { isoWeekKey } from "@/kernel/config/dates";
import { initials } from "@/kernel/ui/format";
import { BASE_PATH, MyClientCard } from "./MyClientCard";
import styles from "./my-clients.module.css";

// The My Clients page body (X.3), in My Week's language: a sentence naming
// the clients that owe us something, a strip of statuses that filter the list
// (?show=, so a filtered view is a link), a card per client with something
// going on, and the quiet clients as one row each, never hidden. The order is
// the loader's (client-digest.ts): waiting first, then active, then quiet.

const STATUSES: Array<{ show: ShowFilter | null; label: string; unit: string }> = [
  { show: null, label: "All clients", unit: "assigned" },
  { show: "waiting", label: "Waiting on them", unit: "clients" },
  { show: "now", label: "Building now", unit: "clients" },
  { show: "shipped", label: "Shipped this week", unit: "clients" },
  { show: "quiet", label: "Quiet", unit: "clients" },
];

// What a quiet client still has on the table, in one phrase. A quiet client
// has nothing set to Now by definition, so open cards are all there is to name.
function quietSummary(d: ClientDigest): string {
  if (d.openCards > 0) return `${d.openCards} open ${d.openCards === 1 ? "card" : "cards"}, none moved this week`;
  return "Nothing set to Now, no open cards";
}

function StatusStrip({ digests, show }: { digests: ClientDigest[]; show: ShowFilter | null }) {
  return (
    // A div, not a nav: the site's global stylesheet fixes every bare <nav> to
    // the top of the window, shell pages included.
    <div className={styles.strip} role="group" aria-label="Show clients by status">
      {STATUSES.map((s) => {
        const on = s.show === show;
        const n = digests.filter((d) => matchesShow(d, s.show)).length;
        // Pressing the status already shown goes back to every client.
        const href = s.show && !on ? `${BASE_PATH}?show=${s.show}` : BASE_PATH;
        return (
          <Link
            key={s.label}
            href={href}
            className={`${styles.cell} ${styles[`cell_${s.show ?? "all"}`]}${n > 0 ? ` ${styles.cellAny}` : ""}${on ? ` ${styles.cellOn}` : ""}`}
            aria-current={on ? "true" : undefined}
          >
            <span className={styles.cellLabel}>{s.label}</span>
            <span className={styles.cellFigure}>
              <span className={styles.cellN}>{n}</span>
              <span className={styles.cellUnit}>{s.unit}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function MyClients({ digests, show, today }: { digests: ClientDigest[]; show: ShowFilter | null; today: string }) {
  const head = (
    <header className={styles.pageHead}>
      <p className="admin-eyebrow u-m-0">
        My Clients · {isoWeekKey(today).slice(5)} · {dayLabel(today)}
      </p>
      <h1 className={styles.headline}>
        {digests.length === 0 ? "My Clients" : waitingHeadline(digests.filter((d) => d.waiting.total > 0).map((d) => d.name))}
      </h1>
      <p className={styles.headSub}>
        What&apos;s being built for each of your clients, what&apos;s waiting on them and what shipped this week.
        Clients with something waiting come first; quiet ones sit at the bottom.
      </p>
    </header>
  );

  if (digests.length === 0) {
    return (
      <>
        {head}
        <div className="admin-card admin-section-card">
          <p className="admin-page-sub u-m-0">
            You&apos;re not assigned to any clients yet. When you&apos;re assigned to a client
            account, it shows up here with what&apos;s being built for them.
          </p>
        </div>
      </>
    );
  }

  const active = digests.filter((d) => !d.quiet && matchesShow(d, show));
  const quiet = show === null || show === "quiet" ? digests.filter((d) => d.quiet) : [];
  return (
    <>
      {head}
      <StatusStrip digests={digests} show={show} />

      {active.length > 0 && (
        <div className={styles.list}>
          {active.map((d) => (
            <MyClientCard key={d.id} d={d} today={today} />
          ))}
        </div>
      )}

      {quiet.length > 0 && (
        <section className={styles.quietBlock} aria-labelledby="my-clients-quiet">
          <div>
            <h2 id="my-clients-quiet" className={styles.quietHead}>
              Quiet lately
            </h2>
            <p className={styles.quietSub}>Nothing waiting on them, nothing shipped this week and nothing set to Now.</p>
          </div>
          <div className={styles.quiet}>
            {quiet.map((d) => {
              const met = metPhrase(d.lastMeeting?.date ?? null, today);
              return (
                <Link key={d.id} href={`${BASE_PATH}/${d.id}`} className={styles.quietRow}>
                  <span className={`${styles.mono} ${styles.monoSmall} ${styles[`tone${clientTone(d.id)}`]}`} aria-hidden="true">
                    {initials(d.name)}
                  </span>
                  <span className={styles.quietName}>{d.name}</span>
                  <span className={styles.quietWhat}>{quietSummary(d)}</span>
                  <span className={`${styles.quietMet}${met.stale ? ` ${styles.metStale}` : ""}`}>{met.text}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
