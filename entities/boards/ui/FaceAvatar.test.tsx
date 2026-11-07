import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FaceAvatar } from "./FaceAvatar";

// LD.3 moved the board's assignee face onto the kernel's Avatar. With no border
// it must be the element the board drew before, so no card's meta line changes.
describe("FaceAvatar", () => {
  it("renders the assignee's initials as the board always did", () => {
    expect(renderToStaticMarkup(<FaceAvatar name="Sam Rivera" />)).toBe('<span class="wb-face-avatar" aria-hidden="true">SR</span>');
  });

  it("renders the empty ring when nobody has the card", () => {
    expect(renderToStaticMarkup(<FaceAvatar name={null} />)).toBe('<span class="wb-face-avatar is-empty" aria-hidden="true"></span>');
  });

  it("wears a border when the caller passes one", () => {
    expect(renderToStaticMarkup(<FaceAvatar name="Sam Rivera" border="silver" />)).toContain('class="admin-face-frame frame-silver"');
  });
});
