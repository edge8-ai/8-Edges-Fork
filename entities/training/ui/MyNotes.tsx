// The teacher's note about the reader (English Program PR 4): the same text the
// teacher edits on the learner page, shown to the learner and nobody else.
import type { MyNote } from "@/entities/training/lib/learner-notes";

export function MyNotes({ notes }: { notes: MyNote[] }) {
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((n) => (
        <section key={n.planId} className="admin-card admin-section-card tr-card" aria-label={`Note from ${n.teacherName}`}>
          <div className="tr-card-head">
            <div>
              <h2 className="tr-card-title">My teacher&rsquo;s note</h2>
              <p className="tr-hint">
                {n.planTitle} · from {n.teacherName}. Only you see this.
              </p>
            </div>
          </div>
          <div className="tr-phil">
            {n.note.strong && (
              <div className="tr-phil-block">
                <span className="tr-label">Strong</span>
                <p className="tr-phil-text">{n.note.strong}</p>
              </div>
            )}
            {n.note.weak && (
              <div className="tr-phil-block">
                <span className="tr-label">Weak</span>
                <p className="tr-phil-text">{n.note.weak}</p>
              </div>
            )}
            {n.note.focus && (
              <div className="tr-phil-block">
                <span className="tr-label">Focus now</span>
                <p className="tr-phil-text">{n.note.focus}</p>
              </div>
            )}
          </div>
        </section>
      ))}
    </>
  );
}
