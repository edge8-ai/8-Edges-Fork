// Which authenticated surface a request is on, for screens that are served on
// two of them. The Revenue section renders the same pages at /admin/revenue and
// /team/revenue, so its links, redirects and cache refreshes must follow the
// surface the viewer is on rather than hardcode /admin.
//
// The portal is a third authenticated surface but not a third `Surface`: it
// shares no screens with these two, so nothing here has a portal case to
// answer. ADR 0008 has the reasoning.
//
// This file is dependency-free so the proxy, server components and client
// components can all import it.

export type Surface = "admin" | "team";

// Set by proxy.ts on every /admin and /team request; read by surfaceBase().
export const SURFACE_HEADER = "x-e8-surface";

export function surfaceOf(pathname: string): Surface {
  return pathname === "/team" || pathname.startsWith("/team/") ? "team" : "admin";
}

export function baseOf(surface: Surface): "/admin" | "/team" {
  return surface === "team" ? "/team" : "/admin";
}
