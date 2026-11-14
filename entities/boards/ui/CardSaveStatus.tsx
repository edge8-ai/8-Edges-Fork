"use client";

import { Icon } from "@/kernel/ui/Icon";
import type { AutosaveControl } from "./useCardAutosave";

/**
 * What the drawer says about saving (TH.3.2), at the right end of the PR row:
 * the place the Save button would have been. Quiet when all is well, because
 * a saved card is the normal case; a failure says so in the error colour and
 * offers the one thing to do about it. ClickUp removed this line once and put
 * it back when people asked for it: without it nobody is sure their edit held.
 */
export function CardSaveStatus({ autosave }: { autosave: AutosaveControl }) {
  if (autosave.state === "failed") {
    return (
      <span className="wb-save-status is-failed" role="alert">
        Couldn’t save
        <button type="button" className="wb-save-retry" onClick={autosave.retry}>
          Retry
        </button>
      </span>
    );
  }
  return (
    <span className={autosave.state === "saving" ? "wb-save-status is-saving" : "wb-save-status"} role="status" aria-live="polite">
      {autosave.state === "saving" ? (
        "Saving…"
      ) : (
        <>
          <Icon name="check" />
          Saved
        </>
      )}
    </span>
  );
}
