// The pure parts of the person page's postcard (OV.5): which icon a hobby
// sticker wears, how the start date reads on the postmark, and the sentence
// that names the role fields a profile has not filled in. Kept apart from the
// page so they are tested without a render.

// Hobbies are free text people type on their own profile, so a sticker picks
// its icon by keyword and falls back to a star. The paths are 24×24 stroke
// icons drawn in the sticker's own ink.
const HOBBY_ICONS: [RegExp, string][] = [
  [/read|book/, "M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z M12 6v13"],
  [/shop/, "M5 8h14l-1 12H6z M9 8a3 3 0 0 1 6 0"],
  [/sport|ball|gym|run|swim|tennis|badminton/, "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18"],
  [/coffee|tea/, "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M16 10h2a2 2 0 0 1 0 4h-2 M8 3v3 M12 3v3"],
  [/travel|trip/, "M2 12 22 4l-6 16-4-7z M12 13 22 4"],
  [/cook|bak/, "M4 11h16 M6 11v5a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-5 M9 7c0-2 2-2 2-4 M13 7c0-2 2-2 2-4"],
  [/sleep|nap/, "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"],
  [/tik ?tok|music|sing|guitar|piano/, "M9 18V5l11-2v13 M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z M20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"],
  [/eat|food/, "M7 3v8 M5 3v5a2 2 0 0 0 4 0V3 M7 11v10 M17 3c-2 0-3 3-3 6s1 4 3 4v8"],
  [/game/, "M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4z M7 12v3 M5.5 13.5h3"],
  [/photo|camera/, "M4 8h3l2-3h6l2 3h3v11H4z M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7z"],
];
const STAR = "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z";

export function hobbyIcon(hobby: string): string {
  const h = hobby.toLowerCase();
  return HOBBY_ICONS.find(([re]) => re.test(h))?.[1] ?? STAR;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// "2026-06-05" reads "JUN 5" over "2026" on the postmark. A calendar date has
// no time zone, so the parts are read from the string, never through Date.
export function postmarkDate(iso: string | null): { day: string; year: string } | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return { day: `${month} ${Number(m[3])}`, year: m[1] };
}

// The role rows hide what is empty, so the card says which of them are missing
// rather than printing a column of dashes: "Department and manager not added yet."
export function missingSentence(labels: string[]): string | null {
  if (labels.length === 0) return null;
  const [first, ...rest] = labels;
  const lower = rest.map((l) => l.toLowerCase());
  const all = [first, ...lower];
  const list = all.length === 1 ? all[0] : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
  return `${list} not added yet.`;
}

// The organisation's short mark for the stamp and the sticker: "Edge8" is
// "E8", a name with no digits is its first two letters. No name, no mark.
export function orgMark(name: string | null): string | null {
  const letters = name?.replace(/[^A-Za-z0-9]/g, "") ?? "";
  if (!letters) return null;
  const digits = /\d+/.exec(letters)?.[0];
  return (letters[0] + (digits ?? letters[1] ?? "")).toUpperCase();
}
