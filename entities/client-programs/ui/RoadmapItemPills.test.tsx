// The Done pill marks a roadmap item shipped and a second click reopens it, so
// an admin can complete an item without opening the edit form. The component
// holds no state, so it is called as a function and its buttons inspected.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RoadmapItemPills } from "./RoadmapItemPills";
import type { BacklogItem } from "@/entities/client-programs/lib/client-backlog";

const item = (status: BacklogItem["status"]) => ({ id: "i1", status, edge8_priority: "now" }) as BacklogItem;

function doneButton(status: BacklogItem["status"], onDone: (done: boolean) => void) {
  const el = RoadmapItemPills({ item: item(status), disabled: false, onPriority: () => {}, onDone });
  const children = React.Children.toArray((el.props as { children: React.ReactNode }).children);
  return children[children.length - 1] as React.ReactElement<{ onClick: () => void; "aria-pressed": boolean }>;
}

describe("RoadmapItemPills Done", () => {
  it("marks an open item done", () => {
    const onDone = vi.fn();
    const button = doneButton("accepted", onDone);
    expect(button.props["aria-pressed"]).toBe(false);
    button.props.onClick();
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("reopens a shipped item", () => {
    const onDone = vi.fn();
    const button = doneButton("shipped", onDone);
    expect(button.props["aria-pressed"]).toBe(true);
    button.props.onClick();
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it("renders after the four priority pills", () => {
    const html = renderToStaticMarkup(
      <RoadmapItemPills item={item("shipped")} disabled={false} onPriority={() => {}} onDone={() => {}} />,
    );
    expect(html).toMatch(/Park<\/button><button[^>]*class="admin-backlog-editor-pill on-done"[^>]*>✓ Done<\/button>/);
  });
});
