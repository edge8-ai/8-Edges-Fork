"use client";

import { useState } from "react";
import { TEMPORARY_PASSWORD_HOURS } from "@/kernel/identity/temporary-password-hours";

// The temporary password an invite or a resend made because this instance
// cannot send email (kernel/identity/temporary-password.ts). It is on screen
// once, here, and nothing stores it: Done is the last time anyone sees it.
export function TemporaryPasswordNotice({ password, onDone }: { password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="admin-alert admin-alert--info u-stack u-mb-4" role="status">
      <span className="u-label">Temporary password</span>
      <div className="u-row u-wrap">
        <code className="u-strong u-tabular">{password}</code>
        <button
          type="button"
          className="admin-btn admin-btn--sm"
          onClick={async () => {
            // The clipboard is refused outside a secure context; the password
            // stays on screen to be copied by hand.
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <span>
        Give it to them yourself, in person or in a message: it is shown only now. They sign in with their email and this password (Sign in
        with a password, on the login page) and choose their own straight away. It works for {TEMPORARY_PASSWORD_HOURS} hours; after that,
        Resend on the Invitations tab gives them a new one.
      </span>
      <div className="u-row u-end">
        <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
