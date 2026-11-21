import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The When card (QS.5c): Move and Cancel for whoever runs the session, and what
// a move sends. A Host's move is the time alone, which QS.5b's update refuses
// anything else from; an organiser's keeps the title and notes. There is no
// DOM testing library in this repo, so the card is drawn with react-dom/server
// and what its handlers decide is checked through the functions they call.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/kernel/ui/ConfirmButton", () => ({
  ConfirmButton: (p: { label?: string; confirmLabel?: string; dismissLabel?: string; body: string }) => (
    <button type="button" data-confirm={p.confirmLabel} data-dismiss={p.dismissLabel}>
      {p.label}
      <span>{p.body}</span>
    </button>
  ),
}));

import { WhenPanel, cancelBody, moveInput, moveRefusal } from "./WhenPanel";

const ok = async () => ({ ok: true as const });
const parts = { date: "2026-10-30", start: "16:00", minutes: 20 };

describe("WhenPanel", () => {
  it("draws when the session is, with Move and Cancel the session, the move's form closed", () => {
    const html = renderToStaticMarkup(<WhenPanel sessionId="t1" when="Fri 30 Oct · 16:00 · 20 min" parts={parts} keep={null} taught leaveTo="/team/my-training" actions={{ update: ok, cancel: ok }} />);
    expect(html).toContain(">When</h2>");
    expect(html).toContain("Fri 30 Oct · 16:00 · 20 min · Vietnam time. You can move it or cancel it until it starts.");
    expect(html).toContain(">Move</button>");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">Cancel the session<span>");
    expect(html).not.toContain('type="date"');
  });
});

describe("the cancel confirmation", () => {
  it("names Quests only for a taught session, the kind a fire is lit as", () => {
    expect(cancelBody(true)).toBe("It comes off everyone's My Training, and if it was lit as a fire on Quests, the fire goes out and its topic is wanted again. This cannot be undone.");
    expect(cancelBody(false)).toBe("It comes off everyone's My Training. This cannot be undone.");
  });

  it("hands the dialog Keep it beside Cancel the session, and the body for the kind of session, so neither button reads as the other", () => {
    // The dialog itself is a portal, which a server render does not draw, so the props the card hands it are read off a stand-in.
    const html = renderToStaticMarkup(<WhenPanel sessionId="t1" when="Fri 30 Oct · 16:00 · 20 min" parts={parts} keep={{ title: "Workshop", notes: null }} taught={false} leaveTo={null} actions={{ update: ok, cancel: ok }} />);
    expect(html).toContain('data-confirm="Cancel the session"');
    expect(html).toContain('data-dismiss="Keep it"');
    expect(html).toContain(">It comes off everyone&#x27;s My Training. This cannot be undone.<");
  });
});

describe("a move", () => {
  it("is refused with a word for an empty date or time, as a form's required fields would", () => {
    expect(moveRefusal("", "")).toBe("Pick a date and a start time.");
    expect(moveRefusal("", "16:00")).toBe("Pick a date.");
    expect(moveRefusal("2026-10-30", "")).toBe("Pick a start time.");
    expect(moveRefusal("2026-10-30", "16:00")).toBeNull();
  });

  it("sends a Host's move as the time alone", () => {
    expect(moveInput(null, parts)).toEqual({ date: "2026-10-30", start: "16:00", minutes: 20 });
  });

  it("keeps an organiser's title and notes as they are", () => {
    expect(moveInput({ title: "Workshop: evals", notes: "Bring a laptop" }, parts)).toEqual({ title: "Workshop: evals", notes: "Bring a laptop", ...parts });
    expect(moveInput({ title: "Workshop: evals", notes: null }, parts)).toEqual({ title: "Workshop: evals", ...parts });
  });
});
