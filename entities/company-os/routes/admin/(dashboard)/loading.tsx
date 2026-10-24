// Route-level skeleton: every /team page is force-dynamic, so without this a
// navigation (including the Admin ↔ Team view switch) shows nothing until the
// server roundtrip completes.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="admin-skeleton-bar u-w-90" />
      <div className="admin-skeleton-bar admin-skeleton-bar--title" />
      <div className="admin-kpi-grid u-mb-0">
        {[0, 1, 2].map((i) => (
          <div className="admin-card u-p-4" key={i}>
            <div className="admin-skeleton-bar u-w-90" />
            <div className="admin-skeleton-bar admin-skeleton-bar--sub" />
          </div>
        ))}
      </div>
    </div>
  );
}
