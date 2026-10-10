// Broadcasts are numbered issues: every letter is "The Edge 01", "The Edge 02"
// and so on, and every issue of a series is "<series name> 01", "<series name>
// 02". The number is read off the names already used, not counted, so a
// deleted or renamed broadcast never makes two issues share a number.

const LETTER_PREFIX = "The Edge";

export function nextIssueName(prefix: string, names: string[]): string {
  const escaped = prefix.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numbered = new RegExp(`^${escaped} (\\d+)\\b`, "i");
  const highest = names.reduce((max, name) => {
    const n = Number(numbered.exec(name.trim())?.[1] ?? 0);
    return n > max ? n : max;
  }, 0);
  return `${prefix.trim()} ${String(highest + 1).padStart(2, "0")}`;
}

export function nextLetterName(names: string[]): string {
  return nextIssueName(LETTER_PREFIX, names);
}
