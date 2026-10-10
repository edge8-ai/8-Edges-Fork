// The campaigns entity's server door. Email campaigns and the marketing content they carry: broadcasts, the blog, the weekly letter and the books.
//
// Its screens still live where they were and move here in a later slice; what
// moved first is ownership of the tables and the writers that touch them,
// because an entity that owns its data is the unit a deployment installs.
export * from "./lib/reads";
export * from "./lib/writes";
// What the composition root registers when this entity is installed: the
// Revenue board's moves, carried back to the content calendar.
export { subscriptions } from "./lib/subscriptions";
// The campaigns module moved here whole (RS-08).
export * from "./lib/ai/brand-image";
export * from "./lib/ai/brand-writer";
export * from "./lib/ai/campaign-seo";
export * from "./lib/ai/entry-copy";
export * from "./lib/blog-publish";
export * from "./lib/books";
export * from "./lib/brand-profiles";
export * from "./lib/brand-sites";
export * from "./lib/broadcasts";
export * from "./lib/exhibits";
export * from "./lib/markdown";
export * from "./lib/marketing";
export * from "./lib/marketing-calendar";
export * from "./lib/marketing-campaigns";
export * from "./lib/marketing-engine";
export * from "./lib/marketing-images";
export { PUBLISH_EDITOR_PROMPT } from "./lib/publish-editor/publish-editor.prompt";
export * from "./lib/publish-editor/tools";
export * from "./lib/seo";
export * from "./lib/style-catalogues";
export * from "./lib/writer/advance";
export * from "./lib/writer/steps";
export * from "./lib/broadcast-report";
export * from "./lib/ai/marketing-recap";
// The public blog reader and the marketing-email renderer moved here from site
// (RS-08): both are about marketing_content and broadcasts, which this entity
// owns, and site importing them the other way made the two mutually dependent.
export * from "./lib/blog";
export * from "./lib/marketing-email";
export * from "./lib/marketing-email-utm";
export * from "./lib/marketing-email-blocks";

// The automation watchdog's check on the weekly letter (Z.15.6).
export { letterReachedReady } from "./lib/letter/letter-invariant";
