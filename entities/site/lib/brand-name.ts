// The name this site calls itself, for the pages that have to say it.
//
// The legal pages, the unsubscribe page and the careers listings are the
// company talking about itself — "operated by X", "marketing email from X",
// "Join X". Those were a hardcoded brand name, so a fork published a privacy
// policy, a terms of service and a job advert under the upstream's name.
//
// SITE_NAME first (entities/site/lib/public-routes.ts, which the fork overlay
// replaces with an empty string) and then the deployment's own
// NEXT_PUBLIC_ORG_NAME. That order is what keeps this change free for the
// upstream: its literal is already in public-routes, so nothing has to be set
// in the environment for the upstream to keep its own name, and a fork that has
// filled in its identity says its own name with nothing else to configure.
import { ORG_NAME } from "@/kernel/config/organisation";
import { SITE_NAME } from "@/entities/site/lib/public-routes";

export const BRAND = SITE_NAME || ORG_NAME || "";

/** Join the parts of a <title> with " | ", dropping the empty ones.
 *
 *  Every page title on the site ended in the brand name, and a fork cannot simply
 *  drop the separator with the name: "Careers | " is worse than "Careers".  */
export function pageTitle(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" | ");
}
