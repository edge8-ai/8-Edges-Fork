import { describe, expect, it } from "vitest";
import { cardTakesPaste, isTextField, windowFileDropGuard } from "./useCardFileIntake";

// Bug hunt B11 and F22 (2026-10-05). The environment has no DOM, so the two
// decisions the listeners make are tested as the plain functions they call.

const textarea = { tagName: "TEXTAREA" };
const input = { tagName: "INPUT", type: "text" };
const editable = { tagName: "DIV", isContentEditable: true };
const button = { tagName: "BUTTON" };

describe("whose paste it is (B11)", () => {
  it("leaves spreadsheet cells pasted into a field to the field, picture and all", () => {
    // Excel and Sheets put a picture of the cells beside the text.
    expect(cardTakesPaste(textarea, ["text/plain", "text/html", "Files"], 1)).toBe(false);
    expect(cardTakesPaste(input, ["text/plain", "Files"], 1)).toBe(false);
    expect(cardTakesPaste(editable, ["text/html", "Files"], 1)).toBe(false);
  });

  it("takes a screenshot pasted into a field, because it carries no text", () => {
    expect(cardTakesPaste(textarea, ["Files"], 1)).toBe(true);
  });

  it("takes files pasted anywhere that is not a text field", () => {
    expect(cardTakesPaste(button, ["text/plain", "Files"], 1)).toBe(true);
    expect(cardTakesPaste(null, ["text/plain", "Files"], 2)).toBe(true);
  });

  it("never takes a paste with no files", () => {
    expect(cardTakesPaste(null, ["text/plain"], 0)).toBe(false);
  });

  it("counts typing inputs as text fields and controls as not", () => {
    expect(isTextField({ tagName: "INPUT" })).toBe(true);
    expect(isTextField({ tagName: "INPUT", type: "url" })).toBe(true);
    expect(isTextField({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTextField({ tagName: "INPUT", type: "file" })).toBe(false);
    expect(isTextField(button)).toBe(false);
  });
});

function dragEvent(types: string[], defaultPrevented = false) {
  const e = {
    dataTransfer: { types, dropEffect: "copy" },
    defaultPrevented,
    prevented: false,
    preventDefault() {
      e.prevented = true;
    },
  };
  return e;
}

describe("a file dropped outside an open card (F22)", () => {
  const guard = windowFileDropGuard();

  it("is refused by the window, so the browser does not open it in place of the board", () => {
    const over = dragEvent(["Files"]);
    guard.dragover(over);
    expect(over.prevented).toBe(true);
    expect(over.dataTransfer.dropEffect).toBe("none");
    const drop = dragEvent(["Files"]);
    guard.drop(drop);
    expect(drop.prevented).toBe(true);
  });

  it("leaves a drop the card, or any other drop zone, already took", () => {
    const over = dragEvent(["Files"], true);
    guard.dragover(over);
    expect(over.prevented).toBe(false);
    expect(over.dataTransfer.dropEffect).toBe("copy");
  });

  it("leaves a drag that carries no files, such as a card moved between columns", () => {
    const over = dragEvent(["text/plain"]);
    guard.dragover(over);
    guard.drop(over);
    expect(over.prevented).toBe(false);
  });
});
