"use client";

// Browser half of the two-surface helpers (see surface-shared.ts): client
// components read the surface from the URL they are rendered under.

import { usePathname } from "next/navigation";
import { baseOf, surfaceOf } from "./surface-shared";

export function useSurfaceBase(): "/admin" | "/team" {
  return baseOf(surfaceOf(usePathname() ?? ""));
}
