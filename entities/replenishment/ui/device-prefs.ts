// The two things a scanner remembers about itself (RP.5; spec "Surfaces"):
// light or dark, and whether its instructions have been read. Both are
// per-device conveniences, so they live in the browser's storage, never in the
// database, and job progress never lives here.
//
// Storage can be missing or refuse every call (a private window, a locked-down
// handheld, a full quota), so every access is wrapped: blocked storage only
// means the screen follows the device's own theme and the instructions open
// every time.

export type Theme = "light" | "dark";

const THEME = "replenishment.scanner.theme";
const INSTRUCTIONS_SEEN = "replenishment.scanner.instructions-seen";

type Store = Pick<Storage, "getItem" | "setItem">;

/** The scanner's preferences over `storage`, which may itself throw when reached. */
export function devicePrefs(storage: () => Store | null | undefined) {
  const read = (key: string): string | null => {
    try {
      return storage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string): void => {
    try {
      storage()?.setItem(key, value);
    } catch {
      // Blocked storage: the choice lasts until the page closes, which is all it can do.
    }
  };
  return {
    theme(): Theme | null {
      const value = read(THEME);
      return value === "light" || value === "dark" ? value : null;
    },
    setTheme(theme: Theme): void {
      write(THEME, theme);
    },
    instructionsSeen(): boolean {
      return read(INSTRUCTIONS_SEEN) === "1";
    },
    markInstructionsSeen(): void {
      write(INSTRUCTIONS_SEEN, "1");
    },
  };
}
