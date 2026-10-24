"use client";

// "What lands here" (S.3, TH.2): the kinds, grouped by what they are about, and
// the one switch that sends work notices to Lark as well. What is asked of the
// person by name (an assignment, an @mention, an approval, a reply, a blocker)
// is always on, as in Linear and Figma, so the page offers no switch for it.
// A row that stands for several kinds switches them together (TH.8.3).
import { NOTIFICATION_GROUPS } from "./inbox-groups";
import type { InboxPref } from "./InboxView";

export function InboxPrefs({
  prefs,
  larkEcho,
  pending,
  onMute,
  onLarkEcho,
}: {
  prefs: InboxPref[];
  larkEcho: boolean;
  pending: boolean;
  onMute: (kinds: readonly string[], muted: boolean) => void;
  onLarkEcho: (on: boolean) => void;
}) {
  const byKind = new Map(prefs.map((p) => [p.kind, p]));
  return (
    <section className="admin-card admin-section-card" aria-labelledby="inbox-prefs-h">
      <div className="admin-card-head">
        <h2 className="admin-card-title" id="inbox-prefs-h">
          What lands here
        </h2>
      </div>
      <p className="admin-hint">
        Turning a kind off stops it reaching your Inbox. The cards and sparks themselves are not changed, and you can still
        open them anywhere.
      </p>
      <label className="inbox-pref inbox-echo">
        <span>
          <span className="inbox-pref-title">Also send work notices to Lark</span>
          <span className="admin-list-sub">Assigned to you and @mentions also arrive as a Lark message. The Inbox always has them.</span>
        </span>
        <input type="checkbox" checked={larkEcho} disabled={pending} onChange={(e) => onLarkEcho(e.target.checked)} />
      </label>
      <div className="inbox-pref-groups">
        {NOTIFICATION_GROUPS.map((g) => (
          <div key={g.name}>
            <div className="inbox-pref-group">{g.name}</div>
            {g.rows.map((row) => {
              const ps = row.kinds.map((kind) => byKind.get(kind)).filter((p): p is InboxPref => !!p);
              if (ps.length === 0) return null;
              const key = row.kinds.join(" ");
              // On while any of its kinds still lands, so a row never reads off
              // while something it stands for still arrives.
              return ps.every((p) => p.alwaysOn) ? (
                <div key={key} className="inbox-pref">
                  <span className="inbox-pref-title">{row.label}</span>
                  <span className="admin-list-sub">Always on</span>
                </div>
              ) : (
                <label key={key} className="inbox-pref">
                  <span className="inbox-pref-title">{row.label}</span>
                  <input
                    type="checkbox"
                    checked={ps.some((p) => !p.muted)}
                    disabled={pending}
                    onChange={(e) => onMute(ps.filter((p) => !p.alwaysOn).map((p) => p.kind), !e.target.checked)}
                  />
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
