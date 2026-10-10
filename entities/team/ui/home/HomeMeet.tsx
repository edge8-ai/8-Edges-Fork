"use client";
// Meet someone (TH.1.2): a random few teammates, one of them in the spotlight,
// and a dice that deals a new hand. "So everyone knows everyone" (Khoa,
// 2026-10-09): the whole company, shuffled on every visit by the server and on
// every roll here, never ranked, never by tenure or alphabet.
import Link from "next/link";
import { useState } from "react";
import { HomeFace } from "./HomeFace";

export type MeetPerson = {
  id: string;
  name: string;
  firstName: string;
  avatarUrl: string | null;
  tone: number;
  line: string;
  isNew: boolean;
};

/** How many faces the strip deals; narrower screens show seven, then six. */
const HAND = 8;

function shuffled<T>(xs: readonly T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function HomeMeet({ people, directoryHref }: { people: MeetPerson[]; directoryHref: string | null }) {
  const [order, setOrder] = useState(people);
  const [spot, setSpot] = useState(people[0]?.id ?? null);
  const [rolls, setRolls] = useState(0);
  if (people.length === 0) return null;

  const hand = order.slice(0, HAND);
  const who = order.find((p) => p.id === spot) ?? hand[0];
  const rolled = rolls ? ` is-rolled-${rolls % 2}` : "";
  const roll = () => {
    const next = shuffled(people);
    setOrder(next);
    setSpot(next[0].id);
    setRolls((r) => r + 1);
  };

  return (
    <section className="th-card th-meet" aria-label="Meet someone">
      <button type="button" className={`th-dice${rolled}`} onClick={roll} aria-label="Roll the dice and meet someone else">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="16" cy="8" r="1.4" fill="currentColor" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          <circle cx="8" cy="16" r="1.4" fill="currentColor" />
          <circle cx="16" cy="16" r="1.4" fill="currentColor" />
        </svg>
      </button>
      <div className="th-who" aria-live="polite">
        <HomeFace key={`${who.id}-${rolls}`} className={`th-who-face${rolled}`} name={who.name} avatarUrl={who.avatarUrl} tone={who.tone} />
        <div className="th-who-text">
          <div className="th-eyebrow">Meet someone</div>
          <h3>Say hi to {who.firstName}!</h3>
          <div className="th-who-meta">
            {who.isNew && <span className="th-new">New</span>}
            <span>{who.line}</span>
            {directoryHref && <Link href={`${directoryHref}/${who.id}`}>Profile →</Link>}
          </div>
        </div>
      </div>
      <div className="th-strip">
        <div className="th-few">
          {hand.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`th-mf tilt-${i % 6}${p.id === who.id ? " is-spot" : ""}`}
              title={p.name}
              aria-label={`Meet ${p.name}`}
              aria-pressed={p.id === who.id}
              onClick={() => setSpot(p.id)}
            >
              <HomeFace name={p.name} avatarUrl={p.avatarUrl} tone={p.tone} />
            </button>
          ))}
        </div>
        {directoryHref && (
          <Link className="th-all" href={directoryHref}>
            See all {people.length}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        )}
      </div>
    </section>
  );
}
