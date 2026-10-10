"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRole } from "./actions";

// A one-person duty ("Reimbursement approver") is a role of its own, never a
// permission granted to a person directly (ADR 0013): create it, give it its
// permissions, then grant it.
export function NewRoleForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  return (
    <div className="admin-card admin-section-card u-mb-5">
      <h2 className="admin-card-title">New role</h2>
      {banner && <div className={`admin-alert admin-alert--${banner.tone}`}>{banner.text}</div>}
      <form
        className="u-row u-wrap u-items-end u-gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBanner(null);
          startTransition(async () => {
            const res = await createRole(name, description);
            setBanner(res.ok ? { tone: "ok", text: res.message ?? "Created." } : { tone: "err", text: res.error });
            if (res.ok) {
              setName("");
              setDescription("");
              router.refresh();
            }
          });
        }}
      >
        <label className="admin-field u-flex-fixed u-mb-0">
          <span className="admin-label">Name</span>
          <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Reimbursement approver" disabled={pending} />
        </label>
        <label className="admin-field u-flex-2 u-mb-0">
          <span className="admin-label">What holding it means</span>
          <input className="admin-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Approves team members' reimbursement claims." disabled={pending} />
        </label>
        <button type="submit" className="admin-btn" disabled={pending || name.trim().length < 2 || description.trim().length < 3}>
          Create role
        </button>
      </form>
    </div>
  );
}
