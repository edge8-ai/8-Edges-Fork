// The profile editor's small parts (RP.6): inputs that keep what the manager
// typed while the draft holds what it means, and the line that puts a refusal
// beside its field. Imported only by ProfileEditor's tree, so they run in the
// browser with it.
import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { ProfileIssue } from "@/entities/replenishment/client";
import { issuesAt } from "@/entities/replenishment/ui/profile-draft";

/** Every section's handle on the draft: the part it edits, the change it makes, and the refusal's issues. */
export type Part<T> = { value: T; onChange: (next: T) => void; issues: readonly ProfileIssue[] };

type Parsing<T> = { value: T; format: (value: T) => string; parse: (text: string) => T; onValue: (value: T) => void };

/**
 * Text that is not its value: "8, " while the manager is typing "8, 12", or
 * "" for a number not given yet. The typed text is kept, the draft gets the
 * parsed value, and the text is taken from the value again only when the
 * value changes from outside (a move switching kind, a band removed above).
 */
function useParsedText<T>({ value, format, parse, onValue }: Parsing<T>): [string, (text: string) => void] {
  const [text, setText] = useState(() => format(value));
  const [seen, setSeen] = useState<T>(value);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setText(format(value));
  }
  return [
    text,
    (typed) => {
      const next = parse(typed);
      setText(typed);
      setSeen(next);
      onValue(next);
    },
  ];
}

type InputProps<T> = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & Parsing<T>;

export function ParsedInput<T>({ value, format, parse, onValue, className, ...rest }: InputProps<T>) {
  const [text, onText] = useParsedText({ value, format, parse, onValue });
  return <input {...rest} className={className ?? "admin-input"} value={text} onChange={(e) => onText(e.target.value)} />;
}

type TextareaProps<T> = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & Parsing<T>;

export function ParsedTextarea<T>({ value, format, parse, onValue, className, ...rest }: TextareaProps<T>) {
  const [text, onText] = useParsedText({ value, format, parse, onValue });
  return <textarea {...rest} className={className ?? "admin-textarea"} value={text} onChange={(e) => onText(e.target.value)} />;
}

/**
 * The refusal's words for `path` and anything inside it, beside the field.
 * Nothing when it passes. `exact` keeps a list's own refusal ("needs a pick
 * zone") from repeating what each of its entries already shows.
 */
export function FieldIssue({ issues, path, exact = false }: { issues: readonly ProfileIssue[]; path: string; exact?: boolean }) {
  const messages = issuesAt(exact ? issues.filter((issue) => issue.path === path) : issues, path);
  if (messages.length === 0) return null;
  return <span className="admin-hint u-err">{messages.join(" ")}</span>;
}
