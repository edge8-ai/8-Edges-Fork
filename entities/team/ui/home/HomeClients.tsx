// Who we are building for (TH.1.7): the person's clients as colour tiles at the
// foot of Home, each with what is happening now and next on its roadmap.
//
// Each tile takes the next colour of the client palette in the list's own
// (alphabetical) order, so neighbours never share one and a client keeps its
// colour while its list does not change. The sticker is chosen from the
// company's own industry line, so the icon says something true about the
// client; a company whose record says nothing gets its initials instead of a
// guess.
import Link from "next/link";
import type { ClientRoadmapSnippet } from "@/entities/team/lib/hub-clients";

type Icon = { test: RegExp; path: string };

// The first match wins, so the narrower words come first.
const ICONS: Icon[] = [
  { test: /bedding|sleep|mattress|furniture/i, path: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" },
  { test: /payroll|accounting|finance|tax|bank/i, path: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3" },
  { test: /gaming|esports|entertainment|media|music|film/i, path: "M7 9h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L14 14h-4l-1.6 1.8A3 3 0 0 1 3 14v-1a4 4 0 0 1 4-4z M8 11v3 M6.5 12.5h3" },
  { test: /wellness|health|medical|care|fitness/i, path: "M5 19c0-8 6-14 14-14 0 8-6 14-14 14z M5 19l8-8" },
  { test: /outsourcing|bpo|talent|staffing|recruit|people/i, path: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M16 11a3 3 0 1 0 0-6 M21 20c0-2.8-1.9-5.2-4.5-5.8" },
  { test: /retail|footwear|fashion|store|shop|e-?commerce|consumer/i, path: "M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2" },
];

function iconFor(industry: string | null | undefined): string | null {
  if (!industry) return null;
  return ICONS.find((i) => i.test.test(industry))?.path ?? null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const PRIORITY_WORD: Record<string, string> = { now: "Now", next: "Next", later: "Later" };

export function HomeClients({ snippets, clientsHref }: { snippets: ClientRoadmapSnippet[]; clientsHref: string }) {
  if (snippets.length === 0) return null;
  return (
    <div>
      <div className="th-cl-head">
        <div>
          <div className="th-eyebrow">Your clients</div>
          <h2>Who we&rsquo;re building for</h2>
        </div>
        <Link href={clientsHref}>All clients →</Link>
      </div>
      <div className="th-cl-grid">
        {snippets.map((s, i) => {
          const icon = iconFor(s.company.industry);
          return (
            <Link key={s.company.id} href={`${clientsHref}/${s.company.id}`} className={`th-cl tone-${i % 8}`}>
              <span className="th-sticker" aria-hidden="true">
                {icon ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={icon} />
                  </svg>
                ) : (
                  initials(s.company.name)
                )}
              </span>
              <h3>{s.company.name}</h3>
              <span className="th-cl-count">{s.total} on the roadmap</span>
              <div className="th-items">
                {s.items.slice(0, 2).map((it) => (
                  <div key={it.id} className="th-it">
                    <span className={`th-dot is-${it.priority}`} />
                    <span className="th-it-tag">{PRIORITY_WORD[it.priority] ?? it.priority}</span>
                    <span>
                      {it.ref ? `${it.ref} · ` : ""}
                      {it.title}
                    </span>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
