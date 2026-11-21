// The personal read on My Training (TR.10, the canvas approved on 2026-11-04):
// an envelope only the member can open. Quiet until five reviews, sealed after
// that, and written when they press the button, so nothing is spent on a page
// view. The read is never stored: the address asks for it, the page writes it
// while the rest of the page stays, and closing goes back to the plain address.
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { MyRead } from "../lib/personal-read";
import { READ_WAKES_AT, readState } from "../lib/personal-read-rules";
import { StoryText } from "./ProgrammeStory";

const CLOSED = "/team/my-training/";
const OPEN = "/team/my-training/?read=open";

function Envelope({ state }: { state: "quiet" | "sealed" | "writing" | "open" }) {
  return (
    <svg className={`tr-yr-env is-${state}`} viewBox="0 0 76 60" aria-hidden="true">
      <rect className="tr-yr-sheet" x="14" y="16" width="48" height="34" rx="3" />
      <rect className="tr-yr-body" x="4" y="18" width="68" height="40" rx="6" />
      <path className="tr-yr-fold" d="M4 56l26-20M72 56L46 36" />
      <path className="tr-yr-flap" d="M5 19h66L41 41a5 5 0 0 1-6 0z" />
    </svg>
  );
}

function Card({ envelope, title, sub, action, children }: { envelope: "quiet" | "sealed" | "writing" | "open"; title: string; sub: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className="tr-yr" aria-labelledby="tr-yr-h">
      <div className="tr-yr-row">
        <Envelope state={envelope} />
        <div className="tr-yr-text">
          <h2 className="tr-yr-title" id="tr-yr-h">
            {title}
          </h2>
          {sub}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// prefetch is off on both links: a prefetched open would spend a model call on a
// read nobody asked for, and scroll is off so the card stays where the member is.
function OpenLink({ label }: { label: string }) {
  return (
    <Link className="tr-yr-btn" href={OPEN} prefetch={false} scroll={false}>
      {label}
    </Link>
  );
}

function Quiet({ reviews }: { reviews: number }) {
  const line =
    reviews === 0
      ? "No reviews yet. Cool-down asks for one after each training, and only you will see what comes of them."
      : `${reviews} of ${READ_WAKES_AT} so far. ${READ_WAKES_AT - reviews} more and it has enough to say something true. Only you will see it.`;
  return (
    <Card
      envelope="quiet"
      title="Your read wakes up at five reviews"
      sub={
        <>
          <p className="tr-yr-sub">{line}</p>
          <div className="tr-yr-pips" role="img" aria-label={`${reviews} of ${READ_WAKES_AT} reviews`}>
            {Array.from({ length: READ_WAKES_AT }, (_, i) => (
              <span key={i} className={i < reviews ? "tr-yr-pip is-on" : "tr-yr-pip"} />
            ))}
          </div>
        </>
      }
    />
  );
}

function Writing() {
  return (
    <Card envelope="writing" title="Writing your read" sub={<p className="tr-yr-sub">Going through your trainings. It takes a few seconds.</p>}>
      <div className="tr-yr-skel" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
    </Card>
  );
}

async function Opened({ write }: { write: () => Promise<MyRead> }) {
  const out = await write();
  if (!out.ok) {
    return <Card envelope="sealed" title="Your read did not come through" sub={<p className="tr-yr-sub">Nothing was saved or sent anywhere. Try again in a moment.</p>} action={<OpenLink label="Try again" />} />;
  }
  return (
    <Card envelope="open" title="Your read" sub={<p className="tr-yr-sub">Written just now, for you.</p>}>
      <div className="tr-yr-letter">
        <p className="tr-yr-head">
          <StoryText body={out.read.headline} />
        </p>
        <ul className="tr-yr-list">
          {out.read.noticed.map((n) => (
            <li key={n}>
              <StoryText body={n} />
            </li>
          ))}
        </ul>
        {out.read.worthTrying && (
          <p className="tr-yr-try">
            <span>Worth trying:</span> <StoryText body={out.read.worthTrying} />
          </p>
        )}
        <p className="tr-yr-used">{out.used}</p>
      </div>
      <div className="tr-yr-foot">
        <span className="tr-yr-only">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          Only you see this. Close it and it is gone.
        </span>
        <Link className="tr-yr-close" href={CLOSED} prefetch={false} scroll={false}>
          Close
        </Link>
      </div>
    </Card>
  );
}

export function PersonalRead({ reviews, asked, hasWork, write }: { reviews: number; asked: boolean; hasWork: boolean; write: () => Promise<MyRead> }) {
  const state = readState(reviews, asked);
  if (state === "quiet") return <Quiet reviews={reviews} />;
  if (state === "open") {
    return (
      <Suspense fallback={<Writing />}>
        <Opened write={write} />
      </Suspense>
    );
  }
  const what = hasWork ? "What your trainings, reviews and outcomes say, set beside the work you finished." : "What your trainings, reviews and outcomes say.";
  return <Card envelope="sealed" title="A read written for you" sub={<p className="tr-yr-sub">{what} Written when you open it, never saved, and only you see it.</p>} action={<OpenLink label="Open my read" />} />;
}
