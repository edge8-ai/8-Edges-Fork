// The "Get certified" strip under a new hire's Start here panel, moved from the
// team entity with the certifications it points at (TR.1). The panel renders it
// through the StartHereCertification page slot, so team never names this
// entity. Nothing renders when the deployment runs no certification programme
// (lib/certification-programme.ts, stubbed to null on a fork).
import { CERTIFICATION_PROGRAMME as PROGRAMME } from "../lib/certification-programme";

export function StartHereCertification() {
  if (!PROGRAMME) return null;
  return (
    <div className="admin-start-cta u-mb-4">
      <div className="admin-start-cta-body">
        <span className="admin-start-kicker light">Get certified</span>
        <span className="admin-start-cta-heading">Join {PROGRAMME.name} and start your certification</span>
        <ol className="admin-start-cta-steps">
          <li>Sign up using your company email.</li>
          <li>
            Complete the <b>{PROGRAMME.firstTrack}</b> certification during your probation.
          </li>
          <li>
            Then take <b>{PROGRAMME.secondTrack}</b> by your third month.
          </li>
        </ol>
      </div>
      <div className="admin-start-cta-actions">
        <a className="admin-start-btn" href={PROGRAMME.certificationUrl} target="_blank" rel="noopener noreferrer">
          Start the certification →
        </a>
        <a className="admin-start-btn ghost" href={PROGRAMME.homeUrl} target="_blank" rel="noopener noreferrer">
          Join {PROGRAMME.name}
        </a>
      </div>
    </div>
  );
}
