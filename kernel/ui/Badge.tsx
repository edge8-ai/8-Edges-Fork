import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "err" | "info" | "pink" | "neutral";

/** How many categorical palette slots a Badge can take (see .admin-badge--palette). */
export const BADGE_PALETTE_SIZE = 12;

export function Badge({
  tone = "neutral",
  dot,
  colorIndex,
  title,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  /**
   * The full text a shortened label stands for (W.103.2). A chip on a card
   * shows an identifier — "Sprint 3" — and this is where the name it was cut
   * from goes, so the card stays scannable and nothing is lost.
   */
  title?: string;
  /**
   * A categorical palette slot, 0 to BADGE_PALETTE_SIZE - 1, for badges that
   * name one of many things rather than a status (a client on the Workboard).
   * When set it replaces the tone's colours.
   */
  colorIndex?: number | null;
  children: ReactNode;
}) {
  const palette = colorIndex != null;
  const cls = [
    "admin-badge",
    !palette && tone !== "neutral" ? `admin-badge--${tone}` : "",
    palette ? "admin-badge--palette" : "",
    dot ? "admin-badge--dot" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} title={title} data-color={palette ? colorIndex % BADGE_PALETTE_SIZE : undefined}>
      {children}
    </span>
  );
}

// Map common company_os status/stage strings to a badge tone.
export function statusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "won":
    case "paid":
    case "confirmed":
    case "active":
    case "hired":
      return "ok";
    case "lost":
    case "rejected":
    case "refunded":
    case "cancelled":
    case "do_not_pursue":
    case "terminated":
    case "overdue":
      return "err";
    case "pending":
    case "on_hold":
    case "discovery":
    case "proposal":
    case "passive":
    case "future_consideration":
      return "warn";
    case "new_lead":
    case "contacted":
    case "open":
    case "filled":
    case "placed":
      return "info";
    default:
      return "neutral";
  }
}
