// A plan's philosophy, read-only (TR.5): the same block on the organiser's page
// and on each learner's My Training, so everyone reads the same brief. No
// client state, so it renders on the server for both.
import type { PhilosophyType } from "@/entities/training/lib/philosophy";

export function PhilosophyRead({ philosophy: p }: { philosophy: PhilosophyType }) {
  const pres = p.good_looks_like.filter((l) => l.side === "presentation");
  const react = p.good_looks_like.filter((l) => l.side === "reactive");
  return (
    <div className="tr-phil">
      <Block label="Purpose">{p.purpose}</Block>
      <div className="tr-phil-halves">
        <Block label={`Presentation · ${p.halves.split}%`}>{p.halves.presentation}</Block>
        <Block label={`Reactive · ${100 - p.halves.split}%`}>{p.halves.reactive}</Block>
      </div>
      <Block label="Pressure">{p.pressure_rule}</Block>
      <Block label="Group sessions are for">{p.group_for}</Block>
      <Block label="One-on-one sessions are for">{p.one_on_one_for}</Block>
      <Block label="Homework">{p.homework_rule}</Block>
      {p.good_looks_like.length > 0 && (
        <div className="tr-phil-block">
          <span className="tr-label">What good looks like</span>
          <ul className="tr-phil-lines">
            {[...react, ...pres].map((l, i) => (
              <li key={i}>
                {l.line} <span className="tr-phil-side">{l.side === "reactive" ? "reactive" : "presentation"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="tr-hint">Source: {p.source}</p>
    </div>
  );
}

function Block({ label, children }: { label: string; children: string }) {
  return (
    <div className="tr-phil-block">
      <span className="tr-label">{label}</span>
      <p className="tr-phil-text">{children}</p>
    </div>
  );
}
