"use client";

import { useEffect, type RefObject } from "react";
import type { UploadSource } from "./card-uploads";

/** The input types a person types into; the rest are controls with no text to paste into. */
const NOT_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

type MaybeField = { tagName?: string; type?: string; isContentEditable?: boolean } | null;

/** Whether a paste landing here would put text into a field. */
export function isTextField(target: MaybeField): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  return tag === "INPUT" && !NOT_TEXT_INPUTS.has((target.type ?? "text").toLowerCase());
}

/**
 * Whether the card takes a paste's files as deliverables (bug hunt B11).
 * Spreadsheet cells and some editors' blocks put a picture of themselves on
 * the clipboard beside the text; pasting them into the description must give
 * the description the text, not the card a picture. So a paste into a text
 * field that carries text as well is the field's. A screenshot, which carries
 * no text, is the card's wherever it is pasted, and so is anything pasted
 * outside a field.
 */
export function cardTakesPaste(target: MaybeField, clipboardTypes: readonly string[], fileCount: number): boolean {
  if (fileCount === 0) return false;
  const carriesText = clipboardTypes.includes("text/plain") || clipboardTypes.includes("text/html");
  return !(carriesText && isTextField(target));
}

type FileDragEvent = { dataTransfer: { types: ArrayLike<string> | Iterable<string>; dropEffect?: string } | null; defaultPrevented: boolean; preventDefault: () => void };

const carriesFiles = (e: Pick<FileDragEvent, "dataTransfer">) => !!e.dataTransfer && [...(e.dataTransfer.types as Iterable<string>)].includes("Files");

/**
 * While a card is open, a file dropped anywhere OUTSIDE it must not be opened
 * by the browser, which navigates away and loses the card's unsaved edits
 * (bug hunt F22). The window refuses such a drop and does nothing else with
 * it: the card's own listeners, which run first, take the drops meant for it,
 * and any other drop zone that already handled the event is left alone.
 */
export function windowFileDropGuard() {
  return {
    dragover(e: FileDragEvent) {
      if (!carriesFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    },
    drop(e: FileDragEvent) {
      if (!carriesFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
    },
  };
}

/**
 * Files arriving anywhere on an open card (W.128): dropped onto it, or pasted
 * while it is open, as the canvas says ("Drop a file anywhere on the card, or
 * paste a screenshot"). Listens on the drawer that holds `inside`, so the whole
 * card is the target and not a small box somebody has to aim at.
 *
 * Paste takes FILES only, and only when they are not the picture beside some
 * text being pasted into a field (cardTakesPaste). A screenshot pasted while
 * the cursor is in a comment becomes a deliverable, which is what pasting an
 * image into a card means here.
 *
 * While a file is dragged over the card, the drawer wears `is-dropping`, which
 * draws the drop target over it (admin.css).
 */
export function useCardFileIntake(inside: RefObject<HTMLElement | null>, onFiles: (files: File[], source: UploadSource) => void) {
  useEffect(() => {
    const card = inside.current?.closest<HTMLElement>(".wb-card-drawer");
    if (!card) return;
    let depth = 0;

    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth += 1;
      card.classList.add("is-dropping");
    };
    const over = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      // Without this the browser opens the file in the tab instead.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) card.classList.remove("is-dropping");
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      card.classList.remove("is-dropping");
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length > 0) onFiles(files, "dropped");
    };
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      const types = [...(e.clipboardData?.types ?? [])];
      if (!cardTakesPaste(e.target as MaybeField, types, files.length)) return;
      e.preventDefault();
      onFiles(files, "pasted");
    };
    const outside = windowFileDropGuard();

    card.addEventListener("dragenter", enter);
    card.addEventListener("dragover", over);
    card.addEventListener("dragleave", leave);
    card.addEventListener("drop", drop);
    card.addEventListener("paste", paste);
    window.addEventListener("dragover", outside.dragover);
    window.addEventListener("drop", outside.drop);
    return () => {
      card.classList.remove("is-dropping");
      card.removeEventListener("dragenter", enter);
      card.removeEventListener("dragover", over);
      card.removeEventListener("dragleave", leave);
      card.removeEventListener("drop", drop);
      card.removeEventListener("paste", paste);
      window.removeEventListener("dragover", outside.dragover);
      window.removeEventListener("drop", outside.drop);
    };
  }, [inside, onFiles]);
}
