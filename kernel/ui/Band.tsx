// A labeled band divider that splits a cockpit into stacked sections: the
// section name on the left, a hairline across, and an optional note on the
// right (goal health, a pending count). Used by the Revenue, Talent, and
// Operations cockpits. Styles: .admin-band* in app/admin/admin.css.
export function Band({ label, note, muted }: { label: string; note?: string; muted?: boolean }) {
  return (
    <div className={`admin-band${muted ? " admin-band--muted" : ""}`}>
      <span className="admin-band-label">{label}</span>
      <span className="admin-band-rule" />
      {note && <span className="admin-band-note">{note}</span>}
    </div>
  );
}
