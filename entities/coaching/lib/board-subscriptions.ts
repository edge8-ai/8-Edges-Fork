// Coaching's side of the board card move (RS-13, replacing the composed
// moveCardColumn; it moved here with the entity in RS-12).
//
// Coaching creates a board card for a commitment, so boards may not import
// coaching to close it — an entity that creates cards cannot also be one the
// board imports, or neither installs without the other. Boards publishes
// `board.card.completed` instead and this subscribes, which is why a deployment
// can have boards without coaching, or coaching without boards.
//
// The composition root registers it for the entities a deployment includes;
// nothing here registers itself on import.
import { companyOs } from "@/kernel/data/supabase";
import type { EventPayload } from "@/kernel/events";
import { SUBJECT_COMMITMENT } from "@/entities/boards";

// One-way sync: a commitment-linked card reaching a done column SUGGESTS the
// coaching commitment was kept. Never the reverse, and never the status.
//
// This used to write `status: "completed"` and close the commitment outright.
// Khoa stopped that on 2026-09-18: the commitment board is where a person keeps
// their own word, and a promise the system ticks off on their behalf is not a
// promise they kept — it is a work tracker wearing the word "growth". The card
// is evidence; the owner of the promise is the only one who may act on it.
//
// So the event leaves a dated stamp and nothing else. Both boards read it
// through `cardDoneSuggested` and offer the question; answering it is an
// ordinary status move the owner makes, and dismissing it clears the stamp.
export async function suggestCommitmentKept(payload: EventPayload<"board.card.completed">): Promise<void> {
  if (payload.subjectType !== SUBJECT_COMMITMENT || !payload.subjectId) return;
  const { error } = await companyOs
    .from("coaching_commitments")
    .update({ card_done_at: new Date().toISOString() })
    // A commitment its owner has already closed needs no suggestion, and
    // re-stamping one would make a dismissed question come back.
    .eq("id", payload.subjectId)
    .neq("status", "completed")
    .neq("status", "dropped")
    .is("card_done_at", null);
  // Thrown, not swallowed: the bus logs and audits it, and a silent drop here
  // would lose the one prompt the member ever gets about this card.
  if (error) throw new Error(`coaching commitment ${payload.subjectId} not flagged card-done: ${error.message}`);
}

// Registration lives in ./subscriptions.ts, with coaching's other handlers.
// The Lark commitment-card handler used to register beside this one; K.15 made
// every coaching notification link-only and deleted the card, so nothing taps
// back any more.
