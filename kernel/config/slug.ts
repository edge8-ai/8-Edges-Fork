// The one slug rule for the codebase. Six local `slugify`s used to disagree on
// accent handling (three mangled Vietnamese titles into stray dashes), on the
// length cap, and on whether the result could be empty, so the same title
// produced different slugs depending on which admin page created the row.
//
// Rules: NFD-decompose so accented Latin (including Vietnamese ơ/ư/â/ê and tone
// marks) becomes base letter + combining marks, strip the marks, replace đ/Đ
// explicitly (they do not decompose), lowercase, collapse every non-alphanumeric
// run to a single dash, trim dashes, cap the length (default 80) and trim again
// so the cut never leaves a trailing dash. Uniqueness is the caller's job — each
// call site dedupes or relies on its table's unique constraint. An empty or
// symbol-only input yields "" so callers can substitute their own fallback.
export function slugify(text: string, max = 80): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

// ---------------------------------------------------------------------------
// Readable record URLs: <folded-name>-<short-code>, e.g. "nguyen-thi-mai-a7dfed24".
// The short code is the first 8 hex of the row's uuid, so there is no slug
// column and no uniqueness to maintain — the page resolves the code back to the
// row. Pure and client-safe. These sat on company-os while it was the only
// entity with such URLs; they moved here when boards became its own entity and
// needed cardSlug, because a pure string helper is not any one entity's to own.
// ---------------------------------------------------------------------------

// The uuid's first dash-group is exactly its first 8 hex characters.
const SHORT_LEN = 8;

// Fold a display name to an ASCII slug segment. NFD decomposes accented Latin
// (including Vietnamese ơ/ư/â/ê and the tone marks) into base letter + combining
// marks, which we strip; đ/Đ do NOT decompose, so they are replaced explicitly.
// "Nguyễn Thị Mai" -> "nguyen-thi-mai". Same folding as lib/slug.ts#slugify, kept
// separate because application slugs cap at 60 and are paired with a short code.
export function foldName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d") // đ
    .replace(/Đ/g, "d") // Đ
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// The 8-hex code for an application id.
export function shortCode(id: string): string {
  return id.slice(0, SHORT_LEN);
}

// The canonical slug for an application. A blank/empty name collapses to just the
// short code, which still resolves.
export function appSlug(name: string | null | undefined, id: string): string {
  return [foldName(name || ""), shortCode(id)].filter(Boolean).join("-");
}

// The canonical detail path.
export function appPath(name: string | null | undefined, id: string): string {
  return `/admin/talent/applications/${appSlug(name, id)}`;
}

// Deals share the same name+short-code scheme. The "name" is the deal's own
// label (title, else contact/company), folded the same way. Resolution on the
// detail route reuses shortOf/shortCodeRange/isUuid below, exactly as
// applications do — there is no slug column to maintain.
export function dealSlug(label: string | null | undefined, id: string): string {
  return [foldName(label || ""), shortCode(id)].filter(Boolean).join("-");
}

// The canonical deal detail path.
export function dealPath(label: string | null | undefined, id: string): string {
  return `/admin/revenue/deals/${dealSlug(label, id)}`;
}

// Board cards use the same name+short-code scheme for their shareable ?card=
// value, e.g. "fix-the-login-bug-030b0f26". The board resolves it back to the
// card client-side (it already holds every card), matching shortOf() below
// against each card's shortCode — no slug column, no server round-trip.
export function cardSlug(title: string | null | undefined, id: string): string {
  return [foldName(title || ""), shortCode(id)].filter(Boolean).join("-");
}

// The trailing hyphen group of a slug — the candidate short code by construction.
export function shortOf(slug: string): string {
  return slug.slice(slug.lastIndexOf("-") + 1).toLowerCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_RE = /^[0-9a-f]{8}$/;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function isShortCode(s: string): boolean {
  return SHORT_RE.test(s);
}

// The inclusive uuid bounds that select every id whose first 8 hex match `short`.
// PostgREST cannot ILIKE a uuid column, so resolution uses this range instead.
export function shortCodeRange(short: string): { lo: string; hi: string } {
  return {
    lo: `${short}-0000-0000-0000-000000000000`,
    hi: `${short}-ffff-ffff-ffff-ffffffffffff`,
  };
}
