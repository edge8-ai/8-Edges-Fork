import { describe, expect, it } from "vitest";
import { approvalDraft, blockerDraft, oneOnOneDrafts, repliedDraft, reviewDraft } from "./ask-kinds";

// TH.8.3. What each new ask says, and to whom. As everywhere in the inbox, a
// fact the person caused themselves says nothing.

const approval = {
  approvalId: "ap-1",
  subjectType: "time_off",
  subjectId: "lv-1",
  label: "Juno · Annual · 20–21 Oct",
  requestedBy: "juno",
  approverPersonId: "rowan",
  approverPermission: null,
  metadata: {},
};

describe("the asks' drafts", () => {
  it("words an approval by what it is and links where it is decided on each surface", () => {
    expect(approvalDraft(approval, "rowan")).toMatchObject({
      kind: "approval.waiting",
      title: "Time off to approve: Juno · Annual · 20–21 Oct",
      teamHref: "/team/approvals",
      adminHref: "/admin/operations/time-off/requests",
      eventKey: "ap-1",
    });
    expect(approvalDraft({ ...approval, subjectType: "agreement_client_signature", subjectId: "ag-1", label: "Mai to sign Employment agreement" }, "mai")).toMatchObject({
      title: "Ready for your signature: Mai to sign Employment agreement",
      teamHref: "/team/agreements/ag-1",
      // The portal page is the client's; the inbox never links it.
      adminHref: null,
    });
  });

  it("says nothing to the person who asked, as when leave is your own to decide or an agreement you prepared", () => {
    expect(approvalDraft({ ...approval, approverPersonId: "juno" }, "juno")).toBeNull();
  });

  it("asks nothing about the approvals the canvas leaves out", () => {
    expect(approvalDraft({ ...approval, subjectType: "hiring_hire" }, "rowan")).toBeNull();
    expect(approvalDraft({ ...approval, subjectType: "not_a_subject" }, "rowan")).toBeNull();
  });

  it("falls back to plain words when an approval carries no label", () => {
    expect(approvalDraft({ ...approval, label: " " }, "rowan")?.title).toBe("A time-off request waits for your approval");
  });

  it("says nothing when someone replies to their own comment or hands themselves a blocker", () => {
    const reply = { taskId: "t", boardSlug: "b", commentId: "c2", parentCommentId: "c1", body: "Yes", assigneeId: "rowan", actorPersonId: "rowan" };
    expect(repliedDraft(reply)).toBeNull();
    expect(blockerDraft({ blockerId: "bl", taskId: "t", boardSlug: "b", body: "Waiting", assigneeId: "rowan", actorPersonId: "rowan" })).toBeNull();
  });

  it("names the other side of a 1-1 to each, with the day it left when it moved", () => {
    const drafts = oneOnOneDrafts({
      meetingId: "m",
      profileId: "p",
      change: "moved",
      heldOn: "2026-10-22",
      movedFrom: "2026-10-20",
      coachPersonId: "rowan",
      coacheePersonId: "mai",
      coachName: "Rowan",
      coacheeName: "Mai",
      tell: ["coach", "coachee", "coachee"],
    });
    expect(drafts.map((d) => [d.personId, d.title.startsWith(`Your 1-1 with ${d.personId === "rowan" ? "Mai" : "Rowan"} moved to`)])).toEqual([
      ["rowan", true],
      ["mai", true],
    ]);
    expect(drafts[0].body).toMatch(/^It was on /);
  });

  it("words a review part by the rater's side", () => {
    const part = { reviewId: "rv", raterPersonId: "mai", raterKind: "self" as const, reviewName: "Probation review", subjectName: "Mai", formPath: "/surveys/perf-review-self?review=rv" };
    expect(reviewDraft(part).title).toBe("Your self-assessment for your Probation review is open");
    expect(reviewDraft({ ...part, raterKind: "reviewer", raterPersonId: "rowan" }).title).toBe("Your feedback for Mai's Probation review");
  });
});
