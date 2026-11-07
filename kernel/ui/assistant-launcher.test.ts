import { describe, expect, it, vi } from "vitest";
import { OPEN_ASSISTANT_EVENT, openAssistant } from "./assistant-launcher";

// TH.25. The team hub's phone bar opens the assistant from outside the chat
// widget, so it can only reach the widget through this event, and the event
// must carry the name the widget listens for.
describe("opening the assistant from elsewhere", () => {
  it("dispatches the event the chat widget listens for", () => {
    const target = new EventTarget();
    (globalThis as { window?: unknown }).window = target;
    const heard = vi.fn();
    target.addEventListener(OPEN_ASSISTANT_EVENT, heard);
    try {
      openAssistant();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
