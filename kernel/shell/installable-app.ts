import type { Metadata, MetadataRoute } from "next";
import { ORG_NAME } from "@/kernel/config/organisation";
import { PALETTE } from "@/kernel/config/palette";
import { APP_ICONS } from "./app-icons";

// The team hub as an app on a phone's home screen (MO.10): Android installs it
// from Chrome's menu, an iPhone from Share > Add to Home Screen, and either
// opens it full-screen, without the browser's bars, on /team.
//
// The manifest is linked from the /team layouts only, not from the root, on
// purpose. A manifest in the root <head> makes every page installable, and
// Chrome on Android then offers "Install" to a prospect reading the marketing
// site, which installs a sign-in page they cannot pass. It is served beside
// /team rather than under it because proxy.ts sends every unsigned request
// under /team/ to the login page, and a browser fetches a manifest without
// cookies.
const TEAM_MANIFEST_PATH = "/team-app.webmanifest";

// next.config sets trailingSlash, so /team answers with a redirect to /team/.
// Starting on the slashed path spares every launch that hop.
const START = "/team/";

/**
 * The web app manifest. The name is the organisation's with no fallback
 * (kernel/config/organisation.ts): a deployment that has not named itself
 * gets a manifest with no name, which no browser offers to install, rather
 * than one carrying somebody else's.
 */
export function teamManifest(): MetadataRoute.Manifest {
  return {
    ...(ORG_NAME ? { name: `${ORG_NAME} Team`, short_name: ORG_NAME } : {}),
    id: START,
    start_url: START,
    // The whole origin, so a link from the hub to /admin or a shared page
    // stays inside the app instead of opening a browser sheet over it.
    scope: "/",
    display: "standalone",
    background_color: PALETTE.white,
    theme_color: PALETTE.white,
    icons: APP_ICONS,
  };
}

/**
 * What both /team layouts add to their metadata: the manifest link, and the
 * tags Safari reads when a page is added to the home screen. The status bar
 * stays "default" (dark text on the page's own light top) because
 * "black-translucent" draws the page under the clock, and the team pages are
 * not laid out for that.
 */
export const TEAM_APP_METADATA: Pick<Metadata, "manifest" | "appleWebApp"> = {
  manifest: TEAM_MANIFEST_PATH,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    ...(ORG_NAME ? { title: ORG_NAME } : {}),
  },
};
