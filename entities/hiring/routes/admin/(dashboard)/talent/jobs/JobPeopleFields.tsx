"use client";

import { useEffect, useId, useState } from "react";
import { PersonSelect } from "@/entities/crm/client";
import { listClientContacts } from "./actions";
import type { MayProp } from "@/kernel/identity/may-prop";

type Named = { id: string; name: string };

/** What the page loads once for every job's "Who it's for" fields. */
export type JobFieldOptions = {
  /** Our current team, by people.id: who may manage an in-house job. */
  team: Named[];
  /** Our current team, by team_members.id: who may recruit. */
  recruiters: Named[];
  /** Active CRM companies, for the client. */
  companies: Named[];
  /** Whether the viewer may see client contacts (crm's seesEveryClient), and so pick a client's hiring manager. */
  canPickContacts: boolean;
};

/** Who a job is for, as ids. An empty string is none. */
export type JobPeople = { clientId: string; managerId: string; recruiterId: string };

type Loaded = { forId: string; list: Named[]; error: string | null };

// The "Who it's for" group, shared by the drawer and New job so the two cannot
// drift apart. A staffing job is hired for a client under the client's own
// manager, so once a client is set the hiring manager comes from that client's
// contacts in CRM. Those contacts are offered only to people who may see client
// contacts (the boundary PR #2120 crossed); anyone else sees the saved manager
// and cannot pick a contact. The recruiter is always one of ours, because
// candidates' emails are signed by the recruiter and replied to them, else by
// a hiring manager on our team, never a client's (entities/hiring/lib/chain/store.ts).
export function JobPeopleFields({
  value,
  onChange,
  options,
  savedManagerName = null,
  may,
}: {
  value: JobPeople;
  onChange: (patch: Partial<JobPeople>) => void;
  options: JobFieldOptions;
  /** The saved hiring manager's name, so a manager who is not in the list still shows. */
  savedManagerName?: string | null;
  /** hiring.ats, which listClientContacts asks for before CRM's own rule. */
  may: MayProp;
}) {
  const id = useId();
  const client = options.companies.find((c) => c.id === value.clientId) ?? null;
  const clientId = client?.id ?? null;
  const wantsContacts = clientId !== null && options.canPickContacts && may["hiring.ats"] === true;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Keyed on the id, not the company object: a save revalidates the page and
  // hands down new option arrays, which must not refetch the contacts.
  useEffect(() => {
    if (!wantsContacts || !clientId) return;
    let live = true;
    listClientContacts(clientId)
      .then((r) => live && setLoaded({ forId: clientId, list: r.ok ? r.contacts : [], error: r.ok ? null : r.error }))
      .catch(() => live && setLoaded({ forId: clientId, list: [], error: "the request failed" }));
    return () => {
      live = false;
    };
  }, [clientId, wantsContacts]);
  const contacts = loaded && loaded.forId === clientId ? loaded : null;

  // The saved manager stays choosable while the list loads, or once they are
  // no longer linked to the company, so the picker never shows a blank.
  const contactOptions = (contacts?.list ?? []).map((c) => ({ value: c.id, label: c.name }));
  if (value.managerId && savedManagerName && !contactOptions.some((o) => o.value === value.managerId)) {
    contactOptions.unshift({ value: value.managerId, label: savedManagerName });
  }
  const managerName = value.managerId
    ? (contactOptions.find((o) => o.value === value.managerId)?.label ??
      options.team.find((m) => m.id === value.managerId)?.name ??
      savedManagerName)
    : null;

  let managerHint: string;
  if (!client) managerHint = "While the job is open, it shows under this person on the org chart.";
  else if (!options.canPickContacts) managerHint = "Picking a client's contact needs access to CRM. Ask someone who has it.";
  else if (!contacts) managerHint = `Loading ${client.name}'s contacts…`;
  else if (contacts.error) managerHint = `${client.name}'s contacts did not load (${contacts.error}).`;
  else if (contacts.list.length === 0) managerHint = `${client.name} has no contacts in CRM yet. Add their hiring manager there, then pick them here.`;
  else managerHint = `Their person, not ours: from ${client.name}'s contacts in CRM.`;

  return (
    <>
      <p className="admin-section-label u-mt-4">Who it&apos;s for</p>
      <div className="admin-field">
        <label className="admin-label" htmlFor={`${id}-client`}>Client</label>
        <PersonSelect
          id={`${id}-client`}
          value={value.clientId}
          // A new client means a new hiring manager: the old one was someone
          // else's person, or ours. The server clears it too.
          onChange={(v) => onChange({ clientId: v, managerId: "" })}
          emptyLabel="In-house (our own hire)"
          placeholder="Search companies…"
          options={options.companies.map((c) => ({ value: c.id, label: c.name }))}
        />
        <div className="admin-hint">
          {client
            ? "A staffing job, hired for this client under their manager. Changing the client clears the hiring manager."
            : "Pick the client from CRM when you are hiring for them."}
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor={`${id}-manager`}>{client ? `Hiring manager at ${client.name}` : "Hiring manager"}</label>
        {client && !options.canPickContacts ? (
          <input id={`${id}-manager`} className="admin-input" value={managerName ?? ""} placeholder="Not set" readOnly disabled />
        ) : (
          <PersonSelect
            id={`${id}-manager`}
            value={value.managerId}
            onChange={(v) => onChange({ managerId: v })}
            emptyLabel={client ? "Not set" : "No hiring manager"}
            placeholder={client ? "Search their contacts…" : "Search the team…"}
            disabled={!!client && !contacts}
            options={client ? contactOptions : options.team.map((m) => ({ value: m.id, label: m.name }))}
          />
        )}
        <div className="admin-hint">{managerHint}</div>
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor={`${id}-recruiter`}>Recruiter</label>
        <PersonSelect
          id={`${id}-recruiter`}
          value={value.recruiterId}
          onChange={(v) => onChange({ recruiterId: v })}
          emptyLabel="No recruiter"
          placeholder="Search the team…"
          options={options.recruiters.map((m) => ({ value: m.id, label: m.name }))}
        />
        <div className="admin-hint">
          Candidates&apos; emails are signed by this person, and their replies go to them. With no recruiter, a hiring manager on our team
          stands in.
        </div>
      </div>
      {/* A client's contact never stands in (hiring's chain/store.ts), so a client
          job with no recruiter sends emails no person on our team signs. */}
      {client && !value.recruiterId && (
        <div className="admin-alert admin-alert--warn">
          Pick a recruiter, so candidates&apos; emails are signed by someone on our team and their replies reach them.
        </div>
      )}
    </>
  );
}
