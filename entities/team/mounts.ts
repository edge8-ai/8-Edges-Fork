// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config and the stylesheets, neither of which Next sees through
// a re-export. Everything else about a mount — its path, and the names Next
// binds it by — comes from the route itself (scripts/gen-app-mounts.mjs).
//
// Keys are paths within this entity. Nothing imports this file; the generator
// reads it, and `npm run check:app-mounts` fails when `app/` disagrees with it.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "api/team/chat/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/certifications-sync": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 60 },
  },
  "crons/individual-summary": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/performance-reviews": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/company/handbook/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/company/insurance/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/admin/(dashboard)/talent/reviews/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(auth)/callback/page": {
    useClient: true,
  },
  "routes/team/(auth)/layout": {
    styles: ["@/app/admin/admin.css", "@/app/styles/utilities.css"],
  },
  "routes/team/(auth)/verify/page": {
    useClient: true,
  },
  "routes/team/(dashboard)/boards/[slug]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/boards/[slug]/epics/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/boards/[slug]/sprints/[sprintId]/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/clients/[companyId]/(hub)/board/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/clients/[companyId]/(hub)/documents/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/clients/[companyId]/(hub)/invoices/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/clients/[companyId]/(hub)/meetings/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/clients/[companyId]/(hub)/meetings/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/clients/[companyId]/(hub)/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/clients/[companyId]/(hub)/roadmap/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/clients/[companyId]/(hub)/team/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/clients/[companyId]/programs/[programId]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/clients/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/company-goals/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/directory/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/directory/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/equipment/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/error": {
    useClient: true,
  },
  "routes/team/(dashboard)/gallery/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/hiring/[interviewId]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/handbook/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/hiring/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/ideas/[id]/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/ideas.css"],
  },
  "routes/team/(dashboard)/ideas/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/ideas.css"],
  },
  "routes/team/(dashboard)/insurance/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/kudos/page": {
    segment: { dynamic: "force-dynamic" },
    // The month's board shares the Home card's look (TH.1.8).
    styles: ["@/app/styles/team-home.css"],
  },
  "routes/team/(dashboard)/onboarding-deck/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/org/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/page": {
    segment: { dynamic: "force-dynamic" },
    // The Home's own sheet, and Spark's for the sky band and composer (TH.1).
    styles: ["@/app/styles/ideas.css", "@/app/styles/team-home.css"],
  },
  "routes/team/(dashboard)/probation/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/profile/id-image/[side]/route": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/profile/page": {
    segment: { dynamic: "force-dynamic" },
    slots: { claimsPanel: "ProfileClaimsPanel" },
  },
  "routes/team/(dashboard)/reviews/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/reviews/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/strategy/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/values/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/vendors/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/sprint-planning/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/team/(dashboard)/workboard/page": {
    segment: { dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
};
