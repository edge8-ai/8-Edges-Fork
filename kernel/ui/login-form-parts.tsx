"use client";

// The prop contract and the small presentational pieces of kernel/ui/LoginForm.
// They live here so the form file stays under the 250-line cap and reads as the
// state machine it is; nothing here holds state.

export type LoginFormProps = {
  // Which screen the form opens on: "password" for surfaces where a password is
  // the norm, "link" for the magic-link-first ones.
  defaultMode: "link" | "password";
  // Where a successful password sign-in lands. A function receives the page's
  // search params, for surfaces that honour a (sanitised) `?redirect=`.
  redirectTo: string | ((params: URLSearchParams) => string);
  emailLabel: string;
  // Copy above the email field on the magic-link screen.
  linkPrompt: string;
  // Shown when the page is reached as ?error=1 from a failed verify.
  invalidLinkError: string;
  // "toolbar": a plain button in the form actions. "inline": a small link on the
  // password label row.
  forgotPasswordPlacement: "toolbar" | "inline";
  // "send": Forgot password sends the reset for the email already typed.
  // "screen": it opens a dedicated screen with its own email field.
  resetFlow: "send" | "screen";
  // "replace": a sent notice replaces the whole form (there is no way back).
  // "inline": it renders as an alert above the fields.
  noticePlacement: "replace" | "inline";
  // The two mode toggles, and whether each sits inside the form actions (styled
  // as a button) or below them (styled as a link).
  switchToLinkLabel: string;
  switchToLinkPlacement: "actions" | "below";
  switchToPasswordLabel: string;
  switchToPasswordPlacement: "actions" | "below";
  // Only for resetFlow "screen": the copy above its email field and the label of
  // its way back to the sign-in screen.
  resetPrompt?: string;
  backFromResetLabel?: string;
  // The neutral confirmations. Both take the normalised email.
  linkSentMessage: (email: string) => string;
  resetSentMessage: (email: string) => string;
  // Per-screen email input ids, where a surface uses distinct ones.
  emailInputIds?: { password?: string; link?: string; reset?: string };
  // The entity's server actions. Both resolve whether or not an email went out.
  requestSignInLink: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
};

export function Alerts({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {notice && <div className="admin-alert admin-alert--ok">{notice}</div>}
    </>
  );
}

export function EmailField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="admin-field">
      <label className="admin-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="admin-input"
        type="email"
        autoComplete="email"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// A mode toggle. Inside the form actions it is a button; below them it is a
// link — the two surfaces that place it below also style it that way.
export function SwitchButton({
  label,
  placement,
  onClick,
}: {
  label: string;
  placement: "actions" | "below";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={placement === "actions" ? "admin-btn" : "admin-auth-link"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
