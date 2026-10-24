// Campaign attribution at intake (2026-09-13). A visitor who lands from a
// campaign link carries utm_* in the URL of one page; the form they fill is
// usually on another. The first page remembers the values for the session
// and every site form sends them back, so the inquiry can be attributed to
// the campaign the moment it is created. Pure and browser-safe; storage is
// wrapped because a private window may refuse it.

export type UtmValues = { campaign: string; source?: string; medium?: string; content?: string };

export const UTM_STORAGE_KEY = "edge8.utm";

// The utm_* values present in a query string, or null when there is no campaign.
export function utmFromSearch(search: string): UtmValues | null {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const campaign = (p.get("utm_campaign") ?? "").trim().toLowerCase();
  if (!campaign) return null;
  const pick = (k: string) => {
    const v = (p.get(k) ?? "").trim();
    return v ? v.slice(0, 120) : undefined;
  };
  return { campaign: campaign.slice(0, 120), source: pick("utm_source"), medium: pick("utm_medium"), content: pick("utm_content") };
}

export function rememberUtm(search: string): void {
  const utm = utmFromSearch(search);
  if (!utm) return;
  try {
    window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // Storage refused: the attribution is lost for this session, the form still works.
  }
}

export function readUtm(): UtmValues | null {
  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<UtmValues>;
    return v && typeof v.campaign === "string" && v.campaign ? { campaign: v.campaign, source: v.source, medium: v.medium, content: v.content } : null;
  } catch {
    return null;
  }
}
