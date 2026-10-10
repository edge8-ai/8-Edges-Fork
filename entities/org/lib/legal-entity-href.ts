// Where another screen sends whoever keeps the legal details: Settings → Legal
// entities, opened on one entity's drawer when the caller knows which (the
// reimbursement VAT box names the Vietnamese buyer, RB.15). Owned here, beside
// the page, so a moved route changes one file. Client-safe: no imports.
const LEGAL_ENTITIES_PATH = "/admin/settings/legal-entities";

export function legalEntityEditHref(slug: string | null): string {
  return slug ? `${LEGAL_ENTITIES_PATH}?open=${encodeURIComponent(slug)}` : LEGAL_ENTITIES_PATH;
}
