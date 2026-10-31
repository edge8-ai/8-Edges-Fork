import { afterEach, describe, expect, it } from "vitest";
import { readOpenGroups, rememberGroup, resetOpenGroupsForTest } from "./team-nav-memory";

// The tests run in node, so each one hands the module the window it needs.
function withStorage(store: Partial<Storage>) {
  (globalThis as { window?: unknown }).window = { localStorage: store };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  resetOpenGroupsForTest();
});

describe("the sidebar's remembered groups", () => {
  it("keeps a group opened or closed by hand for the next page load", () => {
    const data = new Map<string, string>();
    withStorage({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) });
    rememberGroup("Me", false);
    rememberGroup("Revenue/CRM", true);
    resetOpenGroupsForTest();
    expect(readOpenGroups()).toEqual({ Me: false, "Revenue/CRM": true });
  });

  it("remembers nothing when storage refuses, and does not throw", () => {
    withStorage({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readOpenGroups()).toEqual({});
    expect(() => rememberGroup("Me", true)).not.toThrow();
  });

  it("keeps only label → boolean pairs from a value someone else wrote", () => {
    withStorage({ getItem: () => JSON.stringify({ Me: true, Company: "yes", "My Team": 1 }) });
    expect(readOpenGroups()).toEqual({ Me: true });
    withStorage({ getItem: () => "[true]" });
    expect(readOpenGroups()).toEqual({});
    withStorage({ getItem: () => "not json" });
    expect(readOpenGroups()).toEqual({});
  });
});
