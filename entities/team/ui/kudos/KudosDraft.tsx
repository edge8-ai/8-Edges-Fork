"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { KUDOS_STARTERS } from "@/entities/team/lib/kudos-rules";

// The Kudos page's draft (TH.21). The starters sit on the wall and the
// composer sits in the rail, so the words being written live here, above
// both: picking a starter puts its opening words in the composer and asks the
// composer to take the focus. The Home card has no provider, and its composer
// keeps its own words.

type Draft = {
  text: string;
  setText: (text: string) => void;
  focusAsk: number;
  start: (line: string) => void;
};

const KudosDraftContext = createContext<Draft | null>(null);

export function KudosDraftProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const [focusAsk, setFocusAsk] = useState(0);
  const start = (line: string) => {
    setText(line);
    setFocusAsk((n) => n + 1);
  };
  return <KudosDraftContext.Provider value={{ text, setText, focusAsk, start }}>{children}</KudosDraftContext.Provider>;
}

/** The page's shared draft, or null outside the Kudos page. */
export function useKudosDraft(): Draft | null {
  return useContext(KudosDraftContext);
}

/**
 * The first `count` starters, after the month's notes. A starter reads as
 * picked while the draft still opens with its words, so sending or rewording
 * the note lets it go without any state of its own.
 */
export function KudosStarters({ count }: { count: number }) {
  const draft = useKudosDraft();
  if (!draft || count <= 0) return null;
  return (
    <ul className="kd-sparks" aria-label="Not sure who to thank?">
      {KUDOS_STARTERS.slice(0, count).map((s) => (
        <li key={s.question} className={`kd-spark tone-${s.tone}`}>
          <button type="button" className="kd-spark-b" aria-pressed={draft.text.startsWith(s.line)} onClick={() => draft.start(s.line)}>
            <span className="kd-spark-k">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
              </svg>
              Start a thank-you
            </span>
            <span className="kd-spark-q">{s.question}</span>
            <span className="kd-spark-line">&ldquo;{s.line.trim()} &hellip;&rdquo;</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
