import { initials } from "@/entities/boards/lib/types";

/**
 * The assignee at the end of a card's meta line (W.160): initials in the
 * avatar, or an empty dashed ring when nobody has the card. Decoration only —
 * whoever draws it says the name in words, as a button's accessible name or
 * screen-reader text, because initials alone are not a name.
 */
export function FaceAvatar({ name }: { name: string | null }) {
  return name ? (
    <span className="wb-face-avatar" aria-hidden>
      {initials(name)}
    </span>
  ) : (
    <span className="wb-face-avatar is-empty" aria-hidden />
  );
}
