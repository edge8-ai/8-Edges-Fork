"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SaveResult } from "../actions";

// The contract-start form used to be a plain server-action <form> with a static
// "Save" button: no pending state, no confirmation, and DB errors swallowed. This
// wraps it with useActionState/useFormStatus so the admin gets "Saving…", a "Saved ✓"
// confirmation, and a visible error if the write fails.

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-secondary u-p-1 u-sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function ContractStartForm({
  action,
  defaultValue,
}: {
  action: (prev: SaveResult | null, formData: FormData) => Promise<SaveResult>;
  defaultValue: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="u-row u-wrap">
      <input type="date" name="contract_start_date" defaultValue={defaultValue} />
      <SubmitButton />
      {state?.ok && (
        <span className="admin-cell-muted u-sm">
          Saved ✓
        </span>
      )}
      {state && !state.ok && (
        <span className="u-sm u-err">{state.error}</span>
      )}
    </form>
  );
}
