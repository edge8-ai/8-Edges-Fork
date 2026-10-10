"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";

interface Video {
  id: string;
  title: string;
  label?: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function VideoCarousel({ videos }: { videos: Video[] }) {
  // Render the source order on the server and first client paint so hydration
  // matches, then shuffle after mount for variety.
  const [shuffled, setShuffled] = useState<Video[]>(videos);
  const [current, setCurrent] = useState(0);
  // The parent passes a fresh array on every render, so the effect is keyed on
  // the ids (a stable string) and reads the list through a ref; otherwise every
  // parent render would reshuffle and reset the carousel.
  const latestVideos = useRef(videos);
  latestVideos.current = videos;
  const videoIds = videos.map((v) => v.id).join("|");
  useEffect(() => {
    setShuffled(shuffle(latestVideos.current));
    setCurrent(0);
  }, [videoIds]);

  const prev = () => setCurrent((current - 1 + shuffled.length) % shuffled.length);
  const next = () => setCurrent((current + 1) % shuffled.length);

  const prevIdx = (current - 1 + shuffled.length) % shuffled.length;
  const nextIdx = (current + 1) % shuffled.length;

  return (
    <div className="vc-wrap">
      <div className="vc-stage">
        {shuffled.length > 1 && (
          <div className="vc-peek" onClick={prev} role="button" aria-label="Previous video">
            <div className="video-frame--short">
              <Image
                src={`https://img.youtube.com/vi/${shuffled[prevIdx].id}/hqdefault.jpg`}
                alt={shuffled[prevIdx].title}
                width={480}
                height={360}
              />
            </div>
          </div>
        )}

        <div className="vc-active">
          <div className="video-frame--short">
            <iframe
              key={shuffled[current].id}
              src={`https://www.youtube.com/embed/${shuffled[current].id}?autoplay=1&mute=1&loop=1&playlist=${shuffled[current].id}&playsinline=1`}
              title={shuffled[current].title}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        </div>

        {shuffled.length > 1 && (
          <div className="vc-peek" onClick={next} role="button" aria-label="Next video">
            <div className="video-frame--short">
              <Image
                src={`https://img.youtube.com/vi/${shuffled[nextIdx].id}/hqdefault.jpg`}
                alt={shuffled[nextIdx].title}
                width={480}
                height={360}
              />
            </div>
          </div>
        )}
      </div>

      {shuffled[current].label && (
        <p className="vc-label">{shuffled[current].label}</p>
      )}

      {shuffled.length > 1 && (
        <div className="vc-controls">
          <button className="vc-btn" onClick={prev} aria-label="Previous video">‹</button>
          <div className="vc-dots">
            {shuffled.map((_, i) => (
              <button
                key={i}
                className={`vc-dot${i === current ? " active" : ""}`}
                onClick={() => setCurrent(i)}
                aria-label={`Video ${i + 1}`}
              />
            ))}
          </div>
          <button className="vc-btn" onClick={next} aria-label="Next video">›</button>
        </div>
      )}
    </div>
  );
}
