// Opens the assistant from anywhere on the page, the way openSearchPalette opens
// search: the caller dispatches an event and the mounted chat widget, which
// owns its own open state, listens for it. On a phone the team hub's top bar
// opens the assistant this way, because a floating button there covered the
// page's own controls (TH.25). With no widget mounted nothing listens, so the
// caller only offers the button when its surface says an assistant is there.
export const OPEN_ASSISTANT_EVENT = "kernel:open-assistant";

export function openAssistant(): void {
  window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
}
