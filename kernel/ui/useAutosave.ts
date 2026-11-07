"use client";

import { useCallback, useRef, useState } from "react";

type SaveResult = { ok: true } | { ok: false; error: string };

export type AutosaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; error: string };

/**
 * Field-level autosave for shelf edit forms. Call `field(key, value)` on every
 * keystroke/change to keep the control controlled, then `commit(key, value)`
 * on blur (text/textarea) or immediately in onChange (select/checkbox) to
 * persist just that field. Skips the request if the value hasn't changed
 * since the last successful save, so tabbing through untouched fields is free.
 */
export function useAutosave<T extends Record<string, unknown>>(
  initial: T,
  save: (patch: Partial<T>) => Promise<SaveResult>,
) {
  const [form, setForm] = useState<T>(initial);
  const savedRef = useRef<T>(initial);
  const [status, setStatus] = useState<AutosaveStatus>({ state: "idle" });

  const field = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const commit = useCallback(
    async <K extends keyof T>(key: K, value: T[K]) => {
      if (Object.is(savedRef.current[key], value)) return;
      setStatus({ state: "saving" });
      const res = await save({ [key]: value } as unknown as Partial<T>);
      if (!res.ok) {
        setStatus({ state: "error", error: res.error });
        return;
      }
      savedRef.current = { ...savedRef.current, [key]: value };
      setStatus({ state: "saved" });
    },
    [save],
  );

  return { form, field, commit, status };
}
