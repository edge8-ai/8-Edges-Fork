// What the App's public frame and the root layout say about the organisation
// that runs this deployment: its <head> copy, its marks, and the links its
// header and footer carry. The kernel owns the shape and the frame that draws
// it; the values are the organisation's, provided through the `publicPresence`
// shell slot (app/shell.ts) by the entity that owns the company itself, org.
// A deployment without org gets EMPTY_PUBLIC_PRESENCE below, and the frame
// falls back to the kernel/config identity (ADR 0026) for the name.
//
// ADR 0034, step 3 (A.79.7): this replaced the marketing site's SiteFrame and
// its four <head> constants, so the App keeps its public frame when the site
// leaves for its own repository.

/** One link the frame renders: a path on this deployment, or an absolute URL. */
export type LinkEntry = { path: string; name: string; desc?: string };

export type PublicPresence = {
  /** The default <title>, browser tab and social card title. */
  title: string;
  /** The default meta description. */
  description: string;
  /** The short name, for og:siteName. */
  name: string;
  /** The mark in the header, and on dark in the footer. Empty: a text wordmark. */
  logoSrc: string;
  logoDarkSrc: string;
  /** The line under the footer's mark. */
  footerTagline: string;
  /** The name after the © in the footer. */
  copyrightName: string;
  phones: string[];
  /** The header's Services group and the footer's Services column. */
  services: LinkEntry[];
  /** Standalone links the header and footer render outside Services. */
  navExtra: LinkEntry[];
  /** Company pages that are not in every build (About). */
  companyLinks: LinkEntry[];
  /** The header's Resources group. */
  productLinks: LinkEntry[];
  /** The organisation's social profiles, as absolute URLs. */
  socialLinks: LinkEntry[];
  /** Whether this deployment has the /workflows library to link to. */
  hasWorkflows: boolean;
};

export const EMPTY_PUBLIC_PRESENCE: PublicPresence = {
  title: "",
  description: "",
  name: "",
  logoSrc: "",
  logoDarkSrc: "",
  footerTagline: "",
  copyrightName: "",
  phones: [],
  services: [],
  navExtra: [],
  companyLinks: [],
  productLinks: [],
  socialLinks: [],
  hasWorkflows: false,
};

/** Join the parts of a <title> with " | ", dropping the empty ones, so a
 *  deployment with no name says "Careers" rather than "Careers | ". */
export function pageTitle(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" | ");
}
