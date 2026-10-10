"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { MayProp } from "@/kernel/identity/may-prop";
import { granteeRefusal } from "@/kernel/identity/access-grants";
import { showToast } from "@/kernel/ui/Toast";
import { EMPLOYMENT_TYPE_LABEL, type EmploymentType } from "@/kernel/identity/employment-types";
import {
  NO_BASELINE_TYPES,
  SUPER_ADMIN_REFUSAL,
  shapeAtoms,
  type BundleOption,
  type InvitePlan,
  type ShapeGroup,
  type ShapeLevel,
} from "@/entities/company-os/lib/access-invite-plan";
import { previewInviteAction, sendInviteAction } from "@/entities/company-os/lib/access-invite-actions";
import { BundleChoices, CustomShape } from "./InviteChoices";

// "Invite someone" on Settings → Access (AE.4). The drawer asks, the server
// decides: "What will happen" is the plan previewInviteAction computes from the
// same inputs Send takes, so the box, its refusals and Send cannot disagree.

const TYPE_GROUPS: { label: string; types: EmploymentType[] }[] = [
  { label: "Team member baseline", types: ["full_time", "part_time", "intern"] },
  { label: "Contractor baseline", types: ["contract"] },
  { label: "No baseline", types: ["temp", "advisor"] },
];
type Match = { name: string; employment: string; login: string } | null;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteButton({ bundles, groups, may }: { bundles: BundleOption[]; groups: ShapeGroup[]; may: MayProp }) {
  const [open, setOpen] = useState(false);
  if (may["access.manage"] !== true) return null;
  return (
    <>
      <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
        Invite someone
      </button>
      {open && <InviteDrawer bundles={bundles} groups={groups} onClose={() => setOpen(false)} />}
    </>
  );
}

function InviteDrawer({ bundles, groups, onClose }: { bundles: BundleOption[]; groups: ShapeGroup[]; onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [lookedUp, setLookedUp] = useState("");
  const [fullName, setFullName] = useState("");
  const [type, setType] = useState<EmploymentType>("full_time");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Record<string, ShapeLevel>>({});
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState<InvitePlan | null>(null);
  const [match, setMatch] = useState<Match>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();

  const custom = NO_BASELINE_TYPES.has(type);
  const customAtoms = useMemo(() => (custom ? shapeAtoms(levels) : []), [custom, levels]);
  const input = useMemo(
    () => ({ email: lookedUp, fullName, employmentType: type, roleKeys: [...chosen].sort(), customAtoms }),
    [lookedUp, fullName, type, chosen, customAtoms],
  );

  // The plan follows every change once an email has been looked up (on blur).
  useEffect(() => {
    if (!EMAIL.test(input.email)) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await previewInviteAction(input);
      if (!live) return;
      if (res.ok) {
        setPlan(res.plan);
        setMatch(res.match);
        setError(null);
      } else setError(res.error);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [input]);

  const refusal = plan?.refusal ?? null;
  // Shown the moment Super Admin is ticked for a type it cannot go to, before
  // any plan exists; a matched person keeps their own type, which the plan reads.
  const superAdminRefused =
    refusal === SUPER_ADMIN_REFUSAL || (!match && chosen.has("super-admin") && granteeRefusal("super-admin", { employmentTypes: [type] }) !== null);
  const canSend = !!plan && !refusal && !superAdminRefused && reason.trim().length >= 3 && (match !== null || fullName.trim().length >= 2) && !sending;

  function send() {
    startSend(async () => {
      const res = await sendInviteAction({ ...input, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      showToast({ message: res.message });
      router.refresh();
      onClose();
    });
  }

  return (
    <DetailDrawer open onClose={onClose} eyebrow="Settings · Access" title="Invite someone">
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <label className="admin-field">
        <span className="admin-label">Work email</span>
        <input
          className="admin-input"
          type="email"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setLookedUp(email.trim().toLowerCase())}
          placeholder="name@company.com"
        />
      </label>
      {match ? (
        <div className="admin-alert admin-alert--info">
          {match.name} is already in People · {match.employment} · {match.login}; their record will be reused.
        </div>
      ) : (
        <label className="admin-field">
          <span className="admin-label">Full name</span>
          <input className="admin-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
      )}
      <label className="admin-field">
        <span className="admin-label">Employment type</span>
        <select className="admin-select" value={type} onChange={(e) => setType(e.target.value as EmploymentType)}>
          {TYPE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.types.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="admin-hint u-block u-mt-1">
          A contractor is a team member too: onboarded, long-term, learns the company. The type sets what the Team view shows by default; roles
          below add modules on top, like anyone else.
        </span>
      </label>

      <div className="admin-label u-mt-3">What they will hold</div>
      <BundleChoices
        bundles={bundles}
        chosen={chosen}
        superAdminRefused={superAdminRefused}
        onToggle={(key) =>
          setChosen((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
      />
      {custom && (
        <>
          <div className="admin-label u-mt-4">Custom shape</div>
          <CustomShape groups={groups} levels={levels} onChange={(key, level) => setLevels((prev) => ({ ...prev, [key]: level }))} />
        </>
      )}

      <label className="admin-field u-mt-4">
        <span className="admin-label">Why</span>
        <input className="admin-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Runs the books from October" />
      </label>

      <div className="admin-card admin-card--outlined u-p-3">
        <div className="admin-label">What will happen when you send</div>
        {plan ? (
          <ul className="admin-list u-mb-0">
            {plan.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="u-muted u-m-0">Type their email to see the plan.</p>
        )}
        {refusal && <p className="u-err u-mt-2 u-mb-0">{refusal}</p>}
      </div>

      <div className="admin-form-actions u-mt-4">
        <button type="button" className="admin-btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="admin-btn admin-btn--primary" disabled={!canSend} onClick={send}>
          {sending ? "Sending…" : "Send invitation"}
        </button>
      </div>
    </DetailDrawer>
  );
}
