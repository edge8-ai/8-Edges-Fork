"use client";

import { useState, useTransition } from "react";
import { CLAIM_CATEGORIES, CLAIM_CATEGORY_LABEL, type ClaimCategory } from "@/entities/reimbursements/lib/categories";
import { boughtInVietnamByDefault, olderThan90Days } from "@/entities/reimbursements/lib/claim-rules";
import { CLAIM_CURRENCIES, minorFromTyped, typedFromMinor } from "@/entities/reimbursements/lib/currencies";
import type { RebillCompany } from "@/entities/reimbursements/lib/rebill-companies";
import { saigonToday } from "@/kernel/config/dates";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";
import { addOwnItem, updateOwnItem } from "../actions";

// One receipt's fields: what it was, the seller, the date, the category, the
// amount in the currency it was paid in, and whether it was bought in
// Vietnam. The same form adds an item and changes one. A receipt in another
// currency is converted to VND at the bank's selling rate on its date (RB.10);
// what the person's card actually charged, when they enter it, wins. RB.11
// adds the rebill tag: tick it and name the client the receipt is to be
// billed to.

type Draft = {
  description: string;
  seller: string;
  boughtOn: string;
  category: ClaimCategory;
  amount: string;
  currency: string;
  /** What the card charged in VND, for a receipt in another currency; empty when not known. */
  chargedVnd: string;
  boughtInVietnam: boolean;
  lostReceiptNote: string;
  rebill: boolean;
  rebillCompanyId: string;
};

function draftOf(item?: MyItem): Draft {
  return {
    description: item?.description ?? "",
    seller: item?.seller ?? "",
    boughtOn: item?.boughtOn ?? "",
    category: item?.category ?? "transport",
    // A dropped receipt starts at 0, which means "no amount yet": the field shows empty.
    amount: item && item.amount > 0 ? typedFromMinor(item.amount, item.currency) : "",
    currency: item?.currency ?? "vnd",
    chargedVnd: item?.chargedVnd ? String(item.chargedVnd) : "",
    // A new receipt starts in dong, bought in Vietnam; picking another
    // currency moves it abroad (boughtInVietnamByDefault), and the person can
    // still change it.
    boughtInVietnam: item?.boughtInVietnam ?? boughtInVietnamByDefault("vnd"),
    lostReceiptNote: item?.lostReceiptNote ?? "",
    rebill: item?.rebill ?? false,
    rebillCompanyId: item?.rebillCompany?.id ?? "",
  };
}

/** Whole dong from what was typed: "1,840,000" and "1840000" are the same amount; empty is none. */
const dongOrNull = (typed: string) => (typed.trim() ? minorFromTyped(typed, "vnd") : null);

export function ItemForm({ claimId, item, companies, onDone }: { claimId: string; item?: MyItem; companies: RebillCompany[]; onDone: () => void }) {
  const [d, setD] = useState<Draft>(() => draftOf(item));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const id = (name: string) => `${item?.id ?? "new"}-${name}`;

  const save = () =>
    start(async () => {
      setError(null);
      const amount = minorFromTyped(d.amount, d.currency);
      if (amount === null) return setError(`Enter the amount in ${d.currency.toUpperCase()}${d.currency === "vnd" ? ", in whole dong" : ""}.`);
      const foreign = d.currency !== "vnd";
      const chargedVnd = foreign ? dongOrNull(d.chargedVnd) : null;
      if (foreign && d.chargedVnd.trim() && chargedVnd === null) return setError("Enter what the card charged in whole dong.");
      const input = {
        description: d.description,
        seller: d.seller,
        boughtOn: d.boughtOn,
        category: d.category,
        amount,
        currency: d.currency,
        chargedVnd,
        boughtInVietnam: d.boughtInVietnam,
        lostReceiptNote: d.boughtInVietnam ? "" : d.lostReceiptNote,
        rebill: d.rebill,
        rebillCompanyId: d.rebill ? d.rebillCompanyId : "",
      };
      const res = item ? await updateOwnItem(claimId, item.id, input) : await addOwnItem(claimId, input);
      if (!res.ok) return setError(res.error);
      onDone();
    });

  return (
    <div className="u-stack u-gap-4">
      <div className="u-grid-2">
        <div className="admin-field">
          <label className="admin-label" htmlFor={id("desc")}>What it was</label>
          <input id={id("desc")} className="admin-input" value={d.description} placeholder="Taxi to the airport" onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor={id("seller")}>Seller</label>
          <input id={id("seller")} className="admin-input" value={d.seller} placeholder="Grab" onChange={(e) => set("seller", e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor={id("date")}>Date</label>
          <input id={id("date")} type="date" className="admin-input" value={d.boughtOn} onChange={(e) => set("boughtOn", e.target.value)} />
          {olderThan90Days(d.boughtOn || null, saigonToday()) && (
            <span className="admin-hint">More than 90 days ago. You can still claim it; the checker will see the date.</span>
          )}
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor={id("cat")}>Category</label>
          <select id={id("cat")} className="admin-select" value={d.category} onChange={(e) => set("category", e.target.value as ClaimCategory)}>
            {CLAIM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CLAIM_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor={id("cur")}>Currency</label>
          <select
            id={id("cur")}
            className="admin-select"
            value={d.currency}
            onChange={(e) => {
              const currency = e.target.value;
              setD((prev) => ({ ...prev, currency, boughtInVietnam: boughtInVietnamByDefault(currency) }));
            }}
          >
            {CLAIM_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor={id("amount")}>Amount ({d.currency.toUpperCase()})</label>
          <input
            id={id("amount")}
            className="admin-input u-tabular"
            inputMode="decimal"
            value={d.amount}
            placeholder={d.currency === "vnd" ? "126,000" : "62.80"}
            onChange={(e) => set("amount", e.target.value)}
          />
          {d.currency !== "vnd" && <span className="admin-hint">Converted to VND at Techcombank&apos;s selling rate on the date above.</span>}
        </div>
        {d.currency !== "vnd" && (
          <div className="admin-field">
            <label className="admin-label" htmlFor={id("charged")}>What your card charged (₫), if you know it</label>
            <input
              id={id("charged")}
              className="admin-input u-tabular"
              inputMode="numeric"
              value={d.chargedVnd}
              placeholder="1,170,000"
              onChange={(e) => set("chargedVnd", e.target.value)}
            />
            <span className="admin-hint">From your card statement. When you enter it, it is what you are paid back, instead of the bank&apos;s rate.</span>
          </div>
        )}
        <div className="admin-field">
          <span className="admin-label">Where</span>
          <label className="u-row u-gap-1 u-items-center">
            <input type="checkbox" checked={d.boughtInVietnam} onChange={(e) => set("boughtInVietnam", e.target.checked)} />
            Bought in Vietnam
          </label>
        </div>
      </div>
      {!d.boughtInVietnam && (
        <div className="admin-field">
          <label className="admin-label" htmlFor={id("lost")}>Lost the receipt? Write why</label>
          <textarea
            id={id("lost")}
            className="admin-textarea"
            value={d.lostReceiptNote}
            placeholder="Only if there is no receipt. The checker sees this highlighted."
            onChange={(e) => set("lostReceiptNote", e.target.value)}
          />
        </div>
      )}
      <div className="admin-field">
        <label className="u-row u-gap-1 u-items-center">
          <input type="checkbox" checked={d.rebill} onChange={(e) => set("rebill", e.target.checked)} />
          Rebill to a client
        </label>
        {d.rebill && (
          <select
            id={id("rebill")}
            aria-label="Client to rebill"
            className="admin-select"
            value={d.rebillCompanyId}
            onChange={(e) => set("rebillCompanyId", e.target.value)}
          >
            <option value="">Pick the client…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={save}>
          {pending ? "Saving…" : item ? "Save receipt" : "Add receipt"}
        </button>
        <button type="button" className="admin-btn" disabled={pending} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
