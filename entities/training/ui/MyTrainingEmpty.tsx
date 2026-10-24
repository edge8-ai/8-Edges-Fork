// My Training with nothing to show yet: a deployment that runs no certification
// programme, for a member with no trainings. It says what the page is for and
// how to start, rather than leaving a heading over nothing.
export function MyTrainingEmpty() {
  return (
    <section className="admin-card admin-section-card tr-card" aria-label="My Training">
      <h2 className="tr-card-title">Nothing here yet</h2>
      <p className="tr-hint">Log a training you took, or wait for one to be scheduled for you. Your courses and sessions will show up here.</p>
    </section>
  );
}
