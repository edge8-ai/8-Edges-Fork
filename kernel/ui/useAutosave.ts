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

  // Persist several fields in one save, for an edit that only makes sense
  // whole: the Team drawer's Goes by fix sets given name, family name and Goes
  // by together, and part of it saved alone would show a wrong name (S.23.5).
  // Unlike commit, it updates the controls only once the save succeeds, so a
  // refused edit leaves every field as it was. Resolves true when saved, or
  // when nothing differed from the last save.
  const commitMany = useCallback(
    async (patch: Partial<T>): Promise<boolean> => {
      const saved: Record<string, unknown> = savedRef.current;
      const changed = Object.fromEntries(
        Object.entries(patch).filter(([key, value]) => !Object.is(saved[key], value)),
      ) as Partial<T>;
      if (Object.keys(changed).length === 0) return true;
      setStatus({ state: "saving" });
      const res = await save(changed);
      if (!res.ok) {
        setStatus({ state: "error", error: res.error });
        return false;
      }
      savedRef.current = { ...savedRef.current, ...changed };
      setForm((f) => ({ ...f, ...changed }));
      setStatus({ state: "saved" });
      return true;
    },
    [save],
  );

  return { form, field, commit, commitMany, status };
}
