"use client";
// The Edge8 story (TH.1.1): the gallery as the top of Home, the greeting laid
// over it. The server decides the order (the newest two photos first, then the
// rest shuffled on every visit), so this island only plays it: a crossfade
// with a slow drift behind the photo, story bars, back / pause / next. Each
// photo is shown whole, never cropped.
//
// Someone who asks for reduced motion gets a still photo and the controls: the
// story never moves on its own for them, and the bars show where they are.
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type StorySlide = { id: string; src: string; caption: string; meta: string | null };

const SLIDE_MS = 7000;
const REDUCE = "(prefers-reduced-motion: reduce)";

// The reader's motion setting, as the browser reports it and as it changes.
// The server cannot know it, so it assumes motion is fine; the client corrects
// that on hydration without an effect.
function subscribeReduce(onChange: () => void) {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const reducedNow = () => window.matchMedia(REDUCE).matches;
const reducedOnServer = () => false;

export function HomeStory({
  slides,
  dateLine,
  greeting,
  sub,
  galleryHref,
}: {
  slides: StorySlide[];
  dateLine: string;
  greeting: string;
  sub: string;
  galleryHref: string | null;
}) {
  const [at, setAt] = useState(0);
  // The person's own choice wins; until they make one, reduced motion decides.
  const [choice, setChoice] = useState<boolean | null>(null);
  const reduced = useSyncExternalStore(subscribeReduce, reducedNow, reducedOnServer);
  const playing = choice ?? !reduced;
  const timer = useRef<number | null>(null);
  const count = slides.length;

  useEffect(() => {
    if (!playing || count < 2) return;
    timer.current = window.setTimeout(() => setAt((i) => (i + 1) % count), SLIDE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [at, playing, count]);

  if (count === 0) {
    return (
      <section className="th-story th-story-empty" aria-label="Welcome">
        <div>
          <div className="th-eyebrow">{dateLine}</div>
          <h1>{greeting}</h1>
          <p className="th-story-sub">{sub}</p>
        </div>
      </section>
    );
  }

  const slide = slides[at];
  const go = (step: number) => setAt((i) => (i + step + count) % count);

  return (
    <section className={`th-story${playing ? "" : " is-paused"}`} aria-roledescription="carousel" aria-label="The Edge8 story">
      {slides.map((s, i) => (
        <div key={s.id} className={`th-slide${i === at ? " is-on" : ""}`} aria-hidden={i !== at}>
          {/* The same file twice: a blurred copy fills the banner and the photo
              sits whole in front of it, so nothing is cropped. One download. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- gallery uploads of unknown size; next/image needs fixed dimensions */}
          <img className="th-slide-bg" src={s.src} alt="" aria-hidden="true" loading={i < 2 ? "eager" : "lazy"} decoding="async" />
          {/* eslint-disable-next-line @next/next/no-img-element -- gallery uploads of unknown size; next/image needs fixed dimensions */}
          <img className="th-slide-fg" src={s.src} alt={s.caption} loading={i < 2 ? "eager" : "lazy"} decoding="async" />
        </div>
      ))}
      <div className="th-story-scrim" />
      <div className="th-story-bars" aria-hidden="true">
        {slides.map((s, i) => (
          <span key={s.id} className={`th-story-bar${i < at ? " is-done" : i === at ? " is-run" : ""}`}>
            <i key={i === at ? `run-${at}` : "idle"} />
          </span>
        ))}
      </div>
      <div className="th-story-top">
        <span>The Edge8 story</span>
        {galleryHref && <Link href={galleryHref}>Add a photo</Link>}
      </div>
      <div className="th-story-text">
        <div className="th-eyebrow">{dateLine}</div>
        <h1>{greeting}</h1>
        <p className="th-story-sub">{sub}</p>
        <span className="th-story-cap" aria-live="polite">
          <b>
            {at + 1} / {count}
          </b>
          <span>
            {slide.caption}
            {slide.meta ? ` · ${slide.meta}` : ""}
          </span>
        </span>
      </div>
      {count > 1 && (
        <div className="th-story-ctrls">
          <button type="button" className="th-round" onClick={() => go(-1)} aria-label="Previous photo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button type="button" className="th-round" onClick={() => setChoice(!playing)} aria-label={playing ? "Pause the story" : "Play the story"}>
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>
            )}
          </button>
          <button type="button" className="th-round" onClick={() => go(1)} aria-label="Next photo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </section>
  );
}
