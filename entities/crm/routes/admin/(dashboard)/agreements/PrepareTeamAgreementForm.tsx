"use client";

import { useState } from "react";
import type { prepareAgreementAction } from "./actions";
import { AGREEMENT_FILE_ACCEPT, readPickedFile, type PickedFile } from "./agreement-file";

// Admin → Agreements' "Prepare agreement" form for a team member
// (E-signature, AG.1): who it is for, whether it is an employee's or a
// contractor's agreement, the title and the signer's title as the agreement
// names them, and the Markdown or PDF file. The team member signs it in the
// Team pages with their own login. The type starts from their team record
// (a contract is a contractor) and can be changed.

type PrepareInput = Parameters<typeof prepareAgreementAction>[0];

export type TeamMemberOption = { id: string; name: string; contractor: boolean };

export function PrepareTeamAgreementForm({
  members,
  pending,
  onCancel,
  onSubmit,
}: {
  members: TeamMemberOption[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: PrepareInput) => void;
}) {
  const [memberId, setMemberId] = useState("");
  const [type, setType] = useState<"employee" | "contractor">("contractor");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [signerTitle, setSignerTitle] = useState("");

  return (
    <form
      className="admin-form u-mb-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) {
          setFileError("Choose the agreement's file.");
          return;
        }
        onSubmit({ type, teamMemberId: memberId, ...file, title, signerTitle });
      }}
    >
      <div className="admin-field">
        <label className="admin-label" htmlFor="team-agreement-member">Team member</label>
        <select
          id="team-agreement-member"
          className="admin-input"
          value={memberId}
          onChange={(e) => {
            setMemberId(e.target.value);
            const m = members.find((x) => x.id === e.target.value);
            if (m) setType(m.contractor ? "contractor" : "employee");
          }}
          required
        >
          <option value="">Choose who signs it</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.contractor ? " (contractor)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="team-agreement-type">Type</label>
        <select id="team-agreement-type" className="admin-input" value={type} onChange={(e) => setType(e.target.value === "employee" ? "employee" : "contractor")}>
          <option value="contractor">Contractor agreement</option>
          <option value="employee">Employee agreement</option>
        </select>
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="team-agreement-file">Agreement (Markdown or PDF)</label>
        <input
          id="team-agreement-file"
          type="file"
          accept={AGREEMENT_FILE_ACCEPT}
          className="admin-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setFileError(null);
            setFile(null);
            if (!f) return;
            const r = await readPickedFile(f);
            if (!r.ok) return setFileError(r.error);
            setFile(r.file);
          }}
        />
        {fileError && <div className="admin-alert admin-alert--err u-mt-2">{fileError}</div>}
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="team-agreement-title">Title</label>
        <input id="team-agreement-title" className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Training Service Agreement" required />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="team-agreement-signer-title">Their title, as the agreement names it</label>
        <input id="team-agreement-signer-title" className="admin-input" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="English Trainer" required />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending || !memberId}>
          Prepare
        </button>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
