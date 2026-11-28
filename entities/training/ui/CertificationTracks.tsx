// My Training's certification tracks (TR.1, the Training Block canvas approved
// 2026-10-11): one segmented bar per track, modules first, then micro sessions,
// then coaching, ending in the certificate's flag, which fills only once the
// provider has awarded it. The words under the bar say what is left.
import { CERTIFICATION_PROGRAMME as PROGRAMME } from "../lib/certification-programme";
import type { TrackView } from "../lib/my-training";

function Flag({ won }: { won: boolean }) {
  return (
    <svg className={`tr-flag${won ? " is-won" : ""}`} viewBox="0 0 24 24" role="img" aria-label={won ? "Certificate awarded" : "Certificate"}>
      <path d="M6 21V4 M6 4h11l-2.5 3.5L17 11H6" />
    </svg>
  );
}

function Track({ track }: { track: TrackView }) {
  return (
    <div className="tr-track">
      <div className="tr-track-head">
        <span className="tr-track-name">{track.label}</span>
        <span className={`tr-track-togo${track.near ? " is-near" : ""}${track.certified ? " is-won" : ""}`}>{track.toGo}</span>
      </div>
      <div className="tr-bar">
        {/* One equal segment per unit, so a stage is as wide as it has units. */}
        {track.stages.flatMap((s) =>
          Array.from({ length: s.total }, (_, i) => (
            <i
              key={`${s.key}-${i}`}
              className={`tr-seg is-${s.key}${i < s.done ? " is-on" : ""}${i === 0 ? " is-first" : ""}${i === s.total - 1 ? " is-last" : ""}`}
              aria-hidden="true"
            />
          )),
        )}
        <Flag won={track.certified} />
      </div>
      <p className="tr-bar-labels">{track.stages.map((s) => `${s.label} ${s.done}/${s.total}`).join(" · ")}</p>
    </div>
  );
}

export function CertificationTracks({ tracks }: { tracks: TrackView[] }) {
  if (!PROGRAMME) return null;
  return (
    <section className="admin-card admin-section-card tr-card" aria-labelledby="tr-tracks-h">
      <div className="tr-card-head">
        <h2 className="tr-card-title" id="tr-tracks-h">
          Certification tracks
        </h2>
        <a href={PROGRAMME.homeUrl} target="_blank" rel="noopener noreferrer">
          Open the Institute →
        </a>
      </div>
      <p className="tr-hint">{PROGRAMME.instituteLabel} · required for everyone at Edge8</p>
      <div className="tr-tracks">
        {tracks.map((t) => (
          <Track key={t.key} track={t} />
        ))}
      </div>
    </section>
  );
}
