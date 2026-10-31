"use client";

import { useState } from "react";
import type { ReviewsHome as Home } from "@/entities/team/lib/reviews/home";
import { ReviewCard, ReviewHistoryList } from "./ReviewCard";

// /team/reviews in the team language (TH.14, canvas approved 2026-10-19). The
// hero says what is the reader's to write and what comes first; the chips
// narrow the page to one part; each review shows the path it walks. To finalize
// appears only for someone who reviews others, so nobody meets an empty section
// about reports they do not have.

type Part = "all" | "write" | "finalize" | "mine";

function Art() {
  return (
    <svg className="rv-hero-art" viewBox="0 0 250 140" fill="none" aria-hidden="true" focusable="false">
      <path className="rv-art-far" d="M118 22h96a14 14 0 0 1 14 14v40a14 14 0 0 1-14 14h-58l-22 18v-18h-16a14 14 0 0 1-14-14V36a14 14 0 0 1 14-14z" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />
      <path className="rv-art-near" d="M44 58h82a12 12 0 0 1 12 12v34a12 12 0 0 1-12 12H80l-18 14v-14H44a12 12 0 0 1-12-12V70a12 12 0 0 1 12-12z" strokeWidth="2" />
      <path className="rv-art-lines" d="M50 80h56 M50 94h38" strokeWidth="4" strokeLinecap="round" />
      <circle className="rv-art-dot" cx="150" cy="56" r="3" />
      <circle className="rv-art-dot" cx="166" cy="56" r="3" />
      <circle className="rv-art-dot-soft" cx="182" cy="56" r="3" />
      <circle className="rv-art-spark" cx="236" cy="16" r="4" />
      <circle className="rv-art-dot-soft" cx="20" cy="40" r="3" />
    </svg>
  );
}

export function ReviewsHome({ home }: { home: Home }) {
  const [part, setPart] = useState<Part>("all");
  const nW = home.write.length;
  const nF = home.finalize.length;
  const nM = home.mine.length;
  const chips: { key: Part; label: string; n: number }[] = [
    { key: "all", label: "Everything", n: nW + nF + nM },
    { key: "write", label: "To write", n: nW },
    ...(home.isReviewer ? [{ key: "finalize" as const, label: "To finalize", n: nF }] : []),
    { key: "mine", label: "About you", n: nM },
  ];
  const shows = (p: Part) => part === "all" || part === p;

  return (
    <div className="rv">
      <section className="rv-hero" aria-labelledby="rv-head">
        <Art />
        <p className="rv-k">Reviews</p>
        <h1 className="rv-head" id="rv-head">
          {home.headline}
        </h1>
        <p className="rv-sub">{home.sub}</p>
        <ul className="rv-chips" aria-label="Show">
          {chips.map((c) => (
            <li key={c.key}>
              <button type="button" className="rv-chip" aria-pressed={part === c.key} onClick={() => setPart(c.key)}>
                {c.label} <b>{c.n}</b>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="rv-grid">
        <div className="rv-col">
          {shows("write") && (
            <section className="rv-card rv-sec" aria-labelledby="rv-write-h">
              <div className="rv-sec-head">
                <div>
                  <p className="rv-sec-k">Waiting on you</p>
                  <h2 className="rv-sec-h" id="rv-write-h">
                    To write
                  </h2>
                </div>
                <span className={nW ? "rv-pill" : "rv-pill rv-pill-calm"}>{nW ? `${nW} open` : "All written"}</span>
              </div>
              {nW === 0 && <p className="rv-empty">Nothing to write. When a review opens on its date, it lands here and in your Inbox.</p>}
              {home.write.map((card) => (
                <ReviewCard key={card.id} card={card} />
              ))}
            </section>
          )}

          {home.isReviewer && (part === "finalize" || (part === "all" && (nF > 0 || home.finalized.length > 0))) && (
            <section className="rv-card rv-sec" aria-labelledby="rv-fin-h">
              <div className="rv-sec-head">
                <div>
                  <p className="rv-sec-k">Waiting on your decision</p>
                  <h2 className="rv-sec-h" id="rv-fin-h">
                    To finalize
                  </h2>
                </div>
                <span className={nF ? "rv-pill" : "rv-pill rv-pill-calm"}>{nF ? `${nF} to decide` : "Nothing to decide"}</span>
              </div>
              {nF === 0 && <p className="rv-empty">Nothing to finalize. A review you submit waits here until you finalize it and decide; the person sees it only then.</p>}
              {home.finalize.map((card) => (
                <ReviewCard key={card.id} card={card} />
              ))}
              {home.finalized.length > 0 && (
                <>
                  <p className="rv-sec-k rv-sub-k">Finalized</p>
                  <ReviewHistoryList rows={home.finalized} />
                </>
              )}
            </section>
          )}

          {shows("mine") && (
            <section className="rv-card rv-sec" aria-labelledby="rv-mine-h">
              <div className="rv-sec-head">
                <div>
                  <p className="rv-sec-k">Said about you</p>
                  <h2 className="rv-sec-h" id="rv-mine-h">
                    Your reviews
                  </h2>
                </div>
              </div>
              {nM === 0 ? (
                <p className="rv-empty">Nothing here yet. When your manager finalizes a review of you, you can read it here, beside your own self-assessment.</p>
              ) : (
                <ReviewHistoryList rows={home.mine} />
              )}
            </section>
          )}
        </div>

        <aside className="rv-rail" aria-label="About reviews">
          {home.next && (
            <section className="rv-card" aria-labelledby="rv-next-h">
              <p className="rv-sec-k" id="rv-next-h">
                Your next review
              </p>
              <div className="rv-next">
                <span className="rv-next-cal" aria-hidden="true">
                  <small>{home.next.month}</small>
                  <span>{home.next.year}</span>
                </span>
                <p>
                  <b>{home.next.type}</b>, {home.next.when}. It opens on its own and lands in your Inbox.
                </p>
              </div>
            </section>
          )}
          <section className="rv-card" aria-labelledby="rv-how-h">
            <p className="rv-sec-k">How it works</p>
            <h2 className="rv-sec-h" id="rv-how-h">
              A review, start to finish
            </h2>
            <ol className="rv-how">
              <li>
                <div>
                  <b>It opens on its date</b>
                  <span>Probation six weeks in, mid-year at five months, renewal at eleven. Everyone it waits on hears in their Inbox.</span>
                </div>
              </li>
              <li>
                <div>
                  <b>Both sides write, apart</b>
                  <span>The self-assessment and the manager’s review are drafted blind; neither reads the other first.</span>
                </div>
              </li>
              <li>
                <div>
                  <b>The manager finalizes and decides</b>
                  <span>Continue, extend or stop; renew, change or end.</span>
                </div>
              </li>
              <li>
                <div>
                  <b>It is shared</b>
                  <span>The person reads the finalized review here, beside their own.</span>
                </div>
              </li>
            </ol>
            <p className="rv-scale">Every review uses the same scale, so a trend across cycles is real.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
