import { useSyncExternalStore } from "react";

// Which sidebar groups a person opened or closed by hand, kept in this browser
// (TH.5). Khoa chose per device on 2026-10-11: no table and no write on every
// click, and a phone and a laptop may reasonably want different sidebars.
//
// Keys are a group's label ("Me") or a group and subsection ("Revenue/CRM").
// Storage can be absent or refuse (a private window, blocked site data), and
// a value someone else wrote can be anything, so a read that fails or finds
// something other than label → boolean answers "nothing remembered". The
// choices are also held in memory, so a toggle works for the visit even when
// storage refuses to keep it.
//
// It is an external store rather than state set in an effect: the server, and
// the browser's first render, draw the sidebar from the URL alone (EMPTY), and
// React then re-renders with what this browser remembers, without a hydration
// mismatch and without a setState inside an effect.
const KEY = "edge8.team-nav.open";
const EMPTY: Record<string, boolean> = {};

export function readOpenGroups(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>;
  } catch {
    return {};
  }
}

let current: Record<string, boolean> | null = null;
const listeners = new Set<() => void>();

function snapshot(): Record<string, boolean> {
  current ??= readOpenGroups();
  return current;
}

function subscribe(onChange: () => void): () => void {
  // Another tab changing the sidebar is picked up too.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    current = readOpenGroups();
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function rememberGroup(key: string, open: boolean): void {
  current = { ...snapshot(), [key]: open };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Remembering is a convenience: the sidebar works the same without it.
  }
  for (const l of listeners) l();
}

export function useOpenGroups(): Record<string, boolean> {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** Forget the in-memory copy, so a test starts from storage. */
export function resetOpenGroupsForTest(): void {
  current = null;
}
