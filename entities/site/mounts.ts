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
  "api/careers/apply/route": {
    segment: { runtime: 'nodejs' },
  },
  "api/ingest/session/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store", maxDuration: 300 },
  },
  "api/stats/route": {
    segment: { dynamic: 'force-dynamic', fetchCache: 'force-no-store' },
  },
  "api/unsubscribe/route": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", fetchCache: "force-no-store" },
  },
  "routes/8-edges-app/demo/layout": {
    styles: [
      "./eight-edges-demo.css",
      "./demo-strategy.css",
      "./demo-revenue-crm.css",
      "./demo-revenue-marketing.css",
      "./demo-talent-ats.css",
      "./demo-talent-onboarding.css",
      "./demo-talent-coaching.css",
      "./demo-operations.css",
      "./demo-portals.css",
    ],
  },
  "routes/8-edges-app/demo/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/8-edges-app/layout": {
    styles: ["./eight-edges-app.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/about/layout": {
    styles: ["./about.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/about/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/blog/layout": {
    styles: ["./blog.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/blog/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/caio-leadership/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/caio-leadership/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/careers/[slug]/apply/page": {
    segment: { dynamic: 'force-dynamic' },
  },
  "routes/careers/[slug]/page": {
    segment: { dynamic: 'force-dynamic' },
  },
  "routes/careers/layout": {
    styles: ["./careers.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/careers/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/careers/page": {
    segment: { dynamic: 'force-dynamic' },
  },
  "routes/case-studies/[slug]/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/case-studies/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/case-studies/layout": {
    styles: ["./case-studies.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/contact/layout": {
    styles: ["./contact.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/contact/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/global-staffing/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/global-staffing/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/llms.txt/route": {
    segment: { dynamic: 'force-static' },
  },
  "routes/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/post/[slug]/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/post/layout": {
    styles: ["./post.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/the-stack/layout": {
    styles: ["./the-stack.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/the-stack/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/training-and-certification/layout": {
    styles: ["./training-and-certification.css", "@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/training-and-certification/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
  "routes/unsubscribe/page": {
    segment: { dynamic: 'force-dynamic' },
  },
  "routes/your-first-ai-hire/layout": {
    styles: ["@/app/styles/site-components.css", "@/app/styles/utilities.css"],
  },
  "routes/your-first-ai-hire/opengraph-image": {
    segment: { runtime: 'nodejs' },
  },
};
