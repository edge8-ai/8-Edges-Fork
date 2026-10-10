import { headers } from "next/headers";

// Server-only. Resolves the current request's origin (matches the checkout
// route's `new URL(request.url).origin` derivation) for building absolute
// URLs — signup/feedback QR links, ticket links, etc. Falls back to the
// production domain for contexts with no request (local scripts, cron).
// Vercel cron and deploy-hook requests arrive on the deployment's generated
// *.vercel.app host (which sits behind deployment protection), so that host
// must never leak into user-facing links; treat it like the no-request case.
// NEVER import from a client component.
//
// Async since Next 16 removed synchronous headers() (B.18.3). Six crons call it
// too; Khoa chose on 2026-10-02 to have them await it rather than read only the
// configured origin, so a cron run from a custom host keeps building links on
// that host.
export async function getSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  if (host && !host.endsWith(".vercel.app")) return `${proto}://${host}`;
  // No fallback. A link built on the wrong origin is worse than one that is
  // obviously empty: it works, it looks right, and it sends the recipient to
  // another company. Set NEXT_PUBLIC_SITE_URL.
  return process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

