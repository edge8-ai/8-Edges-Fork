import type { KeyboardEvent } from "react";
import type { OrgModel } from "@/entities/org/lib/org-tree";

// Arrow keys on the org chart's tree. ↑ ↓ walk every card in reading order,
// people and open roles alike. On a person, ← closes their branch or moves to
// their manager and → opens it or moves to their first report. On an open role,
// ← moves to the person hiring for it. Without the role case a keyboard user
// who reached a role with ↓ could not leave it again.

const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const CARD = "[data-person], [data-role]";

/** The manager card a seat hangs under, stepping over the stacked leaf column, which has no card of its own. */
function ownerCard(card: HTMLElement): HTMLElement | null {
  let li = card.closest("li")?.parentElement?.closest("li") ?? null;
  if (li?.classList.contains("is-leafcol")) li = li.parentElement?.closest("li") ?? null;
  return li?.querySelector<HTMLElement>(":scope > .admin-org-node > [data-person]") ?? null;
}

export function handleTreeKey(
  e: KeyboardEvent<HTMLElement>,
  inner: HTMLElement | null,
  model: OrgModel,
  collapsed: ReadonlySet<string>,
  toggle: (id: string) => void,
) {
  const card = (e.target as HTMLElement).closest<HTMLElement>(CARD);
  if (!card || !inner || !ARROWS.has(e.key)) return;
  e.preventDefault();
  const cards = [...inner.querySelectorAll<HTMLElement>(CARD)];
  const at = cards.indexOf(card);
  if (e.key === "ArrowDown") return cards[at + 1]?.focus();
  if (e.key === "ArrowUp") return cards[at - 1]?.focus();

  const id = card.dataset.person;
  if (!id) {
    if (e.key === "ArrowLeft") ownerCard(card)?.focus();
    return;
  }
  const hasBranch = Boolean(card.parentElement?.querySelector(`[data-toggle="${id}"]`));
  if (e.key === "ArrowRight" && hasBranch) {
    if (collapsed.has(id)) toggle(id);
    else card.closest("li")?.querySelector<HTMLElement>(":scope > ul [data-person], :scope > ul [data-role]")?.focus();
  }
  if (e.key === "ArrowLeft") {
    if (hasBranch && !collapsed.has(id)) return toggle(id);
    const mgr = model.byId.get(id)?.managerId;
    if (mgr) inner.querySelector<HTMLElement>(`[data-person="${mgr}"]`)?.focus();
  }
}
