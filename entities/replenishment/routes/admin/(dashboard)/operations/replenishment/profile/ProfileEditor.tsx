"use client";

// The profile editor (RP.6; spec "Setting up a warehouse"), to the approved
// Profile board: the five sections on the left, the preview on the right. It
// is the one client component on the page and holds the draft; the sections
// below it only show a part of the draft and hand back a changed copy.
//
// The draft is checked against the schema as it changes. Each refusal is put
// beside its field and listed above the form, and Save waits until there is
// none. The preview reads the last stored export once, on the server, and then
// runs the pure engine here on every draft that passes, so a threshold change
// recounts at once. A draft that fails keeps the last preview that passed.
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { parseProfile, previewRun, type Profile } from "@/entities/replenishment/client";
import { readLastExport } from "@/entities/replenishment/lib/preview-actions";
import { saveProfile } from "@/entities/replenishment/lib/profile-actions";
import { fieldName, plainMessage, sameProfile } from "@/entities/replenishment/ui/profile-draft";
import type { MayProp } from "@/kernel/identity/may-prop";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { ExportSection } from "./ExportSection";
import { DestinationsSection, WordsSection } from "./OperatorSections";
import { PreviewPanel, type ExportState } from "./PreviewPanel";
import { RulesSection } from "./RulesSection";
import { ZonesSection } from "./ZonesSection";

type Props = {
  id: string;
  name: string;
  warehouse: string;
  version: number;
  profile: Profile;
};

const ATOM = "replenishment.profiles";

/** Hidden from anyone without the profile atom: hiding is courtesy, and both actions refuse without it. */
export function ProfileEditor({ may, ...props }: Props & { may: MayProp }) {
  return may[ATOM] ? <Editor {...props} /> : null;
}

function Editor({ id, name, warehouse, version, profile }: Props) {
  const [draft, setDraft] = useState(profile);
  const [valid, setValid] = useState(profile);
  const [saved, setSaved] = useState({ profile, version });
  const [source, setSource] = useState<ExportState>({ status: "loading" });
  const { note, setNote, pending, startTransition, router } = useActionRunner();

  useEffect(() => {
    let live = true;
    readLastExport(id).then(
      (res) => {
        if (!live) return;
        if (!res.ok) setSource({ status: "failed", error: res.error });
        else setSource(res.lastExport ? { status: "ready", lastExport: res.lastExport } : { status: "none" });
      },
      () => live && setSource({ status: "failed", error: "Could not read the last export, so there is no preview. Reload the page to try again." }),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const checked = useMemo(() => parseProfile(draft), [draft]);
  const issues = checked.ok ? [] : checked.issues;
  const dirty = !sameProfile(draft, saved.profile);

  // A keystroke updates the form first; the recount follows when React has a moment.
  const previewed = useDeferredValue(valid);
  const rows = source.status === "ready" ? source.lastExport.rows : null;
  const preview = useMemo(() => (rows ? previewRun(previewed, rows) : null), [rows, previewed]);
  const savedPreview = useMemo(() => (rows ? previewRun(saved.profile, rows) : null), [rows, saved.profile]);
  // Band counts are by position, so they are shown beside the rules only while the preview is of this draft.
  const bandJobs = checked.ok && previewed === valid && preview?.ok ? preview.preview.bandJobs : null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(next: Profile) {
    setDraft(next);
    const parsed = parseProfile(next);
    if (parsed.ok) setValid(parsed.profile);
  }

  function save() {
    if (!checked.ok) return;
    const document = checked.profile;
    setNote(null);
    startTransition(async () => {
      const res = await saveProfile({ id, version: saved.version, name, warehouse, document });
      if (!res.ok) {
        setNote({ tone: "err", text: res.error });
        return;
      }
      const next = res.version ?? saved.version + 1;
      setSaved({ profile: document, version: next });
      setNote({ tone: "ok", text: `Saved as version ${next}. Runs already made keep the profile they were made with.` });
      router.refresh();
    });
  }

  return (
    <>
      <div className="rp-profile-bar">
        <span className="admin-cell-muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending || !dirty || !checked.ok}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
      {note && (
        <div className={`admin-alert admin-alert--${note.tone} u-mb-3`} role={note.tone === "err" ? "alert" : "status"}>
          {note.text}
        </div>
      )}
      {!checked.ok && (
        <div className="admin-alert admin-alert--err u-mb-3" role="alert">
          <strong>This draft cannot be saved yet.</strong> {issues.length === 1 ? "One field needs" : `${issues.length} fields need`} attention:
          <ul className="u-list-inset u-m-0">
            {issues.map((issue, i) => (
              <li key={`${issue.path}:${i}`}>
                {fieldName(issue.path, draft)}: {plainMessage(issue.message)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="admin-cols-main-aside">
        <div className="u-min-0">
          <ExportSection
            value={{ columns: draft.columns, truncatedAtOrBelow: draft.truncatedAtOrBelow }}
            issues={issues}
            onChange={(part) => update({ ...draft, ...part })}
          />
          <ZonesSection value={draft.zones} issues={issues} words={draft.words} onChange={(zones) => update({ ...draft, zones })} />
          <RulesSection
            value={{ exclude: draft.exclude, rules: draft.rules }}
            issues={issues}
            words={draft.words}
            bandJobs={bandJobs}
            onChange={(part) => update({ ...draft, ...part })}
          />
          <DestinationsSection value={draft.destinations} issues={issues} words={draft.words} onChange={(destinations) => update({ ...draft, destinations })} />
          <WordsSection value={draft.words} issues={issues} onChange={(words) => update({ ...draft, words })} />
        </div>
        <aside className="rp-profile-aside">
          <PreviewPanel source={source} draft={preview} saved={savedPreview} stale={!checked.ok} profile={previewed} />
        </aside>
      </div>
    </>
  );
}
