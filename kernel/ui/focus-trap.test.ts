import { describe, expect, it } from "vitest";
import { escapeLeavesField, inOtherDialog, trapTarget, escapeHandledInside } from "./focus-trap";

// W.141: Tab from the drawer's last control walked onto the page behind the
// backdrop. The trap sends it round to the first, and Shift+Tab the other way.
describe("trapTarget", () => {
  const els = ["title", "status", "save"] as const;

  it("sends Tab from the last control back to the first", () => {
    expect(trapTarget(els, "save", true, false)).toBe("title");
  });

  it("sends Shift+Tab from the first control to the last", () => {
    expect(trapTarget(els, "title", true, true)).toBe("save");
  });

  it("leaves an ordinary step inside the dialog to the browser", () => {
    expect(trapTarget(els, "status", true, false)).toBeNull();
    expect(trapTarget(els, "status", true, true)).toBeNull();
  });

  it("brings focus that has left the dialog back in at the edge Tab would reach", () => {
    expect(trapTarget(els, "somewhere-behind" as never, false, false)).toBe("title");
    expect(trapTarget(els, null, false, true)).toBe("save");
  });

  it("does nothing in a dialog with nothing to focus", () => {
    expect(trapTarget([], null, true, false)).toBeNull();
  });
});

describe("escapeLeavesField", () => {
  it("leaves a multi-line box that holds a draft rather than close the dialog", () => {
    expect(escapeLeavesField({ tagName: "TEXTAREA", value: "Half a sentence" })).toBe(true);
  });

  it("lets an empty box, a one-line field, a checkbox or a button close the dialog as before", () => {
    expect(escapeLeavesField({ tagName: "TEXTAREA", value: "" })).toBe(false);
    expect(escapeLeavesField({ tagName: "INPUT", value: "A prefilled name" })).toBe(false);
    expect(escapeLeavesField({ tagName: "INPUT", value: "on" })).toBe(false);
    expect(escapeLeavesField({ tagName: "BUTTON" })).toBe(false);
    expect(escapeLeavesField(null)).toBe(false);
  });
});

describe("inOtherDialog", () => {
  const dialog = (id: string) => ({ id });
  const at = (d: { id: string } | null) => ({ closest: () => d }) as unknown as Element;
  const own = dialog("drawer") as unknown as Element;

  it("stands the drawer's trap down while focus is in a confirm stacked over it", () => {
    expect(inOtherDialog(at(dialog("confirm")), own)).toBe(true);
  });

  it("keeps trapping inside the drawer itself and on the page behind it", () => {
    expect(inOtherDialog(at(own as never), own)).toBe(false);
    expect(inOtherDialog(at(null), own)).toBe(false);
    expect(inOtherDialog(null, own)).toBe(false);
  });
});

describe("escapeHandledInside (W.153)", () => {
  it("leaves the drawer open when something inside it already handled Escape", () => {
    expect(escapeHandledInside({ key: "Escape", defaultPrevented: true })).toBe(true);
  });

  it("lets an ordinary Escape through to close the drawer", () => {
    expect(escapeHandledInside({ key: "Escape", defaultPrevented: false })).toBe(false);
  });

  it("has no opinion on any other key", () => {
    expect(escapeHandledInside({ key: "Enter", defaultPrevented: true })).toBe(false);
  });
});
