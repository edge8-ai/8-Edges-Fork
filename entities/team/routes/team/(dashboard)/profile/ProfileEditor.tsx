"use client";

// Everything the employee can edit about themselves (TH.9, approved on the
// design canvas on 19 Oct 2026). The postcard teammates see is the editor:
// the hometown, education, hobbies and photo change in place on it, so what
// someone edits is exactly what is shown. Their details and their payroll, ID
// and address sit below it as plain fields (ProfileFields).
//
// Text fields save together. The save bar appears only once something has
// changed, with Discard beside Save, and a "Saved" note confirms it; a bar
// that always says "Everything is saved" is noise. The photo and the two ID
// images upload on pick, as before.
import { useEffect, useState, useTransition, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MemberProfile } from "@/entities/team/lib/data";
import { PersonPostcard, PostcardSticker } from "@/entities/team/ui/PersonPostcard";
import { useAvatarUpload, type AvatarUploadResult } from "@/entities/team/ui/use-avatar-upload";
import { ProfileFields } from "./ProfileFields";
import { saveOwnProfile, type ProfileInput } from "./actions";

type UploadResult = { ok: true } | { ok: false; error: string };

const same = (a: ProfileInput, b: ProfileInput) => JSON.stringify(a) === JSON.stringify(b);

function Pen() {
  return (
    <svg className="pe-pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z M14 6l4 4" />
    </svg>
  );
}

export function ProfileEditor({
  initial,
  card,
  orgName,
  workEmail,
  avatarAction,
  hasIdFront,
  hasIdBack,
  idFrontAction,
  idBackAction,
  nameLevel = 1,
  badges,
}: {
  initial: ProfileInput;
  /** The postcard as teammates see it; the editor draws its own fields over it. */
  card: MemberProfile;
  orgName: string | null;
  workEmail: string | null;
  avatarAction: (formData: FormData) => Promise<AvatarUploadResult>;
  hasIdFront: boolean;
  hasIdBack: boolean;
  idFrontAction: (formData: FormData) => Promise<UploadResult>;
  idBackAction: (formData: FormData) => Promise<UploadResult>;
  /** 2 under the dressed profile, whose plaque holds the page's h1 (LD.6). */
  nameLevel?: 1 | 2;
  /** The badge stickers the owner wears on the postcard (LD.7b), drawn on the server by the ladders. */
  badges?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ProfileInput>(initial);
  const [v, setV] = useState<ProfileInput>(initial);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState(false);
  const { inputRef: photoInput, pending: photoPending, url: photoUrl, error: photoError, onPick: onPhotoPick, pick: pickPhoto } = useAvatarUpload(card.avatarUrl, avatarAction);
  const dirty = !same(v, saved);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function set<K extends keyof ProfileInput>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [key]: e.target.value }));
  }

  // Add-on-Enter or comma; an empty entry is dropped and a duplicate ignored.
  function addHobby() {
    const t = draft.trim().replace(/,$/, "").trim();
    if (t && !v.hobbies.includes(t)) setV((s) => ({ ...s, hobbies: [...s.hobbies, t] }));
    setDraft("");
  }
  function onDraftKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addHobby();
    } else if (e.key === "Backspace" && !draft && v.hobbies.length) {
      setV((s) => ({ ...s, hobbies: s.hobbies.slice(0, -1) }));
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveOwnProfile(v);
      if (res.ok) {
        setSaved(v);
        setToast(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const shown: MemberProfile = { ...card, avatarUrl: photoUrl, hometown: v.hometown || null, education: v.education || null, hobbies: v.hobbies };

  return (
    <div className="pe">
      <div className="tp-page">
        <PersonPostcard
          profile={shown}
          orgName={orgName}
          nameLevel={nameLevel}
          badges={badges}
          edit={{
            photo: (
              <>
                <button type="button" className="pe-photo-btn" onClick={pickPhoto} disabled={photoPending}>
                  {photoPending ? "Uploading…" : "Change photo"}
                </button>
                <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoPick} />
              </>
            ),
            hometown: (
              <span className="pe-edit">
                <input className="pe-inl pe-inl-greet" aria-label="Hometown" value={v.hometown} onChange={set("hometown")} placeholder="Your hometown" />
                <Pen />
              </span>
            ),
            education: (
              <span className="pe-edit">
                <textarea className="pe-inl pe-inl-area" rows={1} aria-label="Education" value={v.education} onChange={set("education")} placeholder="Where you studied" />
                <Pen />
              </span>
            ),
            hobbies: (
              <ul className="tp-stickers" aria-labelledby="tp-hobbies-label">
                {v.hobbies.map((h, i) => (
                  <PostcardSticker key={h} hobby={h} index={i}>
                    <button type="button" className="pe-x" aria-label={`Remove ${h}`} onClick={() => setV((s) => ({ ...s, hobbies: s.hobbies.filter((x) => x !== h) }))}>
                      ×
                    </button>
                  </PostcardSticker>
                ))}
                <li className="tp-sticker pe-add">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14 M5 12h14" />
                  </svg>
                  <input className="pe-add-in" aria-label="Add a hobby" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onDraftKey} onBlur={addHobby} placeholder="Add a hobby" />
                </li>
              </ul>
            ),
          }}
        />
      </div>
      {photoError && <p className="admin-alert admin-alert--err">{photoError}</p>}
      <p className="pe-under">Your name, role, team and manager come from the company.</p>

      <ProfileFields
        v={v}
        set={set}
        workEmail={workEmail}
        hasIdFront={hasIdFront}
        hasIdBack={hasIdBack}
        idFrontAction={idFrontAction}
        idBackAction={idBackAction}
      />

      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {dirty && (
        <div className="pe-save" role="region" aria-label="Unsaved changes">
          <span className="pe-save-t">
            <i aria-hidden="true" />
            You have changes that are not saved yet
          </span>
          <div className="pe-save-acts">
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setV(saved)}>
              Discard
            </button>
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="pe-toast" role="status">
          Saved
        </div>
      )}
    </div>
  );
}
