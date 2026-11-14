import { describe, expect, it } from "vitest";
import { dateBoth, dong, formsOf, isFormKind, requestForm, settlementForm, type FormFacts } from "./advance-forms";

const facts = (over: Partial<FormFacts> = {}): FormFacts => ({
  refNo: 7,
  owner: "Avery Example",
  purpose: "Venue deposit",
  amountVnd: 8_000_000,
  settleBy: "2026-11-30",
  company: { name: "Example Co", taxCode: "0000000000" },
  asked: { at: "2026-11-03T02:30:00Z" },
  approved: { by: "Dana Example", at: "2026-11-03T07:05:00Z" },
  settlementApproved: { by: "Dana Example", at: "2026-11-16T03:00:00Z" },
  checkApproved: null,
  returnRecorded: { by: "Blair Example", at: "2026-11-18T09:45:00Z" },
  ownerSent: { at: "2026-11-14T01:00:00Z" },
  closedOn: "2026-11-16",
  spentVnd: 7_360_000,
  items: [{ label: "Venue deposit", vnd: 6_400_000 }, { label: "Workbooks", vnd: 960_000 }],
  ...over,
});

describe("formsOf", () => {
  it("has no paper for a draft nobody sent", () => {
    expect(formsOf({ status: "draft", submittedAt: null, spentVnd: null })).toEqual([]);
  });

  it("has the request once it is asked for", () => {
    expect(formsOf({ status: "submitted", submittedAt: "t", spentVnd: null })).toEqual(["03"]);
    expect(formsOf({ status: "paid_out", submittedAt: "t", spentVnd: null })).toEqual(["03"]);
  });

  it("prints no request that no longer stands, which would read as a clean paper for money nobody will send", () => {
    for (const status of ["draft", "sent_back", "rejected", "cancelled"] as const) {
      expect(formsOf({ status, submittedAt: "t", spentVnd: null })).toEqual([]);
    }
    expect(formsOf({ status: "approved", submittedAt: "t", spentVnd: null })).toEqual(["03"]);
  });

  it("adds the settlement once its spending is frozen, including nothing spent", () => {
    expect(formsOf({ status: "settled", submittedAt: "t", spentVnd: 8_000_000 })).toEqual(["03", "04"]);
    expect(formsOf({ status: "to_return", submittedAt: "t", spentVnd: 0 })).toEqual(["03", "04"]);
  });
});

describe("isFormKind", () => {
  it("knows the two papers there are", () => {
    expect(isFormKind("03")).toBe(true);
    expect(isFormKind("04")).toBe(true);
    expect(isFormKind("05")).toBe(false);
  });
});

describe("dong", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1.000"],
    [8_000_000, "8.000.000"],
    [1_005_000, "1.005.000"],
    [15_000_000, "15.000.000"],
  ])("writes %s as %s", (vnd, text) => {
    expect(dong(vnd)).toBe(text);
  });
});

describe("dateBoth", () => {
  it("writes the date in both languages, and September as Sep", () => {
    expect(dateBoth("2026-11-03")).toEqual({ vi: "Ngày 3 tháng 11 năm 2026", en: "Nov 3, 2026" });
    expect(dateBoth("2026-09-14").en).toBe("Sep 14, 2026");
  });
});

describe("the request, 03-TT", () => {
  it("writes the amount in figures and in both languages' words, to the dong", () => {
    const form = requestForm(facts());
    expect(form).toMatchObject({ no: "03", ref: "ADV-0007", amount: "8.000.000", wordsVi: "Tám triệu đồng chẵn", purpose: "Venue deposit" });
    expect(form.wordsEn).toMatch(/eight million/i);
  });

  it("signs for whoever approved it and whoever asked, with the person and the time, Vietnamese first", () => {
    expect(requestForm(facts()).signatures).toEqual([
      { vi: "Giám đốc", en: "Director", by: { vi: "Đã duyệt · Dana Example · 14:05 ngày 3/11/2026", en: "Approved · Dana Example · 14:05, Nov 3, 2026" } },
      { vi: "Kế toán trưởng", en: "Chief accountant", by: null },
      { vi: "Phụ trách bộ phận", en: "Head of department", by: null },
      { vi: "Người đề nghị", en: "Requester", by: { vi: "Đã gửi · Avery Example · 09:30 ngày 3/11/2026", en: "Sent · Avery Example · 09:30, Nov 3, 2026" } },
    ]);
  });

  // A record that cannot name the actor must not print somebody else in their place.
  it("says when the record cannot name who acted", () => {
    expect(requestForm(facts({ approved: { by: null, at: "2026-11-03T07:05:00Z" } })).signatures[0].by).toEqual({
      vi: "Đã duyệt · không rõ tên · 14:05 ngày 3/11/2026",
      en: "Approved · name not on record · 14:05, Nov 3, 2026",
    });
  });

  it("uses Vietnam's date, not the server's, when the time crosses midnight there", () => {
    expect(requestForm(facts({ approved: { by: "Dana Example", at: "2026-11-03T18:30:00Z" } })).signatures[0].by?.en).toBe("Approved · Dana Example · 01:30, Nov 4, 2026");
  });

  it("signs for nobody who has not acted", () => {
    expect(requestForm(facts({ approved: null })).signatures[0].by).toBeNull();
  });

  it("states the rule for the deadline until the money moves, never a date that may change", () => {
    // Q7: a trip ending after the payout counts from the trip, so "after the money arrives" was wrong.
    expect(requestForm(facts({ settleBy: null })).settleBy.en).toBe("10 working days after the later of the spend date and the day the money arrives");
    expect(requestForm(facts()).settleBy.en).toBe("Nov 30, 2026");
  });

  it("carries an unset company as absent, so the paper prints no one's name", () => {
    expect(requestForm(facts({ company: { name: null, taxCode: null } })).company).toEqual({ name: null, taxCode: null });
  });
});

describe("the settlement, 04-TT", () => {
  it("shows what was left unspent, and nothing overspent", () => {
    expect(settlementForm(facts())).toMatchObject({ no: "04", advanced: "8.000.000", spent: "7.360.000", unspent: "640.000", overspent: "0" });
  });

  it("shows what was overspent, and nothing unspent", () => {
    expect(settlementForm(facts({ spentVnd: 8_720_000 }))).toMatchObject({ unspent: "0", overspent: "720.000" });
  });

  it("shows neither when it came out exact", () => {
    expect(settlementForm(facts({ spentVnd: 8_000_000 }))).toMatchObject({ unspent: "0", overspent: "0" });
  });

  it("lists each receipt it kept", () => {
    expect(settlementForm(facts()).items).toEqual([{ label: "Venue deposit", amount: "6.400.000" }, { label: "Workbooks", amount: "960.000" }]);
  });

  it("writes what was spent in both languages' words", () => {
    expect(settlementForm(facts({ spentVnd: 8_000_000 }))).toMatchObject({ spentWordsVi: "Tám triệu đồng chẵn" });
    expect(settlementForm(facts({ spentVnd: 8_000_000 })).spentWordsEn).toMatch(/eight million/i);
  });

  it("can write nothing spent, for an advance returned whole", () => {
    expect(settlementForm(facts({ spentVnd: 0 })).spentWordsVi).toBeTruthy();
  });

  // The paper is a legal record, so each line names only someone who acted in that role.
  it("signs the approver as Director and Finance's record as Chief accountant, and leaves the rest for a pen", () => {
    expect(settlementForm(facts()).signatures).toEqual([
      { vi: "Giám đốc", en: "Director", by: { vi: "Đã duyệt · Dana Example · 10:00 ngày 16/11/2026", en: "Approved · Dana Example · 10:00, Nov 16, 2026" } },
      { vi: "Kế toán trưởng", en: "Chief accountant", by: { vi: "Đã ghi nhận · Blair Example · 16:45 ngày 18/11/2026", en: "Recorded · Blair Example · 16:45, Nov 18, 2026" } },
      { vi: "Kế toán thanh toán", en: "Payments accountant", by: null },
      { vi: "Người đề nghị", en: "Requester", by: { vi: "Đã gửi · Avery Example · 08:00 ngày 14/11/2026", en: "Sent · Avery Example · 08:00, Nov 14, 2026" } },
    ]);
  });

  // A Finance checker approving under the limit is not the Director, and the record cannot say
  // which office they hold, so the paper says they approved it and names no office.
  it("prints an approval by a check with no office, and leaves the Director line for a pen", () => {
    const form = settlementForm(facts({ settlementApproved: null, checkApproved: { by: "Blair Example", at: "2026-11-16T03:00:00Z" }, returnRecorded: null }));
    expect(form.signatures[0].by).toBeNull();
    expect(form.signatures[1].by).toBeNull();
    expect(form.approvalNote).toEqual({ vi: "Đã duyệt · Blair Example · 10:00 ngày 16/11/2026", en: "Approved · Blair Example · 10:00, Nov 16, 2026" });
    expect(settlementForm(facts()).approvalNote).toBeNull();
  });

  it("never prints the owner in another role when the advance was returned unspent", () => {
    const form = settlementForm(facts({ settlementApproved: null, returnRecorded: null, spentVnd: 0 }));
    expect(form.signatures.slice(0, 3).map((s) => s.by)).toEqual([null, null, null]);
    expect(form.signatures[3].by?.en).toContain("Avery Example");
  });
});
