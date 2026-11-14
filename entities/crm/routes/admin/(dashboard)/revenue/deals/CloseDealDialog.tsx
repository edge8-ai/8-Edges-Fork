"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOST_REASONS } from "./types";

/**
 * The question a deal must answer before it closes: why it was lost, or what
 * it finally sold for. It used to be a strip drawn above the board while the
 * card sprang back to its lane, and on 9 Nov the CEO dropped WHA on Lost, saw
 * the card return and read the move as broken. A dialog in the middle of the
 * screen is where the eye already is after a drop, and it holds the deal's name
 * so the reader knows which card they are closing.
 *
 * Built on the admin-modal classes and portalled to the body, as ConfirmDialog
 * is, so a transformed board ancestor cannot trap it. ConfirmDialog itself
 * does not fit: its confirm is always the danger button and always enabled.
 */
export function CloseDealDialog({
  kind,
  dealTitle,
  currency,
  initialAmount,
  onConfirm,
  onCancel,
}: {
  kind: "lost" | "won";
  dealTitle: string;
  currency: string;
  initialAmount: string;
  /** The lost reason, or the final amount as typed. */
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(kind === "won" ? initialAmount : "");
  const firstRef = useRef<HTMLButtonElement & HTMLInputElement>(null);
  // The board re-renders while the move is written, handing a new onCancel each
  // time; reading it through a ref keeps focus where the reader put it.
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const ready = kind === "lost" ? value !== "" : Number(value) > 0;
  const title = kind === "lost" ? "Mark this deal lost?" : "Mark this deal won?";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-title">{title}</div>
        <div className="admin-modal-body">{dealTitle}</div>
        {kind === "lost" ? (
          <fieldset className="deals-close-reasons">
            <legend className="admin-label">Why was it lost?</legend>
            {LOST_REASONS.map(([v, label], i) => (
              <button
                key={v}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                className={`admin-btn${value === v ? " is-picked" : ""}`}
                aria-pressed={value === v}
                onClick={() => setValue(v)}
              >
                {label}
              </button>
            ))}
          </fieldset>
        ) : (
          <label className="admin-field u-mt-3">
            <span className="admin-label">Final deal amount ({currency.toUpperCase()})</span>
            <input
              ref={firstRef}
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready) onConfirm(value);
              }}
            />
          </label>
        )}
        <div className="admin-modal-actions">
          <button type="button" className="admin-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`admin-btn ${kind === "lost" ? "admin-btn--danger" : "admin-btn--primary"}`}
            disabled={!ready}
            onClick={() => onConfirm(value)}
          >
            {kind === "lost" ? "Mark lost" : "Mark won"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
