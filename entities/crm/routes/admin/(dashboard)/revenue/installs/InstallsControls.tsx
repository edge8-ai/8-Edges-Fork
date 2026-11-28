"use client";

import { useState } from "react";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { MayProp } from "@/kernel/identity/may-prop";
import {
  INSTALL_SOURCES,
  INSTALL_SOURCE_LABEL,
  INSTALL_STATUSES,
  INSTALL_STATUS_LABEL,
  type InstallSource,
  type InstallStatus,
} from "@/entities/crm/lib/installs-shapes";
import { archiveEightEdgesInstall, recordEightEdgesInstall, updateEightEdgesInstall } from "@/entities/crm/lib/installs-actions";

// The Installs page's two controls: the form that records a download (or an
// install), and each row's editor that moves it along or archives it. Both
// render only for someone who may write; the actions ask again.

const ATOM = "crm.pipeline";

function Note({ note }: { note: { tone: "ok" | "err"; text: string } | null }) {
  if (!note) return null;
  return <div className={`admin-alert admin-alert--${note.tone === "ok" ? "ok" : "err"} u-mt-2`}>{note.text}</div>;
}

export function RecordInstallForm({ may, today }: { may: MayProp; today: string }) {
  const { note, setNote, pending, startTransition, router } = useActionRunner();
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [downloadedOn, setDownloadedOn] = useState(today);
  const [source, setSource] = useState<InstallSource>("website");
  const [status, setStatus] = useState<InstallStatus>("downloaded");
  const [installedOn, setInstalledOn] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");

  if (!may[ATOM]) return null;

  // The action says what it matched (an existing contact, which company), so
  // the recorder sees a match they did not expect; useActionRunner's fixed
  // message would hide it.
  function submit() {
    setNote(null);
    startTransition(async () => {
      const res = await recordEightEdgesInstall({ contactName, email, companyName, downloadedOn, source, status, installedOn, evidenceUrl, notes });
      if (!res.ok) {
        setNote({ tone: "err", text: res.error });
        return;
      }
      setNote({ tone: "ok", text: res.message });
      setContactName("");
      setEmail("");
      setCompanyName("");
      setStatus("downloaded");
      setInstalledOn("");
      setEvidenceUrl("");
      setNotes("");
      router.refresh();
    });
  }

  return (
    <div className="admin-section-card u-mb-5">
      <h2 className="admin-card-title">Record a download</h2>
      <div className="admin-form-row u-row u-items-end u-gap-3 u-wrap">
        <div className="admin-field u-flex-1">
          <label htmlFor="ins-name">Contact name</label>
          <input id="ins-name" className="admin-input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div className="admin-field u-flex-1">
          <label htmlFor="ins-email">Email</label>
          <input id="ins-email" className="admin-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="admin-field u-flex-1">
          <label htmlFor="ins-company">Company</label>
          <input id="ins-company" className="admin-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
      </div>
      <div className="admin-form-row u-row u-items-end u-gap-3 u-wrap u-mt-3">
        <div className="admin-field u-flex-1">
          <label htmlFor="ins-date">Downloaded on</label>
          <input id="ins-date" className="admin-input" type="date" value={downloadedOn} onChange={(e) => setDownloadedOn(e.target.value)} />
        </div>
        <div className="admin-field u-flex-1">
          <label htmlFor="ins-source">Source</label>
          <select id="ins-source" className="admin-input" value={source} onChange={(e) => setSource(e.target.value as InstallSource)}>
            {INSTALL_SOURCES.map((s) => (
              <option key={s} value={s}>
                {INSTALL_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field u-flex-1">
          <label htmlFor="ins-status">Status</label>
          <select id="ins-status" className="admin-input" value={status} onChange={(e) => setStatus(e.target.value as InstallStatus)}>
            {INSTALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INSTALL_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {status === "installed" && (
          <div className="admin-field u-flex-1">
            <label htmlFor="ins-installed">Installed on</label>
            <input id="ins-installed" className="admin-input" type="date" value={installedOn} onChange={(e) => setInstalledOn(e.target.value)} />
          </div>
        )}
      </div>
      <div className="admin-form-row u-row u-items-end u-gap-3 u-wrap u-mt-3">
        <div className="admin-field u-flex-1">
          <label htmlFor="ins-url">Link to their site or repo (optional)</label>
          <input id="ins-url" className="admin-input" type="url" placeholder="https://" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
        </div>
        <div className="admin-field u-flex-2">
          <label htmlFor="ins-notes">Notes (optional)</label>
          <input id="ins-notes" className="admin-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={submit}
          disabled={pending || !contactName.trim() || !email.trim() || !companyName.trim()}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <Note note={note} />
    </div>
  );
}

export function InstallRowControls({
  may,
  id,
  label,
  status: current,
  downloadedOn,
  installedOn: currentInstalledOn,
  evidenceUrl: currentUrl,
  today,
}: {
  may: MayProp;
  id: string;
  label: string;
  status: InstallStatus;
  downloadedOn: string;
  installedOn: string | null;
  evidenceUrl: string | null;
  today: string;
}) {
  const { note, pending, run } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<InstallStatus>(current === "downloaded" ? "installed" : current);
  const [installedOn, setInstalledOn] = useState(currentInstalledOn ?? today);
  const [evidenceUrl, setEvidenceUrl] = useState(currentUrl ?? "");

  if (!may[ATOM]) return null;

  if (!open) {
    return (
      <span className="u-row u-gap-2 u-wrap">
        <button type="button" className="admin-link-btn" onClick={() => setOpen(true)}>
          {current === "downloaded" ? "Mark installed" : "Edit"}
        </button>
        <ConfirmButton
          label="Archive"
          className="admin-link-btn"
          title={`Archive ${label}?`}
          body="It leaves this list and stops counting. Use it for a duplicate or a mistake; an install that stopped is Abandoned."
          confirmLabel="Archive"
          onConfirm={() => archiveEightEdgesInstall(id)}
        />
      </span>
    );
  }

  function save() {
    run(
      () =>
        updateEightEdgesInstall({
          id,
          status,
          downloadedOn,
          installedOn: status === "installed" ? installedOn : currentInstalledOn ?? "",
          evidenceUrl,
        }),
      "Saved.",
      () => setOpen(false),
    );
  }

  return (
    <div className="u-stack u-gap-2">
      <select className="admin-input" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as InstallStatus)}>
        {INSTALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {INSTALL_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {status === "installed" && (
        <input className="admin-input" type="date" aria-label="Installed on" value={installedOn} onChange={(e) => setInstalledOn(e.target.value)} />
      )}
      <input className="admin-input" type="url" aria-label="Link" placeholder="https://" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
      <span className="u-row u-gap-2">
        <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="admin-btn" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </span>
      <Note note={note} />
    </div>
  );
}
