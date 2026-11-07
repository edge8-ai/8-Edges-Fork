// The count on a team sidebar row and on the phone bar (TH.8): how many asks
// from teammates wait on the person. It is drawn only when something waits, so
// a quiet Inbox shows nothing rather than a "0". Past nine it reads "9+": the
// number past that changes nothing about what to do next.
//
// The visible number is hidden from screen readers and the row gets a whole
// phrase instead, so a reader hears "Inbox, 3 waiting on you" rather than a
// bare "3" (ui-ux-pro-max: contextual live badge updates).
export function NavCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      <span className="admin-nav-count" aria-hidden>
        {count > 9 ? "9+" : count}
      </span>
      <span className="u-sr-only">, {count} waiting on you</span>
    </>
  );
}
