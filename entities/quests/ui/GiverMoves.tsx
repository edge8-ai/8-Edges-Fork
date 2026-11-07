"use client";

// The Giver's moves on an open bounty (close it now, withdraw it) and the tag
// both arenas wear. Shared by the one-head arena and the Hydra.
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import type { QuestActions } from "./actions-type";
import type { QuestCard } from "../lib/quests-read";
import { headClosed } from "./quests-model";

/** The arena's tag: what it is, and quietly whether it is required or a learning bounty. */
export function bossTag(card: QuestCard, kind: "Boss bounty" | "Hydra bounty"): string {
  return [kind, card.required ? "required" : null, card.learning ? "learning" : null].filter(Boolean).join(" · ");
}

/** On a tavern card the buttons are the small size, as the card's other moves are. */
export function GiverMoves({ card, actions, now, place = "arena" }: { card: QuestCard; actions: QuestActions | null; now: string; place?: "arena" | "card" }) {
  const router = useRouter();
  if (!card.isGiver || card.state !== "open" || !actions) return null;
  // Once any head's due time is behind us the quest closes rather than being
  // withdrawn (lib/standing.ts refuses it), so the control is not offered.
  const canWithdraw = !card.heads.some((h) => headClosed(h, now));
  const btn = place === "card" ? "admin-btn admin-btn--sm" : "admin-btn";
  return (
    <div className="qs-moves">
      <ConfirmButton className={btn} label="Close it now" title="Close this bounty now?" body="Every open head closes now, the way its due time would. Late turn-ins still count." confirmLabel="Close it" onConfirm={() => actions.closeQuest(card.id)} onDone={() => router.refresh()} />
      {canWithdraw && <ConfirmButton className={btn} label="Withdraw" title="Withdraw this bounty?" body="The turn-ins already made stay with their authors." confirmLabel="Withdraw it" onConfirm={() => actions.withdrawQuest(card.id)} onDone={() => router.refresh()} />}
    </div>
  );
}
