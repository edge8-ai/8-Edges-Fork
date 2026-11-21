"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SIZE_BANDS, type CompanyProfile, type CompanyProfileView } from "@/entities/portal/lib/profile-types";
import { saveCompanyProfile } from "./actions";

const SIZE_LABEL: Record<string, string> = {
  "0-50": "Up to 50 people",
  "51-250": "51 to 250 people",
  "251-5000": "251 to 5,000 people",
  "5000+": "More than 5,000 people",
};

// One card per company the actor administers. Everything here is shared with
// Edge8: the same row powers invoicing and your account team's view, so the
// page says so rather than pretending it is a private copy.
export function CompanyForm({ initial }: { initial: CompanyProfileView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [v, setV] = useState<CompanyProfile>({
    name: initial.name,
    industry: initial.industry,
    sizeBand: initial.sizeBand,
    country: initial.country,
    websiteUrl: initial.websiteUrl,
    headOffice: initial.headOffice,
    generalEmail: initial.generalEmail,
    registrationNumber: initial.registrationNumber,
    billingAddress: initial.billingAddress,
  });

  const set =
    (key: keyof CompanyProfile) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setV((s) => ({ ...s, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    start(async () => {
      const res = await saveCompanyProfile(initial.companyId, v);
      if (res.ok) {
        setBanner({ tone: "ok", text: "Saved." });
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  const since = initial.clientSince
    ? new Date(initial.clientSince).toLocaleDateString("en-AU", { month: "long", year: "numeric" })
    : null;

  return (
    <form onSubmit={submit}>
      <section className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title">{initial.name}</h2>
        {(since || initial.clientTypes.length > 0) && (
          <p className="admin-page-sub u-mt-0">
            {since && `With Edge8 since ${since}.`}
            {initial.clientTypes.length > 0 && ` ${initial.clientTypes.join(" · ")}`}
          </p>
        )}

        <div className="u-grid-auto-200">
          <Field label="Company name">
            <input className="admin-input" value={v.name} onChange={set("name")} disabled={pending} />
          </Field>
          <Field label="Industry">
            <input
              className="admin-input"
              value={v.industry}
              onChange={set("industry")}
              placeholder="e.g. Footwear Retail"
              disabled={pending}
            />
          </Field>
          <Field label="Team size">
            <select className="admin-input" value={v.sizeBand} onChange={set("sizeBand")} disabled={pending}>
              <option value="">—</option>
              {SIZE_BANDS.map((b) => (
                <option key={b} value={b}>
                  {SIZE_LABEL[b]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Country">
            <input className="admin-input" value={v.country} onChange={set("country")} disabled={pending} />
          </Field>
          <Field label="Website">
            <input
              className="admin-input"
              value={v.websiteUrl}
              onChange={set("websiteUrl")}
              placeholder="yourcompany.com"
              disabled={pending}
            />
          </Field>
          <Field label="General email">
            <input
              className="admin-input"
              type="email"
              value={v.generalEmail}
              onChange={set("generalEmail")}
              placeholder="hello@yourcompany.com"
              disabled={pending}
            />
          </Field>
          <Field label="Company or tax number">
            <input
              className="admin-input"
              value={v.registrationNumber}
              onChange={set("registrationNumber")}
              placeholder="ABN, ACN, or equivalent"
              disabled={pending}
            />
          </Field>
        </div>

        <div className="u-grid-auto-md u-gap-3">
          <Field label="Head office address">
            <textarea
              className="admin-input"
              rows={3}
              value={v.headOffice}
              onChange={set("headOffice")}
              disabled={pending}
            />
          </Field>
          <Field label="Billing address">
            <textarea
              className="admin-input"
              rows={3}
              value={v.billingAddress}
              onChange={set("billingAddress")}
              placeholder="Leave empty to bill to the head office"
              disabled={pending}
            />
          </Field>
        </div>

        <div className="u-row u-gap-3 u-wrap u-mt-4">
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
