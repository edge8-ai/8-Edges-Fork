"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { ActionResult } from "@/kernel/ui/ConfirmDialog";
import type { ClientOverviewRow } from "@/entities/org/lib/client-reviews/overview";
import {
  changeClientManagerAction,
  reissueLinkAction,
  reopenPartAction,
  unlockPartAction,
  withdrawMemberAction,
} from "./owner-actions";

// What the row's menu holds (CR.3.8): the owner's actions on one member, each
// with its full name and a one-line note of what it does, grouped as link,
// parts, people and then withdraw; and the client manager picker, which opens
// inside the menu. Where the menu sits and when it shuts are RowActions'.
// Which actions appear is the rules module's answer on the row (`actions`).
// An action that changes what someone can do does not run here: it hands its
// question to the row (`onAsk`), which asks it in a dialog the menu does not own.

/** The overview row's facts the menu needs, and the cycle it sits in. */
export type RowFacts = Pick<ClientOverviewRow, "teamMemberId" | "name" | "clientManagerPersonId" | "clientManagerName" | "clientManagerPartId" | "actions"> & { cycleId: string };

/** The question an action asks before it runs. */
export type Confirm = { title: string; body: string; confirmLabel: string; run: () => Promise<ActionResult> };

type Contact = { id: string; name: string };

export function ActionItems({ may, row, contacts, onAsk, onChange }: { may: MayProp; row: RowFacts; contacts: Contact[]; onAsk: (c: Confirm) => void; onChange: () => void }) {
  // Hidden unless the reader may manage reviews (ADR 0014); each action still guards itself.
  if (!may["org.reviews"]) return null;
  const ids = { cycleId: row.cycleId, teamMemberId: row.teamMemberId };
  const { actions } = row;
  const link = actions.new_link;
  const parts = actions.unlock || actions.reopen_member || actions.reopen_client_manager;
  const canChange = actions.change_client_manager && contacts.length > 0;
  // The same field the row's Client manager cell reads, so the two never disagree.
  const hasClientManager = row.clientManagerPersonId !== null;

  return (
    <>
      {link && (
        <Group label="Link">
          <Item
            label="Cancel link and issue a new one"
            hint="The link you sent stops working at once."
            onSelect={() =>
              onAsk({
                title: `Issue a new link for ${row.name}'s client manager?`,
                body: "The link you sent stops working at once. Copy the new one and send it yourself. It opens with this client manager's answers so far, so if the link is for someone else, change the client manager instead.",
                confirmLabel: "Issue a new link",
                run: () => reissueLinkAction(ids),
              })
            }
          />
        </Group>
      )}
      {parts && (
        <Group label="Parts">
          {actions.unlock && (
            <Item
              label="Unlock the client manager's part"
              hint={`Lets the client manager rate before ${row.name} has sent theirs.`}
              onSelect={() =>
                onAsk({
                  title: `Unlock before ${row.name} has sent theirs?`,
                  body: "The client manager can fill their part now, without the member's answers beside it. This is recorded.",
                  confirmLabel: "Unlock",
                  run: () => unlockPartAction(ids),
                })
              }
            />
          )}
          {actions.reopen_member && (
            <Item
              label={`Reopen ${row.name}'s part`}
              hint="Their answers are kept; they can correct them and send again."
              onSelect={() =>
                onAsk({
                  title: `Reopen ${row.name}'s part?`,
                  body: "Their answers are kept and they can correct them and send again. This is recorded.",
                  confirmLabel: "Reopen",
                  run: () => reopenPartAction({ ...ids, kind: "self" }),
                })
              }
            />
          )}
          {actions.reopen_client_manager && (
            <Item
              label="Reopen the client manager's part"
              hint="Their answers are kept; their link opens the form again."
              onSelect={() =>
                onAsk({
                  title: `Reopen the client manager's part for ${row.name}?`,
                  body: "Their answers are kept and their link opens the form again. This is recorded.",
                  confirmLabel: "Reopen",
                  run: () => reopenPartAction({ ...ids, kind: "client_manager" }),
                })
              }
            />
          )}
        </Group>
      )}
      {canChange && (
        <Group label="People">
          <Item
            label={hasClientManager ? "Change client manager…" : "Add client manager…"}
            hint={hasClientManager ? `Now ${row.clientManagerName ?? "a contact no longer listed"}.` : "Nobody yet."}
            onSelect={onChange}
          />
        </Group>
      )}
      {actions.withdraw && (
        <>
          {(link || parts || canChange) && <div className="cr-menu-rule" aria-hidden="true" />}
          <Item
            danger
            label="Withdraw from this cycle…"
            hint="Their links stop working; their rows are kept."
            onSelect={() =>
              onAsk({
                title: `Withdraw ${row.name}?`,
                body: "Their rows are kept, their links stop working, and only review admins still see their review.",
                confirmLabel: "Withdraw",
                run: () => withdrawMemberAction(ids),
              })
            }
          />
        </>
      )}
    </>
  );
}

/** The client manager picker, inside the menu. */
export function ChangeManager({
  may,
  row,
  contacts,
  onBack,
  onCancel,
  onSaved,
  onBusy,
}: {
  may: MayProp;
  row: RowFacts;
  contacts: Contact[];
  onBack: () => void;
  onCancel: () => void;
  onSaved: () => void;
  /** Told while a save is running, so the menu does not shut on it and lose its answer. */
  onBusy: (busy: boolean) => void;
}) {
  const [manager, setManager] = useState(row.clientManagerPersonId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** The person the cycle names, as the menu item and the row's cell read it. */
  const named = row.clientManagerPersonId !== null;
  /** A part whose link the change would stop. */
  const hasPart = row.clientManagerPartId !== null;
  if (!may["org.reviews"]) return null;

  function save() {
    setError(null);
    onBusy(true);
    startTransition(async () => {
      try {
        const r = await changeClientManagerAction({ cycleId: row.cycleId, teamMemberId: row.teamMemberId, clientManagerPersonId: manager });
        if (!r.ok) setError(r.error);
        else onSaved();
      } finally {
        onBusy(false);
      }
    });
  }

  return (
    <div className="cr-menu-change">
      <button type="button" className="cr-menu-back" onClick={onBack} disabled={pending}>
        ‹ Back
      </button>
      <label className="admin-field u-m-0">
        <span className="admin-label">{row.name}&apos;s client manager</span>
        <select className="admin-input" value={manager} onChange={(e) => setManager(e.target.value)}>
          <option value="" disabled>
            Choose a contact
          </option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {hasPart && <p className="admin-hint u-m-0">The new client manager gets a new link to copy. The old one stops working.</p>}
      {error && (
        <p className="admin-hint u-m-0" role="alert">
          {error}
        </p>
      )}
      <div className="cr-menu-change-actions">
        <button type="button" className="admin-btn admin-btn--sm" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--primary"
          disabled={pending || !manager || manager === row.clientManagerPersonId}
          onClick={save}
        >
          {named ? "Change client manager" : "Add client manager"}
        </button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="cr-menu-group">
      <p className="cr-menu-group-label" aria-hidden="true">
        {label}
      </p>
      {children}
    </div>
  );
}

function Item({ label, hint, danger, onSelect }: { label: string; hint: string; danger?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitem" className={`cr-menu-item${danger ? " is-danger" : ""}`} onClick={onSelect}>
      <span className="cr-menu-item-label">{label}</span>
      <span className="cr-menu-item-hint">{hint}</span>
    </button>
  );
}
