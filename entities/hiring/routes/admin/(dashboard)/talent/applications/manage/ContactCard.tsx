"use client";

import { EditableLink, EditableSelect, EditableText } from "@/kernel/ui/InlineEdit";
import { COUNTRIES } from "@/entities/company-os/client";
import { updateApplicantProfile } from "../actions";

export function ContactCard(props: {
  personId: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  headline: string | null;
  currentTitle: string | null;
}) {
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-2">Contact</div>
      <dl className="admin-kv admin-kv--editable">
        <dt>Headline</dt>
        <dd>
          <EditableText value={props.headline ?? ""} placeholder="Add a headline…" ariaLabel="Headline"
            onSave={(v) => updateApplicantProfile(props.personId, { headline: v.trim() || null })} />
        </dd>
        <dt>Title</dt>
        <dd>
          <EditableText value={props.currentTitle ?? ""} placeholder="Current title…" ariaLabel="Current title"
            onSave={(v) => updateApplicantProfile(props.personId, { current_title: v.trim() || null })} />
        </dd>
        <dt>Email</dt>
        <dd>
          <EditableText type="email" value={props.email ?? ""} placeholder="Add email…" ariaLabel="Email"
            onSave={(v) => updateApplicantProfile(props.personId, { email: v.trim() || null })} />
        </dd>
        <dt>Phone</dt>
        <dd>
          <EditableText type="tel" value={props.phone ?? ""} placeholder="Add phone…" ariaLabel="Phone"
            onSave={(v) => updateApplicantProfile(props.personId, { phone: v.trim() || null })} />
        </dd>
        <dt>City</dt>
        <dd>
          <EditableText value={props.city ?? ""} placeholder="Add city…" ariaLabel="City"
            onSave={(v) => updateApplicantProfile(props.personId, { city: v.trim() || null })} />
        </dd>
        <dt>Country</dt>
        <dd>
          <EditableSelect value={props.country ?? ""} placeholder="—" ariaLabel="Country"
            options={COUNTRIES.map((c) => ({ value: c, label: c }))}
            onSave={(v) => updateApplicantProfile(props.personId, { country: v || null })} />
        </dd>
        <dt>LinkedIn</dt>
        <dd>
          <EditableLink value={props.linkedinUrl ?? ""} placeholder="Add LinkedIn…" ariaLabel="LinkedIn"
            onSave={(v) => updateApplicantProfile(props.personId, { linkedin_url: v.trim() || null })} />
        </dd>
        <dt>Portfolio</dt>
        <dd>
          <EditableLink value={props.portfolioUrl ?? ""} placeholder="Add portfolio…" ariaLabel="Portfolio"
            onSave={(v) => updateApplicantProfile(props.personId, { portfolio_url: v.trim() || null })} />
        </dd>
      </dl>
    </section>
  );
}
