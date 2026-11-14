import Link from "next/link";
import { formatDate } from "@/kernel/ui/format";
import type { TeamClientReview } from "@/entities/org/lib/client-reviews/team-view";

// A client review on the team side (CR.3.3), drawn as the CR.3.1 prototype was
// approved: where it stands, the two averages, each rated question as two dots
// on one track, the owner's summary and the client manager's words. The
// reader has already dropped what this viewer may not see, so the page draws
// what it is given and decides nothing about who sees what.

type Props = { review: TeamClientReview };

const average = (n: number | null) => (n === null ? "—" : n.toFixed(2));

/** "You" for the member, their name for anyone else. */
function wordsFor(review: TeamClientReview) {
  const own = review.view.viewer === "member";
  const cm = review.clientManagerName ?? "The client manager";
  return {
    own,
    cm,
    you: own ? "You" : review.memberName,
    yours: own ? "Your own average" : `${review.memberName}'s own average`,
    sentYours: own ? "You sent yours" : `${review.memberName} sent theirs`,
    shared: own ? "Shared with you" : `Shared with ${review.memberName}`,
  };
}

const times = (n: number) => (n === 1 ? "once" : `${n} times`);

/** Where the two parts differ, naming only the directions that happened. */
function differ(a: { higherByClient: number; lowerByClient: number }, cm: string, them: string, subject: string): string {
  const said = [a.higherByClient > 0 ? `higher ${times(a.higherByClient)}` : null, a.lowerByClient > 0 ? `lower ${times(a.lowerByClient)}` : null].filter(Boolean);
  return said.length ? ` Where ${subject} differ, ${cm} rated ${them} ${said.join(" and ")}.` : "";
}

export function ClientReview({ review }: Props) {
  const { view } = review;
  const w = wordsFor(review);
  const levels = view.levels.map((l) => l.value);
  const levelWord = new Map(view.levels.map((l) => [l.value, l.label]));
  const steps: { label: string; at: string | null; hidden?: boolean }[] = [
    { label: "Opened", at: view.dates.openedAt },
    { label: w.sentYours, at: view.dates.memberSentAt },
    // Before release the member is not told whether the client manager has
    // sent: the rules hold that part back, its date included.
    { label: `${w.cm} sent their part`, at: view.dates.clientManagerSentAt, hidden: w.own && !view.released },
    { label: w.shared, at: view.dates.releasedAt },
  ];
  const nowAt = steps.findIndex((s) => !s.at);
  const head = w.own
    ? view.released
      ? `Your ${review.cycleName} review is here`
      : `Your ${review.cycleName} review: your part is sent`
    : `${review.memberName}'s ${review.cycleName} review`;
  const sub = view.released
    ? w.own
      ? `${w.cm}'s ratings sit beside your own${view.summary ? ", with the summary" : ""}.${review.managerName ? ` Read it before your next 1-1 with ${review.managerName}.` : ""}`
      : `Shared with ${review.memberName} on ${formatDate(view.dates.releasedAt!)}.`
    : w.own
      ? `${w.cm}'s ratings and the summary reach you when the review is shared with you. Until then you read your own answers here.`
      : `Not shared with ${review.memberName} yet. You read it as one of the people running reviews.`;
  const agreement = view.agreement;

  return (
    <div className="rv-page">
      <div className="rv">
        <section className="rv-hero" aria-labelledby="cr-head">
          <p className="rv-k">
            <Link href="/team/reviews">Reviews</Link>
            {review.clientName ? ` · ${review.clientName}` : ""}
          </p>
          <h1 className="rv-head" id="cr-head">{head}</h1>
          <p className="rv-sub">{sub}</p>
          <ul className="rv-chips">
            <li><a className="rv-chip" href="#cr-side">Side by side <b>{view.rated.length}</b></a></li>
            {view.summary && <li><a className="rv-chip" href="#cr-summary">The summary</a></li>}
            {view.words.length > 0 && <li><a className="rv-chip" href="#cr-words">In words</a></li>}
          </ul>
        </section>

        <div className="rv-grid">
          <div className="rv-col">
            <section className="rv-card rv-sec" id="cr-side" aria-labelledby="cr-side-h">
              <div className="rv-sec-head">
                <div>
                  <p className="rv-sec-k">Side by side</p>
                  <h2 className="rv-sec-h" id="cr-side-h">{view.agreement ? `How ${w.own ? "you" : review.memberName} and ${w.cm} saw it` : w.own ? "Your own answers" : `${review.memberName}'s answers`}</h2>
                </div>
                {view.released && <span className="rv-pill">Released {formatDate(view.dates.releasedAt!)}</span>}
              </div>
              <ol className="rv-steps rv-steps-flush" aria-label="Where this review is">
                {steps.map((s, i) => (
                  <li key={s.label} className={`rv-step ${s.at ? "is-done" : i === nowAt ? "is-now" : "is-next"}`}>
                    <span className="rv-dot" aria-hidden="true" />
                    <span className="rv-step-l">{s.label}</span>
                    <span className="rv-step-s">{s.at ? formatDate(s.at) : s.hidden ? "You see it when the review is shared" : "Not yet"}</span>
                  </li>
                ))}
              </ol>
              <div className="cr-figures">
                <div className="cr-figure">
                  <p className="rv-sec-k">{w.yours}</p>
                  <p className="cr-figure-n">{average(view.selfAverage)}</p>
                </div>
                {view.clientManagerAverage !== null && (
                  <div className="cr-figure cr-figure-cm">
                    <p className="rv-sec-k">{w.cm}&apos;s average</p>
                    <p className="cr-figure-n">{average(view.clientManagerAverage)}</p>
                  </div>
                )}
                {agreement && (
                  <div className="cr-figure cr-figure-note">
                    <p>
                      <b>{w.own ? "You agree" : "They agree"} on {agreement.same} of {agreement.of}.</b>
                      {differ(agreement, w.cm, w.own ? "you" : review.memberName, w.own ? "you" : "they")}
                    </p>
                  </div>
                )}
              </div>
              <div className="cr-legend" aria-hidden="true">
                <span className="cr-key cr-key-self">{w.you}</span>
                {view.clientManagerAverage !== null && <span className="cr-key cr-key-cm">{w.cm}</span>}
                <span className="cr-key-scale">{view.levels.map((l) => `${l.value} ${l.label}`).join(" · ")}</span>
              </div>
              <ul className="cr-rows">
                {view.rated.map((r) => {
                  const self = r.member?.rating ?? null;
                  const cm = r.clientManager?.rating ?? null;
                  const said = (n: number | null) => (n === null ? "not rated" : `${n}, ${levelWord.get(n) ?? ""}`.replace(/, $/, ""));
                  const diff = self !== null && cm !== null ? (cm === self ? `${w.own ? "You agree" : "They agree"}` : cm > self ? `${w.cm}: ${cm - self} step${cm - self === 1 ? "" : "s"} higher` : `${w.cm}: ${self - cm} step${self - cm === 1 ? "" : "s"} lower`) : null;
                  return (
                    <li key={r.key} className="cr-row">
                      <div>
                        <p className="cr-row-t">{r.title}</p>
                        {diff && <p className="cr-row-diff">{diff}</p>}
                      </div>
                      <ol className="cr-track" aria-label={`${w.you}: ${said(self)}.${r.clientManager ? ` ${w.cm}: ${said(cm)}.` : ""}`}>
                        {levels.map((v) => (
                          <li key={v} className={`cr-dot${v === self && v === cm ? " is-both" : v === cm ? " is-cm" : v === self ? " is-self" : ""}`} />
                        ))}
                      </ol>
                      <div className="cr-row-words">
                        {r.clientManager?.text && <p><b className="cr-cm-name">{w.cm}:</b> {r.clientManager.text}</p>}
                        {r.member?.text && <p className="cr-self-words"><b>{w.you}:</b> {r.member.text}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {view.summary && (
              <section className="rv-card rv-sec cr-sec-pad" id="cr-summary" aria-labelledby="cr-summary-h">
                <div className="rv-sec-head">
                  <div>
                    <p className="rv-sec-k">What Edge8 took from it</p>
                    <h2 className="rv-sec-h" id="cr-summary-h">{review.releasedByName ? `${review.releasedByName}'s summary` : "The summary"}</h2>
                  </div>
                </div>
                <p className="cr-summary u-prewrap">{view.summary}</p>
                {review.releasedByName && <p className="rv-due">{review.releasedByName} · {formatDate(view.dates.releasedAt!)}</p>}
              </section>
            )}

            {view.words.length > 0 && (
              <section className="rv-card rv-sec cr-sec-pad" id="cr-words" aria-labelledby="cr-words-h">
                <div className="rv-sec-head">
                  <div>
                    <p className="rv-sec-k">{view.clientManagerAverage !== null || view.words.some((r) => r.clientManager) ? `In ${w.cm}'s words, and ${w.own ? "yours" : `${review.memberName}'s`}` : w.own ? "In your own words" : `In ${review.memberName}'s words`}</p>
                    <h2 className="rv-sec-h" id="cr-words-h">Values, strengths and what&apos;s next</h2>
                  </div>
                </div>
                <div className="cr-words">
                  {view.words.map((r) => (
                    <div key={r.key} className="cr-word">
                      <p className="rv-sec-k">{r.title}</p>
                      {r.clientManager && (r.clientManager.choice || r.clientManager.text) && (
                        <p><b className="cr-cm-name">{w.cm}:</b> {[r.clientManager.choice, r.clientManager.text].filter(Boolean).join(". ")}</p>
                      )}
                      {r.member && (r.member.choice || r.member.text) && (
                        <p className="cr-self-words"><b>{w.you}:</b> {[r.member.choice, r.member.text].filter(Boolean).join(". ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>

          <aside className="rv-rail" aria-label="About this review">
            {w.own && view.released && review.managerName && (
              <section className="rv-card">
                <p className="rv-sec-k">Next</p>
                <div className="rv-next">
                  <div className="rv-next-cal" aria-hidden="true"><small>Your</small><span>1-1</span></div>
                  <p><b>Talk it through with {review.managerName}</b>, your manager. They can read this review too.</p>
                </div>
              </section>
            )}
            <section className="rv-card">
              <p className="rv-sec-k">Who can read it</p>
              <ol className="rv-how">
                <li><div><b>{w.own ? "You" : review.memberName}</b><span>{view.released ? "Both parts, both averages and the summary." : w.own ? "Your own part, until the review is shared with you." : "Their own part, until the review is shared."}</span></div></li>
                <li><div><b>{review.managerName ? `${review.managerName}, ${w.own ? "your" : "their"} manager` : w.own ? "Your manager" : "Their manager"}, and {w.own ? "your" : "their"} coach</b><span>{view.released ? "The same, from the day it was shared." : "Nothing until it is shared."}</span></div></li>
                <li><div><b>The people running reviews</b><span>Everything, as with other reviews.</span></div></li>
              </ol>
              <p className="rv-scale">{w.cm} reads both parts through their own link until the cycle closes{view.hasSkipManager ? ", and so does the client\u2019s skip-manager" : ""}. Nobody at the client sees the averages or the summary.</p>
            </section>
            {review.scale && (
              <section className="rv-card">
                <p className="rv-sec-k">The scale</p>
                <p className="cr-scale u-prewrap">{review.scale}</p>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
