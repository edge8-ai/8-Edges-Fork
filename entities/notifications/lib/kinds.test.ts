import { describe, expect, it } from "vitest";
import { cardDraft, claimDecidedDraft, claimPaidDraft, dealDraft, hireDraft, ideaBuiltDraft, ideaPickedUpDraft, ideaShippedDraft, invoiceDraft, kudosDraft, leaveDraft, leaveWithdrawnDraft, subtaskDraft, NOTIFICATION_KINDS } from "./kinds";

// S.3. What each fact says in somebody's inbox, and to whom. The inbox tells a
// person what changed on THEIR work since they last looked, so a fact the
// person caused themselves says nothing, and a fact with nobody to tell writes
// no row at all.

const TASK = "11111111-2222-3333-4444-555555555555";
const card = {
  taskId: TASK,
  boardSlug: "eight-edges",
  subjectType: null,
  subjectId: null,
  title: "Ship the palette",
  assigneeId: "rowan",
  actorPersonId: "juno",
};

describe("the inbox's kinds", () => {
  it("names ten kinds, each with the sentence the preferences show", () => {
    expect(Object.keys(NOTIFICATION_KINDS)).toEqual([
      "card.completed",
      "card.set_aside",
      "subtask.done",
      "leave.approved",
      "leave.withdrawn",
      "hire.made",
      "deal.won",
      "invoice.paid",
      "claim.decided",
      "claim.paid",
      "idea.built",
      "idea.picked_up",
      "idea.shipped",
      "kudos.received",
    ]);
  });
});

describe("claimDecidedDraft (RB.8)", () => {
  const decided = {
    claimId: "claim-1",
    ownerPersonId: "person-a",
    title: "Hanoi workshop",
    became: "sent_back" as const,
    reason: "The taxi receipt is unreadable.",
    approvedTotalVnd: null,
    runDate: null,
    eventId: "event-4",
    actorPersonId: "finance",
  };

  it("tells the owner their claim was sent back, with the reason, linking the claim on the Team view only", () => {
    expect(claimDecidedDraft(decided)).toEqual({
      personId: "person-a",
      kind: "claim.decided",
      title: "“Hanoi workshop” was sent back to you",
      body: "The taxi receipt is unreadable.",
      adminHref: null,
      teamHref: "/team/claims/claim-1",
      eventKey: "claim-1:event-4",
    });
  });

  it("tells the owner an approval with the total and the run that will pay it", () => {
    const draft = claimDecidedDraft({ ...decided, became: "approved", reason: null, approvedTotalVnd: 1_200_000, runDate: "2026-10-15" });
    expect(draft?.title).toBe("“Hanoi workshop” was approved");
    expect(draft?.body).toMatch(/1,200,000.*paid in the run on/);
  });

  it("tells the owner a failed transfer returned their claim, with the reason and the run that will pay it", () => {
    const draft = claimDecidedDraft({ ...decided, became: "returned", reason: "Account number rejected.", runDate: "2026-11-01" });
    expect(draft).toMatchObject({ personId: "person-a", kind: "claim.decided", teamHref: "/team/claims/claim-1", adminHref: null });
    expect(draft?.title).toBe("“Hanoi workshop” was returned: the transfer did not go through");
    expect(draft?.body).toMatch(/^Account number rejected\. Check your bank details on the claim; it is paid in the run on Nov 1, 2026\.$/);
  });

  it("writes nothing for a check, or for a decision the owner made themselves", () => {
    expect(claimDecidedDraft({ ...decided, became: "checked", reason: null })).toBeNull();
    expect(claimDecidedDraft({ ...decided, actorPersonId: "person-a" })).toBeNull();
  });
});

describe("claimPaidDraft (RB.8)", () => {
  it("tells the owner their claim was paid, linking the claim where the bank's receipt downloads", () => {
    expect(claimPaidDraft({ claimId: "claim-1", ownerPersonId: "person-a", title: "Hanoi workshop", paymentId: "pay-1", eventId: "event-20", actorPersonId: "finance" })).toEqual({
      personId: "person-a",
      kind: "claim.paid",
      title: "“Hanoi workshop” was paid",
      body: "The bank's receipt is on the claim.",
      adminHref: null,
      teamHref: "/team/claims/claim-1",
      eventKey: "claim-1:event-20",
    });
  });
});

describe("ideaBuiltDraft (ID.2.7)", () => {
  const built = { ideaId: "i1", buildId: "b1", body: "Same on the sprint page.", actorName: "Thành", title: "Card faces show comments", assigneeId: "derek", actorPersonId: "thanh" };

  it("tells the spark's author who built on it, with the words, linking the spark on /team only", () => {
    expect(ideaBuiltDraft(built)).toEqual({
      personId: "derek",
      kind: "idea.built",
      title: "Thành built on “Card faces show comments”",
      body: "Same on the sprint page.",
      adminHref: null,
      teamHref: "/team/ideas/i1",
      eventKey: "b1",
    });
  });

  it("says nothing when the author built on their own spark, or the author is unknown", () => {
    expect(ideaBuiltDraft({ ...built, actorPersonId: "derek" })).toBeNull();
    expect(ideaBuiltDraft({ ...built, assigneeId: null })).toBeNull();
  });

  it("clips a long build for the inbox line", () => {
    const d = ideaBuiltDraft({ ...built, body: "x".repeat(400) })!;
    expect(d.body!.length).toBeLessThanOrEqual(160);
  });
});

describe("cardDraft", () => {
  it("tells the assignee that someone else finished their card, linking the drawer on both surfaces", () => {
    expect(cardDraft("card.completed", card)).toEqual({
      personId: "rowan",
      kind: "card.completed",
      title: "“Ship the palette” was finished",
      body: null,
      adminHref: `/admin/boards/eight-edges?card=${TASK}`,
      teamHref: `/team/boards/eight-edges?card=${TASK}`,
      eventKey: TASK,
    });
  });

  it("says nothing when the assignee moved the card themselves", () => {
    expect(cardDraft("card.completed", { ...card, actorPersonId: "rowan" })).toBeNull();
  });

  it("says nothing when the card has no assignee, or the publisher could not say who", () => {
    expect(cardDraft("card.completed", { ...card, assigneeId: null })).toBeNull();
    const { assigneeId: _dropped, ...unaddressed } = card;
    expect(cardDraft("card.completed", unaddressed)).toBeNull();
  });

  it("words a card set aside as set aside, and falls back to a generic line without a title", () => {
    const { title: _t, ...untitled } = card;
    expect(cardDraft("card.set_aside", untitled)?.title).toBe("A card of yours was set aside");
  });
});

describe("subtaskDraft", () => {
  const tick = {
    subtaskId: "sub-1",
    parentTaskId: TASK,
    done: true,
    subjectType: null,
    subjectId: null,
    boardSlug: "eight-edges",
    title: "Write the tests",
    parentTitle: "Ship the palette",
    assigneeId: "rowan",
    actorPersonId: "juno",
  };

  it("tells the card's assignee a subtask was ticked, opening the parent card", () => {
    expect(subtaskDraft(tick)).toMatchObject({
      personId: "rowan",
      kind: "subtask.done",
      title: "“Write the tests” was ticked on “Ship the palette”",
      teamHref: `/team/boards/eight-edges?card=${TASK}`,
    });
  });

  it("says nothing for an untick, or for the assignee's own tick", () => {
    expect(subtaskDraft({ ...tick, done: false })).toBeNull();
    expect(subtaskDraft({ ...tick, actorPersonId: "rowan" })).toBeNull();
  });
});

describe("the other facts", () => {
  it("tells the requester their leave was approved, with the span", () => {
    const leave = { requestId: "lv-1", teamMemberId: "tm-1", startDate: "2026-10-01", endDate: "2026-10-03", leaveType: "annual" };
    expect(leaveDraft(leave, "rowan")).toEqual({
      personId: "rowan",
      kind: "leave.approved",
      title: "Your annual leave was approved",
      body: "2026-10-01 to 2026-10-03",
      adminHref: "/admin/operations/time-off/requests",
      teamHref: "/team/time-off",
      eventKey: "lv-1",
    });
    expect(leaveDraft(leave, null)).toBeNull();
  });

  // A.30. Withdrawn leave has its own kind: in the approval's kind, keyed on
  // the same request, the upsert would drop it as the approval's duplicate.
  it("tells the requester their approved leave was cancelled or denied, unless they did it", () => {
    const withdrawn = { requestId: "lv-1", teamMemberId: "tm-1", startDate: "2026-10-01", endDate: "2026-10-01", leaveType: "annual", became: "rejected" as const, actorPersonId: "juno" };
    expect(leaveWithdrawnDraft(withdrawn, "rowan")).toEqual({
      personId: "rowan",
      kind: "leave.withdrawn",
      title: "Your approved annual leave was denied",
      body: "2026-10-01",
      adminHref: "/admin/operations/time-off/requests",
      teamHref: "/team/time-off",
      eventKey: "lv-1",
    });
    expect(leaveWithdrawnDraft({ ...withdrawn, became: "cancelled" }, "rowan")?.title).toBe("Your approved annual leave was cancelled");
    expect(leaveWithdrawnDraft({ ...withdrawn, actorPersonId: "rowan" }, "rowan")).toBeNull();
    expect(leaveWithdrawnDraft(withdrawn, null)).toBeNull();
  });

  it("tells the hiring manager about the hire", () => {
    const hire = { applicationId: "app-1", jobRequisitionId: "jr-1", candidateId: null, personId: null, hiringManagerId: "rowan" };
    expect(hireDraft(hire)).toMatchObject({ personId: "rowan", kind: "hire.made", adminHref: "/admin/talent/applications/app-1", teamHref: "/team/hiring" });
    expect(hireDraft({ ...hire, hiringManagerId: null })).toBeNull();
  });

  it("tells the deal's owner, or the company's owner when the deal names none", () => {
    const won = { dealId: "d-1", companyId: "c-1", personId: null, amountUsdCents: null, closedAt: "2026-09-25", title: "Northwind pilot", ownerId: "rowan" };
    expect(dealDraft(won, "company-owner")).toMatchObject({ personId: "rowan", title: "“Northwind pilot” was won", teamHref: "/team/revenue/deals/d-1" });
    expect(dealDraft({ ...won, ownerId: null }, "company-owner")?.personId).toBe("company-owner");
  });

  // S.19.9. Each of these was assumed to be someone else's decision, and is not
  // always: the actor gets no row about their own action.
  it("tells nobody about their own approval, hire or win", () => {
    const leave = { requestId: "lv-1", teamMemberId: "tm-1", startDate: "2026-10-01", endDate: "2026-10-01", leaveType: "annual" };
    expect(leaveDraft({ ...leave, actorPersonId: "rowan" }, "rowan")).toBeNull();
    expect(leaveDraft({ ...leave, actorPersonId: "someone-else" }, "rowan")?.personId).toBe("rowan");
    const hire = { applicationId: "app-1", jobRequisitionId: "jr-1", candidateId: null, personId: null, hiringManagerId: "rowan" };
    expect(hireDraft({ ...hire, actorPersonId: "rowan" })).toBeNull();
    const won = { dealId: "d-1", companyId: "c-1", personId: null, amountUsdCents: null, closedAt: "2026-09-25", ownerId: "rowan" };
    expect(dealDraft({ ...won, actorPersonId: "rowan" }, null)).toBeNull();
    // The company's owner is left out too when they are the one who won it.
    expect(dealDraft({ ...won, ownerId: null, actorPersonId: "company-owner" }, "company-owner")).toBeNull();
  });

  it("tells the company's owner an invoice was paid, naming it by number", () => {
    const paid = { invoiceId: "i-1", companyId: "c-1", dealId: null, amountCents: 125000, currency: "USD", paidOn: "2026-09-25", docNumber: "1042" };
    expect(invoiceDraft(paid, "rowan")).toMatchObject({
      personId: "rowan",
      title: "Invoice 1042 was paid",
      body: "$1,250",
      adminHref: "/admin/revenue/invoices?q=1042",
    });
    expect(invoiceDraft(paid, null)).toBeNull();
  });
});

describe("ideaPickedUpDraft (ID.2.8)", () => {
  const picked = { ideaId: "i1", taskId: "t1", boardSlug: "ops", actorName: "Thành", title: "Card faces show comments", assigneeId: "derek", actorPersonId: "thanh" };

  it("tells the author who picked their spark up, keyed on the card, linking the spark", () => {
    expect(ideaPickedUpDraft(picked)).toEqual({
      personId: "derek",
      kind: "idea.picked_up",
      title: "Thành picked up “Card faces show comments”",
      body: "It's a Workboard card now. It shows as Shipped once the card is done.",
      adminHref: null,
      teamHref: "/team/ideas/i1",
      eventKey: "t1",
    });
  });

  it("says nothing when the author picked up their own spark", () => {
    expect(ideaPickedUpDraft({ ...picked, actorPersonId: "derek" })).toBeNull();
  });
});

describe("ideaShippedDraft (W.192)", () => {
  const shipped = { ideaId: "s1", taskId: "t1", boardSlug: "ours", title: "Show who created a card", assigneeId: "p-author", actorPersonId: "p-closer" };

  it("tells the spark's author their spark shipped, linking the spark, keyed on the card", () => {
    expect(ideaShippedDraft(shipped)).toEqual({
      personId: "p-author",
      kind: "idea.shipped",
      title: "Your spark “Show who created a card” shipped",
      body: "The card picked up from it is done. Your name is on the spark that started it.",
      adminHref: null,
      teamHref: "/team/ideas/s1",
      eventKey: "t1",
    });
  });

  it("says nothing to an author who closed the card themselves", () => {
    expect(ideaShippedDraft({ ...shipped, actorPersonId: "p-author" })).toBeNull();
  });
});

describe("kudosDraft (TH.1.8)", () => {
  const given = {
    kudosId: "kudos-1",
    body: "The Melbourne retreat ran like clockwork. Thank you!",
    actorName: "Khoa",
    assigneeId: "person-thanked",
    actorPersonId: "person-giver",
  };

  it("tells the person thanked, in the giver's words, linking the board", () => {
    expect(kudosDraft(given)).toEqual({
      personId: "person-thanked",
      kind: "kudos.received",
      title: "Khoa sent you kudos",
      body: "The Melbourne retreat ran like clockwork. Thank you!",
      adminHref: null,
      teamHref: "/team/kudos",
      eventKey: "kudos-1",
    });
  });

  it("says nothing when someone is named as thanking themselves", () => {
    expect(kudosDraft({ ...given, assigneeId: "person-giver" })).toBeNull();
  });
});
