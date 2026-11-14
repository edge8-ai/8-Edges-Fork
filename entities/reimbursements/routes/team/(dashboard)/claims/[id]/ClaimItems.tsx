"use client";

import type { MayProp } from "@/kernel/identity/may-prop";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { CLAIM_CATEGORY_LABEL } from "@/entities/reimbursements/lib/categories";
import { PAID_HOW_LABEL } from "@/entities/reimbursements/lib/claim-labels";
import { joinTargets, loneKind, type JoinKind } from "@/entities/reimbursements/lib/join-rules";
import type { OwnerRemoval } from "@/entities/reimbursements/lib/retention-rules";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";
import { ItemValue, LostReceiptNote } from "@/entities/reimbursements/ui/ItemValue";
import type { RebillCompany } from "@/entities/reimbursements/lib/rebill-companies";
import { ItemTags, RemovedNote } from "@/entities/reimbursements/ui/ItemTags";
import { AmountsForm } from "./AmountsForm";
import { ItemDocuments } from "./ItemDocuments";
import { ItemForm } from "./ItemForm";
import { JoinToReceipt } from "./JoinToReceipt";
import { ReceiptDrop } from "./ReceiptDrop";
import { RemoveItem } from "./RemoveItem";
import { ReceiptFlags } from "@/entities/reimbursements/ui/ReceiptFlags";

// The claim's receipts. While the claim is the owner's to change (draft, or
// sent back) files go in through the one drop zone, in any order, and each is
// read for what it is (RB.26). A row shows its files and one action, Edit; a
// bank deduction that came in on its own also shows "Paid for [receipt] Join",
// and a red invoice on its own "Red invoice for [receipt] Join"; nothing joins
// until its owner presses it. Edit holds the amounts, the
// files and Remove; a receipt typed by hand with no file keeps the whole form,
// having nothing to read its fields from. Otherwise the receipts are shown as
// they were submitted. Once a claim has been submitted nothing on it is
// deleted (plan §10): a receipt taken off it stays, marked removed, and is
// never edited again, and `removal` says which way this claim takes one off.
export function ClaimItems({
  claimId,
  items,
  removal,
  companies,
  may,
}: {
  claimId: string;
  items: MyItem[];
  /** From `ownerCan(claim).remove`: null while the claim is not the owner's to change. */
  removal: OwnerRemoval;
  companies: RebillCompany[];
  /** What the viewer may do, passed on to the controls that call actions (ADR 0014). */
  may: MayProp;
}) {
  const editable = removal !== null;
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const done = () => {
    setEditing(null);
    router.refresh();
  };
  // The receipts a lone row may join, nearest first; a removed receipt is never
  // offered. The join rules read each row's removal record as it is and hand
  // back these same rows, so the picker gets them without a copy or a lookup.
  const targetsFor = (item: MyItem, kind: JoinKind): MyItem[] => joinTargets(item, kind, items.filter((i) => i.id !== item.id));

  return (
    <div className="admin-list">
      {items.length === 0 && <div className="admin-empty">No receipts yet.{editable ? " Add the first one below." : ""}</div>}
      {items.map((item) => {
        const kind = loneKind(item.documents);
        const lone = kind === "bank_deduction";
        const open = editable && !item.removed;
        if (editing === item.id) {
          return (
            <div key={item.id} className="admin-list-row">
              <div className="admin-list-main">
                {item.documents.length > 0 ? (
                  <AmountsForm claimId={claimId} item={item} removal={removal} may={may} onDone={done} />
                ) : (
                  <div className="u-stack u-gap-2">
                    <ItemForm claimId={claimId} item={item} companies={companies} onDone={done} />
                    {removal && (
                      <span className="u-self-end">
                        <RemoveItem claimId={claimId} item={item} removal={removal} may={may} label="Remove receipt" className="admin-btn admin-btn--danger" />
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        }
        const targets = kind && open ? targetsFor(item, kind) : [];
        return (
          <div key={item.id} className="admin-list-row">
            <div className="admin-list-main u-stack u-gap-1">
              <div className="admin-list-title">{item.label}</div>
              <div className="admin-list-sub">
                {lone ? (
                  "Bank deduction"
                ) : (
                  <>
                    {CLAIM_CATEGORY_LABEL[item.category]}
                    {item.description && item.seller ? ` · ${item.description}` : ""}
                    {item.boughtInVietnam ? " · bought in Vietnam" : " · bought abroad"}
                    {item.paidHow && ` · ${PAID_HOW_LABEL[item.paidHow].toLowerCase()}`}
                  </>
                )}
              </div>
              {lone && open && (
                <span>
                  <Badge tone="warn">Not joined to a receipt</Badge>
                </span>
              )}
              <ItemTags item={item} />
              {item.lostReceiptNote && <LostReceiptNote note={item.lostReceiptNote} />}
              <RemovedNote removed={item.removed} />
              {item.declineReason && <div className="admin-alert admin-alert--err">Declined: {item.declineReason}</div>}
              {item.flags.length > 0 && <ReceiptFlags flags={item.flags} />}
              <ItemDocuments item={item} />
              {kind && open && <JoinToReceipt key={targets.map((t) => t.id).join()} claimId={claimId} item={item} kind={kind} targets={targets} may={may} />}
            </div>
            <div className="admin-list-aside admin-list-aside--wraps">
              <ItemValue item={item} declined={item.declined} />
              {lone && <span className="admin-list-sub">What your bank took</span>}
              {open && (
                <span className="u-row u-gap-1 u-items-start">
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing(item.id)}>
                    Edit
                  </button>
                </span>
              )}
            </div>
          </div>
        );
      })}
      {editable && (
        <div className="admin-list-row">
          <div className="admin-list-main">
            {editing === "new" ? (
              <ItemForm claimId={claimId} companies={companies} onDone={done} />
            ) : (
              <div className="u-stack u-gap-2">
                <ReceiptDrop claimId={claimId} />
                <button type="button" className="admin-btn u-w-auto" onClick={() => setEditing("new")}>
                  + Add new
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
