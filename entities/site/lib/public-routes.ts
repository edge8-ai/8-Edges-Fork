// The public route map: what sitemap.ts and llms.txt/route.ts advertise.
//
// This file is an overlay stub for 8-Edges-Fork. It only neutralises upstream
// while it sits at the SAME repo-relative path as the real module — today
// entities/site/lib/public-routes.ts. Move that module and this copy moves with
// it, or the fork gets the upstream list and this one lands where nothing
// imports it.
//
// Fork note: a sitemap and an llms.txt are lists of links, and they were the
// one place the exclusions could not reach. The service-line pages
// (/caio-leadership/, /global-staffing/, /training-and-certification/,
// /your-first-ai-hire/, /ai-programs/, /about/, /case-studies/) and the product
// page (/8-edges-app/) are internal and do not ship — but both files listed
// them, so a fork published a sitemap advertising eight pages that 404 on its
// own domain, and an llms.txt describing the upstream's services, in the
// upstream's words, to every AI crawler that asked.
//
// Left here are the routes a fork actually serves. Anything added upstream has
// to be added here deliberately, which is the point: a page is advertised
// because someone decided it exists, not because a list was copied.
// Types declared here, not imported: in the fork THIS file is
// entities/site/lib/public-routes.ts, so importing from that path would be the
// module importing itself.
export type StaticRoute = {
  path: string;
  priority: number;
  changeFrequency: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
};

export type LinkEntry = { path: string; name: string; desc?: string };

export const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

export const STATIC_ROUTES: StaticRoute[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/contact/", priority: 0.9, changeFrequency: "monthly" },
  { path: "/blog/", priority: 0.8, changeFrequency: "daily" },
  { path: "/careers/", priority: 0.7, changeFrequency: "weekly" },
  { path: "/legal/privacy/", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/eula/", priority: 0.3, changeFrequency: "yearly" },
];

// No service lines: those pages are the upstream's and are not in this build.
export const SERVICES: LinkEntry[] = [];

export const COMPANY: LinkEntry[] = [
  { path: "/blog/", name: "Blog", desc: "Articles and updates." },
  { path: "/careers/", name: "Careers", desc: "Open roles." },
  { path: "/contact/", name: "Contact", desc: "Get in touch." },
];

// The nav and footer render these outside the Services group. Empty for the
// same reason SERVICES is: the pages are not in this build, and a link to a
// page that does not exist is a 404 wearing the upstream's vocabulary.
export const NAV_EXTRA: LinkEntry[] = [];
export const COMPANY_LINKS: LinkEntry[] = [];
export const PRODUCT_LINKS: LinkEntry[] = [];

// Social profiles are the upstream's accounts. Empty rather than guessed: a
// fork sets its own, and until it does the footer shows no social row at all,
// which is better than a row pointing at somebody else's company page.
export const SOCIAL_LINKS: LinkEntry[] = [];

// The case-study index is upstream's, and naming other people's clients is the
// thing scan-tree.sh exists to stop.
export const INCLUDES_CASE_STUDIES = false;

/** Derived from SERVICES above, which is empty here — so the home page's
 *  service sections do not render at all in the fork. */
export const HAS_SERVICE_PAGES = SERVICES.length > 0;

// The <head> copy. Empty, not translated: a title is marketing, and inventing
// one for somebody else's company is worse than letting them set their own.
// app/layout.tsx falls back to NEXT_PUBLIC_ORG_NAME, so a fork that has filled
// in its identity gets its own name in the tab and nothing borrowed.
export const SITE_TITLE = "";
export const SITE_DESCRIPTION = "";
export const SITE_NAME = "";

// entities/library is internal: /workflows and its 24 pages are not in this
// build, so nothing may link to them.
export const HAS_WORKFLOWS = false;

// Empty for the same reason SITE_TITLE is. The footer renders no tagline line
// at all rather than the upstream's positioning statement.
export const FOOTER_TAGLINE = "";

// llms.txt says who a site is. Empty here: the heading falls back to the fork's
// own NEXT_PUBLIC_ORG_NAME, and no paragraph is better than the upstream's
// summary of its own business.
export const SITE_SUMMARY_HEADING = "";
export const SITE_SUMMARY = "";
export const SITE_SUMMARY_BODY = "";

// The upstream's mark, phone numbers and legal name. All empty: a logo is a
// trademark, a phone number reaches a person, and the copyright line names an
// owner. The header and footer fall back to NEXT_PUBLIC_ORG_NAME as text and
// omit what has no value.
export const LOGO_SRC = "";
export const LOGO_DARK_SRC = "";
export const PHONES: string[] = [];
export const COPYRIGHT_NAME = "";

// Page titles and descriptions. The page's own name and nothing else: a
// description is marketing, and the upstream's described its offer.
export const PAGE_META: Record<string, { title: string; description?: string }> = {
  blog: { title: "Blog" },
  careers: { title: "Careers" },
  contact: { title: "Contact" },
  privacy: { title: "Privacy Policy" },
  eula: { title: "Terms of Service" },
};

// Two clauses of legal text that state facts about a particular company. Empty:
// a fork writes its own privacy policy and terms, and until it does, an omitted
// clause is honest where an inherited one is false.
export const LEGAL_JURISDICTIONS = "";
export const LEGAL_SERVICES_SUMMARY = "";
