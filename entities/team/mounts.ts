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
    // LD.7b: a badge a card into Done found drops here, from ladders, which team does not require.
    slots: { badgeDrops: "badgeDrops" },
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
    // The client's Human Tokens and program delivery, from htt when installed (ADR 0032).
    slots: { humanTokens: "humanTokens" },
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
    // The postcard profile (OV.5). The dressing round it brings its own sheets (ladders' slots.ts).
    styles: ["@/app/styles/team-profile.css"],
    // LD.6: what a teammate chose to show comes from ladders, which team does not require,
    // the badge stickers on their postcard too (LD.7b).
    slots: { dressedProfile: "dressedProfile", postcardStickers: "postcardStickers" },
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
    // Hiring in the team language (TH.18).
    styles: ["@/app/styles/team-hiring.css"],
  },
  "routes/team/(dashboard)/ideas/[id]/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/ideas.css"],
  },
  "routes/team/(dashboard)/ideas/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/ideas.css"],
    // LD.7b: a badge a spark found drops under the composer, from ladders, which team does not require.
    slots: { badgeDrops: "badgeDrops" },
  },
  "routes/team/(dashboard)/insurance/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/kudos/page": {
    segment: { dynamic: "force-dynamic" },
    // The faces and tones come from the Home card's sheet (TH.1.8); the page's own layout from team-kudos.css (TH.20).
    styles: ["@/app/styles/team-home.css", "@/app/styles/team-kudos.css"],
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
    // The certification card, My Training's banner and the Get certified strip
    // belong to training (TR.1), which Home does not require.
    // The Reimbursements card belongs to reimbursements, which Home does not require either.
    slots: { homeTraining: "HomeTraining", startHereCertification: "StartHereCertification", homeClaims: "HomeClaims" },
  },
  "routes/team/(dashboard)/probation/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/profile/id-image/[side]/route": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/profile/page": {
    segment: { dynamic: "force-dynamic" },
    // The postcard is the editor (TH.9): the postcard's sheet, then the page's.
    // The dressed profile round it (LD.6), with the Your ladders panel and the
    // quest log on its tabs, brings its own sheets (ladders' slots.ts).
    styles: ["@/app/styles/team-profile.css", "@/app/styles/team-profile-edit.css"],
    // LD.6: the dressed profile comes from ladders, which team does not require;
    // LD.7b: so do the badge stickers on the postcard.
    slots: { dressedProfile: "dressedProfile", postcardStickers: "postcardStickers" },
  },
  "routes/team/(dashboard)/reviews/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
  "routes/team/(dashboard)/reviews/page": {
    segment: { dynamic: "force-dynamic" },
    // The review home in the team language (TH.14).
    styles: ["@/app/styles/team-reviews.css"],
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
    // LD.7b: a badge a card into Done found drops here, from ladders, which team does not require.
    slots: { badgeDrops: "badgeDrops" },
  },
};
