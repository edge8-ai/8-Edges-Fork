"use client";

import { useState, type CSSProperties } from "react";

// Self-contained password field with a show/hide eye toggle, for pages OUTSIDE
// the admin shell (the private access-code gates) that cannot use the admin.css
// PasswordField. Inline styles only, no stylesheet dependency. The caller keeps
// its own look via inputStyle; wrapperStyle carries layout (flex, margin).
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  inputStyle,
  wrapperStyle,
  ariaLabel = "access code",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputStyle?: CSSProperties;
  wrapperStyle?: CSSProperties;
  ariaLabel?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "block", ...wrapperStyle }} /* layout-ok: the private access-code gate renders before any stylesheet loads, so this field is inline-only by design */>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ ...inputStyle, width: "100%", paddingRight: 40, boxSizing: "border-box" }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? `Hide ${ariaLabel}` : `Show ${ariaLabel}`}
        aria-pressed={show}
        style={{ /* layout-ok: same reason as the wrapper above, no stylesheet is available at the gate */
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          padding: 0,
          border: 0,
          background: "transparent",
          color: "var(--color-text-body)",
          cursor: "pointer",
        }}
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
            <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}
