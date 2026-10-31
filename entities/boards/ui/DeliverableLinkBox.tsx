"use client";

import { useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { prKey } from "@/entities/boards/lib/types";

/**
 * The link box under a card's deliverables (W.155), as the canvas's "Adding a
 * link" state draws it: one address field and Add, with the line that says
 * what happens to a pull request.
 *
 * A GitHub pull request typed here is offered for the PR field instead of
 * being added, because a card's PR is a field and shows its merge state there
 * (the spec: a PR is only ever in one place). Choosing it changes the form,
 * like every other field in the drawer; Save writes it.
 *
 * Not a <form>: the drawer's fields already sit in one, and a form inside a
 * form is not valid HTML. Enter adds, Escape closes.
 */
export function DeliverableLinkBox({
  saving,
  currentPrUrl,
  onAdd,
  onUseAsPr,
  onClose,
}: {
  saving: boolean;
  /** The card's PR field as it stands, so the offer can say it replaces one. */
  currentPrUrl: string;
  onAdd: (url: string) => Promise<boolean>;
  onUseAsPr: (url: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [offerPr, setOfferPr] = useState(false);

  async function add() {
    const typed = url.trim();
    if (!typed || saving) return;
    if (prKey(typed)) {
      setOfferPr(true);
      return;
    }
    if (await onAdd(typed)) setUrl("");
  }

  if (offerPr) {
    return (
      <div className="wb-deliv-offer" role="group" aria-label="This is a pull request">
        <p className="wb-deliv-offer-text">
          That&apos;s a pull request. It goes in the PR field, where it shows its merge state
          {currentPrUrl.trim() ? ", in place of the PR the card has now." : "."}
        </p>
        <div className="u-row">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={() => {
              onUseAsPr(url.trim());
              onClose();
            }}
          >
            Use as the PR
          </button>
          <button type="button" className="admin-btn" onClick={() => setOfferPr(false)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wb-deliv-linkbox">
      <div className="wb-deliv-linkrow">
        <label className="wb-deliv-input">
          <span className="u-sr-only">Link address</span>
          <Icon name="link" />
          <input
            type="url"
            inputMode="url"
            autoFocus
            placeholder="Paste a link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
              if (e.key === "Escape") {
                // The drawer closes on Escape too, unless something inside
                // handled it first (kernel/ui/focus-trap, escapeHandledInside).
                e.preventDefault();
                onClose();
              }
            }}
          />
        </label>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => void add()} disabled={saving || !url.trim()}>
          Add
        </button>
      </div>
      <p className="wb-deliv-hint">A pull request link pasted here is offered for the PR field instead, where it shows its merge state.</p>
    </div>
  );
}
