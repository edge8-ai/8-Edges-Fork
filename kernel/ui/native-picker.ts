import { flushSync } from "react-dom";

// The input types whose picker showPicker() opens. A text or number field has
// none: on a phone, focusing it inside the tap is what brings up the keyboard.
const PICKER_TYPES = new Set(["date", "time", "datetime-local", "month", "week"]);

/**
 * Swap a field's resting text for its native control and open the control in
 * the same tap (M4.2).
 *
 * The board's quick edits, the List's cells and the coaching day picker all
 * render text at rest and swap in a `<select>` or a date input with autoFocus
 * on click. On a phone the first tap did nothing visible: the control rendered
 * after the tap had been handled, and a phone opens a native picker only for
 * a focus or a showPicker() made while the tap is still being handled. So the
 * swap is committed synchronously here, which runs autoFocus inside the tap
 * (that is what opens the picker on an iPhone), and on a touch screen
 * showPicker() is called too, for Android, where focus alone opens nothing.
 * The pointer check leaves a desktop click exactly as it was.
 *
 * Call it from the click handler that does the swap, with the state updates
 * that do it; the control that is swapped in must carry autoFocus.
 */
export function swapAndOpenPicker(swap: () => void): void {
  flushSync(swap);
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;
  const el = document.activeElement;
  const picks = el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && PICKER_TYPES.has(el.type));
  if (!picks) return;
  try {
    // Not every browser has it on a select (Safari has none), and it throws
    // where the browser refuses it; the focus above already did what it can.
    (el as { showPicker?: () => void }).showPicker?.();
  } catch {
    // Nothing to do: the control is on screen and focused either way.
  }
}
