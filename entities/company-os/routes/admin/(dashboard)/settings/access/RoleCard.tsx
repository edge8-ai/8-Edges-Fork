"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import type { AccessPersonOption, AccessRole } from "@/entities/company-os/lib/access-screen";
import { addRolePermission, grantRole, removeRolePermission, revokeGrant } from "./actions";
import { PersonPicker } from "./PersonPicker";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Declared = { key: string; sentence: string };

const SCOPE_WORDS: Record<string, string> = {
  own: "their own",
  team: "their team",
  clients: "their clients",
  all: "everyone's",
};

// One role on Settings → Access: what it holds, who was granted it, and the
// forms that change either. The server refuses whatever the rules refuse; the
// card only says so.
export function RoleCard({ role, people, permissions }: { role: AccessRole; people: AccessPersonOption[]; permissions: Declared[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [grantTo, setGrantTo] = useState("");
  const [grantWhy, setGrantWhy] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addScope, setAddScope] = useState("all");
  const [revokeWhy, setRevokeWhy] = useState("");

  function run(fn: () => Promise<Result>, after?: () => void) {
    setBanner(null);
    startTransition(async () => {
      const res = await fn();
      setBanner(res.ok ? { tone: "ok", text: res.message ?? "Saved." } : { tone: "err", text: res.error });
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  const held = new Set(role.permissions.map((p) => p.permission));
  const addable = permissions.filter((p) => !held.has(p.key));
  const implied = role.kind === "implied";
  // Admin and Super Admin: the server refuses an edit, so the card offers none.
  const locked = role.declared?.locked ?? false;

  return (
    <section className="admin-card admin-section-card u-mb-4" aria-labelledby={`role-${role.key}`}>
      <div className="u-row u-wrap u-items-center u-gap-2">
        <h2 className="admin-card-title u-mb-0" id={`role-${role.key}`}>
          {role.name}
        </h2>
        {implied ? <Badge tone="neutral">Follows a fact</Badge> : <Badge tone="info">Granted</Badge>}
        {role.declared && <Badge tone="neutral">Declared</Badge>}
        {role.archived && <Badge tone="warn">Archived</Badge>}
        <code className="u-muted">{role.key}</code>
      </div>
      <p className="u-muted u-mt-1">{role.description}</p>
      {role.declared && (
        <p className="u-mt-1">
          {role.declared.locked
            ? "Declared in code and locked: its permissions change only with the code that declares them."
            : `Declared by ${role.declared.owner}, which seeded it once; edit it here from now on.`}{" "}
          {role.declared.sentence !== role.description && <span className="u-muted">As declared: {role.declared.sentence}</span>}
        </p>
      )}
      {implied && role.impliedBy.length > 0 && (
        <p className="u-mt-1">Held by anyone who {role.impliedBy.join(", or who ")}. It cannot be granted or revoked by hand.</p>
      )}
      {banner && <div className={`admin-alert admin-alert--${banner.tone} u-mt-2`}>{banner.text}</div>}

      <h3 className="admin-label u-mt-3">Permissions</h3>
      {role.permissions.length === 0 ? (
        <p className="u-muted">None yet: this role opens nothing.</p>
      ) : (
        <table className="admin-table">
          <tbody>
            {role.permissions.map((p) => (
              <tr key={p.id}>
                <td>{p.sentence ?? <span className="u-muted">No installed area declares this; it grants nothing.</span>}</td>
                <td>
                  <code>{p.permission}</code>
                </td>
                <td>{SCOPE_WORDS[p.scope] ?? p.scope}</td>
                <td className="u-right">
                  {!locked && (
                    <ConfirmButton
                      label="Take off"
                      className="admin-btn admin-btn--sm"
                      title={`Take ${p.permission} off ${role.name}?`}
                      body={`Everyone who holds ${role.name} loses it on their next page load, unless another role gives it.`}
                      confirmLabel="Take it off"
                      disabled={pending}
                      onConfirm={() => removeRolePermission(p.id)}
                      onDone={() => router.refresh()}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!role.archived && !locked && (
        <form
          className="u-row u-wrap u-items-end u-gap-2 u-mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (addKey) run(() => addRolePermission(role.id, addKey, addScope), () => setAddKey(""));
          }}
        >
          <label className="admin-field u-flex-2 u-mb-0">
            <span className="admin-label">Add a permission</span>
            <select className="admin-select" value={addKey} onChange={(e) => setAddKey(e.target.value)} disabled={pending}>
              <option value="">Pick one…</option>
              {addable.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.sentence} ({p.key})
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field u-flex-fixed u-mb-0">
            <span className="admin-label">Reaching</span>
            <select className="admin-select" value={addScope} onChange={(e) => setAddScope(e.target.value)} disabled={pending}>
              {Object.entries(SCOPE_WORDS).map(([k, words]) => (
                <option key={k} value={k}>
                  {words}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="admin-btn" disabled={pending || !addKey}>
            Add
          </button>
        </form>
      )}

      {!implied && (
        <>
          <h3 className="admin-label u-mt-3">Granted to</h3>
          {role.grants.length === 0 ? (
            <p className="u-muted">Nobody yet.</p>
          ) : (
            <table className="admin-table">
              <tbody>
                {role.grants.map((g) => (
                  <tr key={g.id}>
                    <td>{g.personName}</td>
                    <td>{g.reason}</td>
                    <td className="u-muted">
                      {g.grantedBy ? `by ${g.grantedBy}, ` : ""}
                      {formatDate(g.createdAt)}
                    </td>
                    <td className="u-right">
                      <ConfirmButton
                        label="Revoke"
                        className="admin-btn admin-btn--sm"
                        title={`Revoke ${role.name} from ${g.personName}?`}
                        body={
                          <label className="admin-field">
                            <span className="admin-label">Why it ends</span>
                            <input className="admin-input" value={revokeWhy} onChange={(e) => setRevokeWhy(e.target.value)} />
                          </label>
                        }
                        confirmLabel="Revoke"
                        disabled={pending}
                        onConfirm={() => revokeGrant(g.id, revokeWhy)}
                        onDone={() => {
                          setRevokeWhy("");
                          router.refresh();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!role.archived && (
            <form
              className="u-row u-wrap u-items-end u-gap-2 u-mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (grantTo) run(() => grantRole(grantTo, role.id, grantWhy), () => (setGrantTo(""), setGrantWhy("")));
              }}
            >
              <div className="admin-field u-flex-fixed u-mb-0">
                <span className="admin-label">Grant to</span>
                <PersonPicker people={people} label="Grant to" value={grantTo} onChange={setGrantTo} disabled={pending} />
              </div>
              <label className="admin-field u-flex-2 u-mb-0">
                <span className="admin-label">Why</span>
                <input className="admin-input" value={grantWhy} onChange={(e) => setGrantWhy(e.target.value)} placeholder="Pays approved reimbursements" disabled={pending} />
              </label>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={pending || !grantTo || grantWhy.trim().length < 3}>
                Grant
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
