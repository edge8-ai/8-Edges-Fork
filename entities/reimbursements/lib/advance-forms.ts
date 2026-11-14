// The two papers an advance prints (AD.11, design section 9), drawn from the record: 03-TT
// when it is asked for, and 04-TT once it is settled. Vietnamese first, English beside it,
// each approval printed as its signature. Pure and client-safe, so the words can be walked in
// a test without a page.
//
// The form numbers and the circular they cite came from the plan unverified. The accountant
// confirms them before this is relied on, which the AD.11 card keeps open.
import { BUSINESS_TIME_ZONE, businessDate } from "@/kernel/config/dates";
import { SETTLE_WORKING_DAYS } from "./advance-policy";
import { advanceRef, type AdvanceStatus } from "./advance-rules";
import { enWords, vnWords } from "./vn-words";

export type FormKind = "03" | "04";

export function isFormKind(value: string): value is FormKind {
  return value === "03" || value === "04";
}

/** The statuses a request stands at: withdrawn, sent back, rejected or cancelled, it asks for nothing, so it prints nothing. */
const REQUEST_STANDS: readonly AdvanceStatus[] = ["submitted", "approved", "paid_out", "to_return", "settled"];

/** Which papers exist yet: 03-TT while the request stands, 04-TT once its spending is frozen. */
export function formsOf(a: { status: AdvanceStatus; submittedAt: string | null; spentVnd: number | null }): FormKind[] {
  return [...(a.submittedAt && REQUEST_STANDS.includes(a.status) ? (["03"] as const) : []), ...(a.spentVnd !== null ? (["04"] as const) : [])];
}

/** An amount as a Vietnamese form writes it: 8.000.000. */
export function dong(vnd: number): string {
  return String(Math.trunc(vnd)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A YYYY-MM-DD business date in both languages, from a fixed list, because en-GB's short month prints "Sept". */
export function dateBoth(on: string): { vi: string; en: string } {
  const [y, m, d] = on.split("-").map(Number);
  return { vi: `Ngày ${d} tháng ${m} năm ${y}`, en: `${MONTHS[m - 1]} ${d}, ${y}` };
}

/** A line on the paper in both languages, Vietnamese first. */
type Both = { vi: string; en: string };

type Signature = Both & { by: Both | null };

/** Who did something and when. No name means the record could not name them, which is said, never filled in with someone else. */
export type Signed = { by: string | null; at: string };

export type FormFacts = {
  refNo: number;
  owner: string;
  purpose: string;
  amountVnd: number;
  settleBy: string | null;
  company: { name: string | null; taxCode: string | null };
  /** When it was asked for, an instant. */
  asked: { at: string } | null;
  /** Who approved the advance. */
  approved: Signed | null;
  /** The approver who decided its settlement, which closed it. Nobody does for one returned unspent. */
  settlementApproved: Signed | null;
  /** Whoever approved it by their check, under the limit. The record does not say which office that is. */
  checkApproved: Signed | null;
  /** Who recorded the money coming back, the last of them when it came in parts. */
  returnRecorded: Signed | null;
  /** When the owner sent the settlement, or returned the advance unspent. */
  ownerSent: { at: string } | null;
  /** The date the settlement paper carries: the day it closed, a business date. */
  closedOn: string | null;
  spentVnd: number | null;
  items: { label: string; vnd: number }[];
};

type Base = { no: FormKind; vi: string; en: string; ref: string; date: { vi: string; en: string } | null; company: FormFacts["company"]; signatures: Signature[] };

export type RequestForm = Base & { no: "03"; owner: string; amount: string; wordsVi: string; wordsEn: string; purpose: string; settleBy: { vi: string; en: string } };

export type SettlementForm = Base & { no: "04"; owner: string; advanced: string; spent: string; spentWordsVi: string; spentWordsEn: string; approvalNote: Both | null; items: { label: string; amount: string }[]; unspent: string; overspent: string };

const saigonTime = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const NO_NAME: Both = { vi: "không rõ tên", en: "name not on record" };
const APPROVED: Both = { vi: "Đã duyệt", en: "Approved" };
const SENT: Both = { vi: "Đã gửi", en: "Sent" };
const RECORDED: Both = { vi: "Đã ghi nhận", en: "Recorded" };

/** An electronic signature: what was done, by whom, and when in Vietnam's time (design section 9). */
function signed(what: Both, who: Signed | null): Both | null {
  if (!who) return null;
  const time = saigonTime.format(new Date(who.at));
  const [y, m, d] = businessDate(who.at).split("-").map(Number);
  const on = dateBoth(businessDate(who.at));
  return {
    vi: `${what.vi} · ${who.by ?? NO_NAME.vi} · ${time} ngày ${d}/${m}/${y}`,
    en: `${what.en} · ${who.by ?? NO_NAME.en} · ${time}, ${on.en}`,
  };
}

export function requestForm(f: FormFacts): RequestForm {
  return {
    no: "03",
    vi: "GIẤY ĐỀ NGHỊ TẠM ỨNG",
    en: "ADVANCE REQUEST",
    ref: advanceRef(f.refNo),
    date: f.asked ? dateBoth(businessDate(f.asked.at)) : null,
    company: f.company,
    owner: f.owner,
    amount: dong(f.amountVnd),
    wordsVi: vnWords(f.amountVnd),
    wordsEn: enWords(f.amountVnd),
    purpose: f.purpose,
    // Before the money moves the date is not set, so the paper states the rule (Q7) rather than a guess.
    settleBy: f.settleBy
      ? dateBoth(f.settleBy)
      : {
          vi: `${SETTLE_WORKING_DAYS} ngày làm việc kể từ ngày chi hoặc ngày nhận tiền, tùy ngày nào muộn hơn`,
          en: `${SETTLE_WORKING_DAYS} working days after the later of the spend date and the day the money arrives`,
        },
    signatures: [
      { vi: "Giám đốc", en: "Director", by: signed(APPROVED, f.approved) },
      { vi: "Kế toán trưởng", en: "Chief accountant", by: null },
      { vi: "Phụ trách bộ phận", en: "Head of department", by: null },
      { vi: "Người đề nghị", en: "Requester", by: signed(SENT, f.asked ? { by: f.owner, at: f.asked.at } : null) },
    ],
  };
}

export function settlementForm(f: FormFacts): SettlementForm {
  const spent = f.spentVnd ?? 0;
  return {
    no: "04",
    vi: "GIẤY THANH TOÁN TIỀN TẠM ỨNG",
    en: "ADVANCE SETTLEMENT",
    ref: advanceRef(f.refNo),
    date: f.closedOn ? dateBoth(f.closedOn) : null,
    company: f.company,
    owner: f.owner,
    advanced: dong(f.amountVnd),
    spent: dong(spent),
    spentWordsVi: vnWords(spent),
    spentWordsEn: enWords(spent),
    approvalNote: signed(APPROVED, f.checkApproved),
    items: f.items.map((i) => ({ label: i.label, amount: dong(i.vnd) })),
    unspent: dong(Math.max(0, f.amountVnd - spent)),
    overspent: dong(Math.max(0, spent - f.amountVnd)),
    signatures: [
      // Each line carries only who acted in that role: the approver who decided the settlement as
      // Director, whoever recorded the money back as Chief accountant, and the rest for a pen. A
      // check under the limit approves it too, but a checker is not the Director and the record
      // cannot say what they are, so `approvalNote` prints that with no office. The accountant
      // confirms this mapping with the form (the AD.11 card).
      { vi: "Giám đốc", en: "Director", by: signed(APPROVED, f.settlementApproved) },
      { vi: "Kế toán trưởng", en: "Chief accountant", by: signed(RECORDED, f.returnRecorded) },
      { vi: "Kế toán thanh toán", en: "Payments accountant", by: null },
      { vi: "Người đề nghị", en: "Requester", by: signed(SENT, f.ownerSent ? { by: f.owner, at: f.ownerSent.at } : null) },
    ],
  };
}
