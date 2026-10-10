"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PersonalProfile, PersonalProfileView } from "@/entities/portal/lib/profile";
import { savePersonalProfile } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  contributor: "Contributor",
  viewer: "Viewer",
  affiliate: "Affiliate",
};

// Your own details, editable by every role. Email is identity (portal sign-in
// matches on it upstream), so it is shown but never edited here.
export function ProfileForm({
  initial,
  canEditTitle,
}: {
  initial: PersonalProfileView;
  canEditTitle: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [v, setV] = useState<PersonalProfile>({
    fullName: initial.fullName,
    preferredName: initial.preferredName,
    phone: initial.phone,
    jobTitle: initial.jobTitle,
    city: initial.city,
    stateProvince: initial.stateProvince,
    country: initial.country,
    timezone: initial.timezone,
    linkedinUrl: initial.linkedinUrl,
  });

  const set = (key: keyof PersonalProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    start(async () => {
      const res = await savePersonalProfile(v);
      if (res.ok) {
        setBanner({ tone: "ok", text: "Saved." });
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <form onSubmit={submit}>
      <section className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title">Your details</h2>
        <div className="u-grid-auto-md u-gap-3">
          <Field label="Full name">
            <input className="admin-input" value={v.fullName} onChange={set("fullName")} disabled={pending} />
          </Field>
          <Field label="Preferred name">
            <input
              className="admin-input"
              value={v.preferredName}
              onChange={set("preferredName")}
              placeholder="What you like to be called"
              disabled={pending}
            />
          </Field>
          <Field label="Phone">
            <input className="admin-input" type="tel" value={v.phone} onChange={set("phone")} disabled={pending} />
          </Field>
          {canEditTitle && (
            <Field label="Job title">
              <input
                className="admin-input"
                value={v.jobTitle}
                onChange={set("jobTitle")}
                placeholder="e.g. Operations Manager"
                disabled={pending}
              />
            </Field>
          )}
          <Field label="City">
            <input className="admin-input" value={v.city} onChange={set("city")} disabled={pending} />
          </Field>
          <Field label="State or province">
            <input className="admin-input" value={v.stateProvince} onChange={set("stateProvince")} disabled={pending} />
          </Field>
          <Field label="Country">
            <input className="admin-input" value={v.country} onChange={set("country")} disabled={pending} />
          </Field>
          <Field label="Time zone">
            <input
              className="admin-input"
              value={v.timezone}
              onChange={set("timezone")}
              placeholder="e.g. Australia/Perth"
              disabled={pending}
            />
          </Field>
          <Field label="LinkedIn">
            <input
              className="admin-input"
              value={v.linkedinUrl}
              onChange={set("linkedinUrl")}
              placeholder="linkedin.com/in/you"
              disabled={pending}
            />
          </Field>
        </div>
        <div className="u-row u-gap-3 u-mt-4">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          {banner && (
            <span className={banner.tone === "ok" ? "admin-alert" : "admin-alert admin-alert--err"}>
              {banner.text}
            </span>
          )}
        </div>
      </section>

      <section className="admin-card admin-section-card">
        <h2 className="admin-card-title">Sign-in</h2>
        <div className="admin-list">
          <div className="admin-list-row">
            <div className="admin-list-main">
              <div className="admin-list-title">{initial.email}</div>
              <div className="admin-list-sub">
                This is how you sign in. Ask your account admin to change it.
              </div>
            </div>
            <div className="admin-list-aside">
              <Link className="admin-btn admin-btn--sm" href="/portal/change-password">
                Change password
              </Link>
            </div>
          </div>
          {initial.memberships.map((m, i) => (
            <div className="admin-list-row" key={`${m.companyName}-${i}`}>
              <div className="admin-list-main">
                <div className="admin-list-title">{m.companyName}</div>
                <div className="admin-list-sub">Your access level at this company</div>
              </div>
              <div className="admin-list-aside">
                <span className="admin-badge">{ROLE_LABEL[m.role] ?? m.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="admin-field u-block">
      <span className="admin-label">{label}</span>
      {children}
    </label>
  );
}
