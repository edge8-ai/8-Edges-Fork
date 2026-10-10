"use client";

/**
 * The picker body for a chip whose value is typed rather than chosen (W.159):
 * the due date and the Human Tokens on the drawer's pinned line. One field,
 * focused when the picker opens; Enter or Done closes it; an optional button
 * clears the value. Choosing changes the form only, and Save writes it.
 */
export function ChipInputPanel({
  type,
  label,
  value,
  onChange,
  close,
  clearLabel,
  onClear,
}: {
  type: "date" | "number";
  label: string;
  value: string;
  onChange: (value: string) => void;
  close: () => void;
  /** Shown only while there is a value to clear. */
  clearLabel?: string;
  onClear?: () => void;
}) {
  return (
    <div className="wb-pill-pr">
      <input
        className="admin-input"
        type={type}
        data-pill-autofocus=""
        aria-label={label}
        placeholder={type === "number" ? "—" : undefined}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? 0.05 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            close();
          }
        }}
      />
      <div className="wb-pill-pr-actions">
        {value && onClear && clearLabel && (
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            onClick={() => {
              onClear();
              close();
            }}
          >
            {clearLabel}
          </button>
        )}
        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={close}>
          Done
        </button>
      </div>
    </div>
  );
}
