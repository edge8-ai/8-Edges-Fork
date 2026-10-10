"use client";

// A next/link that keeps a shared screen's links on the surface the viewer is
// on. Screens served on both /admin and /team (the Revenue section) keep their
// hrefs written as /admin/revenue/...; under /team this rewrites them to
// /team/revenue/.... Any other href passes through untouched, so a link to a
// screen that only exists in admin still points at admin.

import Link from "next/link";
import type { ComponentProps } from "react";
import { useSurfaceBase } from "./surface-client";

// Re-exported so a file that already imports SurfaceLink can read the surface
// for a non-link navigation (a router.push) without a second import.
export { useSurfaceBase };

const SHARED_PREFIX = "/admin/revenue";

export function SurfaceLink({ href, ...rest }: ComponentProps<typeof Link>) {
  const base = useSurfaceBase();
  const shared = typeof href === "string" && (href === SHARED_PREFIX || href.startsWith(`${SHARED_PREFIX}/`) || href.startsWith(`${SHARED_PREFIX}?`));
  return <Link href={shared ? `${base}${href.slice("/admin".length)}` : href} {...rest} />;
}
