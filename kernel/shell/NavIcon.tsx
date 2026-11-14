import { NAV_ICONS, type NavIconName } from "./nav-icons";

// One sidebar icon: stroked in the row's colour, and hidden from assistive
// technology because the row's label already says what it is.
export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      className="admin-nav-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d={NAV_ICONS[name]} />
    </svg>
  );
}
