import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkboardQuickAssignee } from "./WorkboardQuickAssignee";
import { WorkboardQuickDue } from "./WorkboardQuickDue";

// W.93. At rest the two in-place edits are text — the row every surface
// without quick actions draws — and no form control. A static render IS the
// resting state, so what this asserts is exactly what a reader sees before
// they click. The List view draws them as below; the card face passes its own
// words and an avatar alone (W.160), pinned at the end of this file.

type Over = {
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  overdue?: boolean;
  label?: string | null;
  avatarOnly?: boolean;
};

const html = (over: Over = {}) => {
  const o = { assigneeId: "p1", assigneeName: "Ada Rivers", dueDate: "2026-09-18", overdue: false, ...over };
  return renderToStaticMarkup(
    <>
      <WorkboardQuickAssignee
        assigneeId={o.assigneeId}
        assigneeName={o.assigneeName}
        people={[{ id: "p1", name: "Ada Rivers" } as never]}
        saving={false}
        onAssignee={() => {}}
        avatarOnly={o.avatarOnly}
      />
      <WorkboardQuickDue dueDate={o.dueDate} overdue={o.overdue} saving={false} onDueDate={() => {}} label={o.label} />
    </>,
  );
};

describe("the quick assignee and due date at rest", () => {
  it("draws no select and no date input", () => {
    const out = html();
    expect(out).not.toContain("<select");
    expect(out).not.toContain('type="date"');
  });

  it("says who has the card as text, beside the avatar", () => {
    const out = html();
    expect(out).toContain("Ada Rivers");
    expect(out).toContain("admin-avatar");
    expect(out).toContain("wb-quick-assignee-text");
  });

  it("formats the due date the way the read-only card does", () => {
    // formatDate, not the ISO string the input used to hold.
    const out = html();
    expect(out).not.toContain("2026-09-18");
    expect(out).toContain("wb-quick-due-text");
  });

  it("marks an overdue date with the card's error token and nothing else", () => {
    expect(html({ overdue: true })).toContain("u-err");
    expect(html({ overdue: false })).not.toContain("u-err");
  });

  it("offers 'Set date' quietly when there is no due date, and never a placeholder", () => {
    const out = html({ dueDate: null });
    expect(out).toContain("Set date");
    // The class the hover rule keys off; nothing shows it at rest.
    expect(out).toContain("wb-quick-setdate");
    expect(out).not.toContain("dd/mm/yyyy");
  });

  it("reads Unassigned as text when nobody has it", () => {
    const out = html({ assigneeId: null, assigneeName: null });
    expect(out).toContain("Unassigned");
    expect(out).not.toContain("<select");
  });

});

describe("the card face's variant (W.160)", () => {
  it("draws the date in the face's words, first in its line rather than pushed to the end", () => {
    const out = html({ label: "Thu 18 Sep" });
    expect(out).toContain(">Thu 18 Sep<");
    expect(out).not.toContain("u-ml-auto");
    expect(html()).toContain("u-ml-auto");
  });

  it("keeps Set date first in the face's line when the card has no date (bug hunt U1)", () => {
    const out = html({ dueDate: null, label: null as never });
    expect(out).toContain("Set date");
    expect(out).not.toContain("u-ml-auto");
  });

  it("marks an overdue date in words and weight as well as colour", () => {
    expect(html({ overdue: true, label: "Overdue · 18 Sep" })).toContain("u-err is-overdue");
  });

  it("draws the assignee as initials alone, with the name in the button's accessible name", () => {
    const out = html({ avatarOnly: true });
    expect(out).toContain(">AR<");
    expect(out).toContain('aria-label="Assigned to Ada Rivers. Change"');
    expect(out).not.toContain("wb-quick-assignee-text");
  });

  it("draws an empty ring for nobody, still named for a screen reader", () => {
    const out = html({ avatarOnly: true, assigneeId: null, assigneeName: null });
    expect(out).toContain("wb-face-avatar is-empty");
    expect(out).toContain('aria-label="Assigned to nobody. Change"');
  });
});
