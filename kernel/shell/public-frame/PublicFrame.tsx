"use client";

// The header and footer around every public page of this deployment, and the
// UTM memory its contact forms read. It moved from the marketing site's
// SiteFrame to the kernel with A.79.7 (ADR 0034, step 3), so the App keeps its
// public pages framed when the site leaves for its own repository. What it
// says about the organisation arrives as `presence`, which the root layout
// takes from the `publicPresence` shell slot (org provides it); the frame
// itself holds no organisation's copy.
import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { rememberUtm } from "./utm";
import { isBareRoute } from "./bare-routes";
import type { PublicPresence } from "./presence";
import PublicNav from "./PublicNav";
import PublicFooter from "./PublicFooter";

export default function PublicFrame({ presence, children }: { presence: PublicPresence; children: ReactNode }) {
  const pathname = usePathname();
  // Which routes render without the header and footer, and why, is in bare-routes.
  const bare = isBareRoute(pathname);
  // A campaign link lands on one page and the form is on another: keep the
  // utm_* values for the session so the inquiry can name its campaign.
  // Read off the window rather than useSearchParams, which would force a
  // Suspense boundary on every statically rendered public page.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search) rememberUtm(window.location.search);
  }, [pathname]);

  return (
    <>
      {!bare && <PublicNav presence={presence} />}
      {children}
      {!bare && <PublicFooter presence={presence} />}
    </>
  );
}
