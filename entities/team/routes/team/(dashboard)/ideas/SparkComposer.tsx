"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { addSparkStory, quickSpark } from "./actions";
import { KIND_LABEL, type SparkKind } from "./sparks-model";

// "Got a spark?" (ID.2.1). One line is a whole spark; the story is offered
// after the line is safe, never asked for before it. Enter posts, Shift+Enter
// breaks the line, because the box is two rows tall but means one line.

type Posted = { id: string; kind: SparkKind };

const PLACEHOLDER: Record<SparkKind, string> = {
  build: "e.g. The Workboard should tell me when a card I follow moves",
  learning: "e.g. Pricing the result, not the hours, closed the deal",
};

export function SparkComposer() {
  const [kind, setKind] = useState<SparkKind>("build");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [story, setStory] = useState("");
  const [storyError, setStoryError] = useState<string | null>(null);
  const [storySaved, setStorySaved] = useState(false);

  async function post() {
    if (posting) return;
    setError(null);
    if (!text.trim()) {
      setError("Write one line first. That is all a spark needs.");
      return;
    }
    setPosting(true);
    const r = await quickSpark({ kind, title: text });
    setPosting(false);
    // A failed post keeps the words where they were typed.
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setText("");
    setStory("");
    setStoryError(null);
    setStorySaved(false);
    setPosted({ id: r.id, kind });
  }

  async function saveStory() {
    if (!posted) return;
    setStoryError(null);
    const r = await addSparkStory(posted.id, story);
    if (!r.ok) {
      setStoryError(r.error);
      return;
    }
    setStorySaved(true);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void post();
    }
  }

  return (
    <>
      <div className="sparks-compose">
        <div className="sparks-kinds" role="group" aria-label="What kind of spark">
          {(["build", "learning"] as const).map((k) => (
            <button key={k} type="button" className={`sparks-kind sparks-kind--${k}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              <Icon name={k === "build" ? "wrench" : "bulb"} />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="sparks-label" htmlFor="spark-line">
          Your spark, in one line
        </label>
        <textarea
          id="spark-line"
          className="sparks-input"
          rows={2}
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={PLACEHOLDER[kind]}
          aria-describedby={error ? "spark-line-error" : undefined}
        />
        {error && (
          <div id="spark-line-error" role="alert" className="sparks-error">
            {error}
          </div>
        )}
        <div className="sparks-compose-foot">
          <p className="sparks-hint">
            Got the whole picture? Use the <Link href="/team/ideas?compose=build">5D form</Link> or the{" "}
            <Link href="/team/ideas?compose=learning">full learning</Link>.
          </p>
          <button type="button" className="sparks-go" onClick={() => void post()} disabled={posting}>
            <Icon name="spark" />
            {posting ? "Sparking…" : "Spark it"}
          </button>
        </div>
      </div>

      {posted && (
        <div className="sparks-toast" role="status">
          <div className="sparks-toast-row">
            <div className="sparks-toast-icon" aria-hidden="true">
              <span className="sparks-burst">
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} />
                ))}
              </span>
              <span className="sparks-toast-core">
                <Icon name="spark" />
              </span>
            </div>
            <div className="sparks-toast-text">
              <strong>Your spark is live.</strong>
              <span>Everyone can see it now, and it just lit a new star in the team sky.</span>
            </div>
            <div className="sparks-toast-actions">
              <Link className="sparks-btn-dark" href={`/team/ideas/${posted.id}`}>
                Open your spark
              </Link>
              <button type="button" className="sparks-btn-ghost" onClick={() => setPosted(null)}>
                Done
              </button>
            </div>
          </div>
          {storySaved ? (
            <div className="sparks-story-done">
              {posted.kind === "learning"
                ? "Added. Claude is tidying it into a short write-up you can edit on your spark's page."
                : "Added. When you're ready, grow it into a 5D plan from your spark's page."}
            </div>
          ) : (
            <div className="sparks-story">
              <label htmlFor="spark-story">Optional: what happened? One or two lines.</label>
              <div className="sparks-story-row">
                <input
                  id="spark-story"
                  value={story}
                  maxLength={2000}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder="e.g. A comment got missed because nothing on the card said it was there"
                />
                <button type="button" className="sparks-btn-dark" onClick={() => void saveStory()}>
                  Add it
                </button>
              </div>
              {storyError && (
                <div role="alert" className="sparks-story-error">
                  {storyError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
