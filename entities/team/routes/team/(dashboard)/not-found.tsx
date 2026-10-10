import Link from "next/link";

// Route-level 404 for /team: reached by notFound() from any page in this
// segment (bad [id], deleted record). Renders inside the (dashboard) layout,
// so the sidebar stays.
export default function TeamDashboardNotFound() {
  return (
    <div className="admin-content">
      <div className="admin-page-head">
        <div>
          <div className="admin-eyebrow">Team</div>
          <h1 className="admin-page-title">Not found</h1>
          <p className="admin-page-sub">That record does not exist or is no longer available.</p>
        </div>
      </div>
      <div className="admin-card u-p-4">
        <Link href="/team" className="admin-btn">
          Back to your team home
        </Link>
      </div>
    </div>
  );
}
