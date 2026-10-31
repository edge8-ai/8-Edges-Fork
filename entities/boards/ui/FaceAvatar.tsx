import { Avatar } from "@/kernel/ui/Avatar";
import { initials } from "@/entities/boards/lib/types";

/**
 * The assignee at the end of a card's meta line (W.160): initials in the
 * avatar, or an empty dashed ring when nobody has the card. Decoration only —
 * whoever draws it says the name in words, as a button's accessible name or
 * screen-reader text, because initials alone are not a name.
 *
 * The face is the kernel's Avatar (LD.3) under the board's own class, so with
 * no border it is the element the board always drew. `border` is the worn
 * tier, already decided by the caller: null when the viewer's game style is
 * off.
 */
export function FaceAvatar({ name, border = null }: { name: string | null; border?: string | null }) {
  return name ? (
    <Avatar className="wb-face-avatar" name={name} initials={initials(name)} border={border} decorative />
  ) : (
    <span className="wb-face-avatar is-empty" aria-hidden />
  );
}
