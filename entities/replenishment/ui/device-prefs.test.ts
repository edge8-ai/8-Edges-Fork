import { describe, expect, it } from "vitest";
import { devicePrefs } from "./device-prefs";

// The scanner's two per-device conveniences (RP.5): light or dark, and whether
// the instructions were read. Blocked storage must never break the screen; it
// only means the instructions open every time.
function memory() {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), items };
}

describe("devicePrefs", () => {
  it("remembers the theme and that the instructions were read", () => {
    const store = memory();
    const prefs = devicePrefs(() => store);
    expect(prefs.theme()).toBeNull();
    expect(prefs.instructionsSeen()).toBe(false);
    prefs.setTheme("dark");
    prefs.markInstructionsSeen();
    // A fresh read, as the next visit makes it.
    const again = devicePrefs(() => store);
    expect(again.theme()).toBe("dark");
    expect(again.instructionsSeen()).toBe(true);
  });

  it("reads anything but light or dark as no choice, so the device's own theme applies", () => {
    const store = memory();
    store.setItem("replenishment.scanner.theme", "sepia");
    expect(devicePrefs(() => store).theme()).toBeNull();
  });

  it("opens the instructions every time, and throws nothing, when storage cannot be reached", () => {
    const prefs = devicePrefs(() => {
      throw new Error("SecurityError: storage is disabled");
    });
    expect(prefs.theme()).toBeNull();
    expect(prefs.instructionsSeen()).toBe(false);
    expect(() => prefs.setTheme("light")).not.toThrow();
    expect(() => prefs.markInstructionsSeen()).not.toThrow();
    expect(prefs.instructionsSeen()).toBe(false);
  });

  it("throws nothing when every read and write is refused, as a full or locked-down store does", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const prefs = devicePrefs(() => refusing);
    expect(() => prefs.markInstructionsSeen()).not.toThrow();
    expect(prefs.instructionsSeen()).toBe(false);
    expect(prefs.theme()).toBeNull();
  });

  it("treats a missing store as empty", () => {
    expect(devicePrefs(() => null).instructionsSeen()).toBe(false);
  });
});
