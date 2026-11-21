import Link from "next/link";
import { requestForm, settlementForm, type FormFacts, type FormKind } from "../lib/advance-forms";
import { PrintButton } from "./PrintButton";

// One paper, as it prints: Vietnamese first with English beside it, the approvals on record as
// its signatures (design section 9). The circular it cites came from the plan, and the
// accountant confirms it before anyone relies on this.
function Both({ vi, en }: { vi: string; en: string }) {
  return <>{vi}<span className="adv-paper-en">{en}</span></>;
}

export function AdvancePaper({ kind, facts, back }: { kind: FormKind; facts: FormFacts; back: string }) {
  const form = kind === "03" ? requestForm(facts) : settlementForm(facts);
  return (
    <>
      <div className="adv-noprint u-row u-gap-1 u-mb-3">
        <Link className="admin-btn" href={back}>← Back</Link>
        <PrintButton />
      </div>
      <article className="adv-paper">
        <header className="adv-paper-head">
          <div>
            <b>{form.company.name ?? ""}</b>
            {form.company.taxCode && <div>MST {form.company.taxCode}</div>}
          </div>
          <div className="adv-paper-no">
            <b>Mẫu số {form.no}-TT</b>
            <span className="adv-paper-en">Form {form.no}-TT</span>
            (Ban hành kèm theo Thông tư 99/2025/TT-BTC)
            <span className="adv-paper-en">Issued with Circular 99/2025/TT-BTC</span>
          </div>
        </header>
        <h1 className="adv-paper-title">{form.vi}</h1>
        <div className="adv-paper-sub">{form.en}</div>
        <div className="adv-paper-sub">
          Số {form.ref}{form.date ? ` · ${form.date.vi}` : ""}
          <span className="adv-paper-en">No. {form.ref}{form.date ? ` · ${form.date.en}` : ""}</span>
        </div>
        {form.no === "03" ? (
          <>
            <p>Kính gửi: Giám đốc {form.company.name ?? ""}<span className="adv-paper-en">To: the Director</span></p>
            <p><Both vi="Tên tôi là" en="Name" /> <b>{form.owner}</b></p>
            <p><Both vi="Đề nghị cho tạm ứng số tiền" en="Amount requested" /> <b>{form.amount} đồng</b></p>
            <p><Both vi="Viết bằng chữ" en="In words" /> {form.wordsVi}<span className="adv-paper-en">{form.wordsEn}</span></p>
            <p><Both vi="Lý do tạm ứng" en="Purpose" /> {form.purpose}</p>
            <p><Both vi="Thời hạn thanh toán" en="Settle by" /> {form.settleBy.vi}<span className="adv-paper-en">{form.settleBy.en}</span></p>
          </>
        ) : (
          <>
            <p><Both vi="Họ tên người thanh toán" en="Name" /> <b>{form.owner}</b></p>
            <table className="adv-paper-table">
              <thead><tr><th><Both vi="Diễn giải" en="Description" /></th><th className="adv-paper-num"><Both vi="Số tiền (đ)" en="Amount (VND)" /></th></tr></thead>
              <tbody>
                <tr><td><b>I. Số tiền tạm ứng</b><span className="adv-paper-en">I. Amount advanced</span></td><td className="adv-paper-num">{form.advanced}</td></tr>
                <tr><td><b>II. Số tiền đã chi</b><span className="adv-paper-en">II. Amount spent</span></td><td className="adv-paper-num">{form.spent}</td></tr>
                {form.items.map((item, i) => (
                  <tr key={`${item.label}-${i}`}><td className="adv-paper-item">{item.label}</td><td className="adv-paper-num">{item.amount}</td></tr>
                ))}
                <tr><td>1. Số tạm ứng chi không hết (I − II)<span className="adv-paper-en">Unspent, to be returned</span></td><td className="adv-paper-num">{form.unspent}</td></tr>
                <tr><td>2. Chi quá số tạm ứng (II − I)<span className="adv-paper-en">Overspent, paid by the company</span></td><td className="adv-paper-num">{form.overspent}</td></tr>
              </tbody>
            </table>
            <p><Both vi="Số tiền đã chi, viết bằng chữ" en="Amount spent, in words" /> {form.spentWordsVi}<span className="adv-paper-en">{form.spentWordsEn}</span></p>
          </>
        )}
        <div className="adv-paper-signs">
          {form.signatures.map((s) => (
            <div key={s.vi}>
              <b>{s.vi}</b>
              <span className="adv-paper-en">{s.en}</span>
              {s.by && <em>{s.by.vi}<span className="adv-paper-en">{s.by.en}</span></em>}
            </div>
          ))}
        </div>
        {form.no === "04" && form.approvalNote && (
          <p className="adv-paper-note">
            {form.approvalNote.vi}
            <span className="adv-paper-en">{form.approvalNote.en}</span>
          </p>
        )}
        <p className="adv-paper-note">
          Được phê duyệt điện tử; các phê duyệt được ghi nhận thay cho chữ ký.
          <span className="adv-paper-en">Approved electronically; the recorded approvals are the signatures.</span>
        </p>
      </article>
    </>
  );
}

/** The papers an advance has, as links, for its pages. */
export function AdvanceFormLinks({ kinds, base }: { kinds: FormKind[]; base: string }) {
  if (kinds.length === 0) return null;
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">Forms</h2>
      <p className="admin-hint u-m-0">Printed from this record. The approvals on it are the signatures.</p>
      <div className="u-row u-gap-1 u-mt-4 u-wrap">
        {kinds.map((kind) => (
          <Link key={kind} className="admin-btn admin-btn--sm" href={`${base}/printable/${kind}`}>{kind === "03" ? "03-TT request" : "04-TT settlement"}</Link>
        ))}
      </div>
    </section>
  );
}

