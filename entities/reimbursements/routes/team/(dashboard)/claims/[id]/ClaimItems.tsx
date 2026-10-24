"use client";

import type { MayProp } from "@/kernel/identity/may-prop";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLAIM_CATEGORY_LABEL } from "@/entities/reimbursements/lib/categories";
import type { OwnerRemoval } from "@/entities/reimbursements/lib/retention-rules";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";
import { ItemValue, LostReceiptNote } from "@/entities/reimbursements/ui/ItemValue";
import type { RebillCompany } from "@/entities/reimbursements/lib/rebill-companies";
import { ItemTags, RemovedNote } from "@/entities/reimbursements/ui/ItemTags";
import { ItemDocuments } from "./ItemDocuments";
import { ItemForm } from "./ItemForm";
import { ReceiptDrop } from "./ReceiptDrop";
import { RemoveItem } from "./RemoveItem";
import { ReceiptFlags } from "@/entities/reimbursements/ui/ReceiptFlags";

// The claim's receipts. While the claim is the owner's to change (draft, or
// sent back) each one can be edited or taken off and new ones added, one at a
// time, over as many days as a trip takes. Otherwise they are shown as they
// were submitted. Once a claim has been submitted nothing on it is deleted
// (plan §10): a receipt taken off it stays, marked removed, and is never
// edited again, and `removal` says which way this claim takes one off.
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

  return (
    <div className="admin-list">
      {items.length === 0 && <div className="admin-empty">No receipts yet.{editable ? " Add the first one below." : ""}</div>}
      {items.map((item) =>
        editing === item.id ? (
          <div key={item.id} className="admin-list-row">
            <div className="admin-list-main">
              <ItemForm claimId={claimId} item={item} companies={companies} onDone={done} />
            </div>
          </div>
        ) : (
          <div key={item.id} className="admin-list-row">
            <div className="admin-list-main u-stack u-gap-1">
              <div className="admin-list-title">{item.label}</div>
              <div className="admin-list-sub">
                {CLAIM_CATEGORY_LABEL[item.category]}
                {item.description && item.seller ? ` · ${item.description}` : ""}
                {item.boughtInVietnam ? " · bought in Vietnam" : " · bought abroad"}
              </div>
              <ItemTags item={item} />
              {item.lostReceiptNote && <LostReceiptNote note={item.lostReceiptNote} />}
              <RemovedNote removed={item.removed} />
              {item.declineReason && <div className="admin-alert admin-alert--err">Declined: {item.declineReason}</div>}
              {item.flags.length > 0 && <ReceiptFlags flags={item.flags} />}
              <ItemDocuments claimId={claimId} item={item} removal={item.removed ? null : removal} />
            </div>
            <div className="admin-list-aside">
              <ItemValue item={item} />
              {removal !== null && !item.removed && (
                <span className="u-row u-gap-1 u-items-start">
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing(item.id)}>
                    Edit
                  </button>
                  <RemoveItem claimId={claimId} item={item} removal={removal} may={may} />
                </span>
              )}
            </div>
          </div>
        ),
      )}
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
