// Site-wide 404. Sits inside the root layout, so the public frame's nav and footer
// stay around it.
export default function SiteNotFound() {
  return (
    <section className="section">
      <div className="container" style={{ textAlign: "center" }} /* layout-ok: error boundary under the root layout, no utilities sheet */>
        <h1 className="section-title section-title--sm">Page not found</h1>
        <p className="section-sub" style={{ margin: "16px auto 32px" }} /* layout-ok: error boundary, no utilities sheet */>
          The page you were looking for does not exist or has moved.
        </p>
        {/* A plain <a>: the home page is the marketing zone's, which a
            client-side navigation from this app cannot reach. */}
        <a href="/" className="btn btn-primary">
          Back to home
        </a>
      </div>
    </section>
  );
}
