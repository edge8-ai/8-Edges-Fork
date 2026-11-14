// The slots org provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** One survey a person answered, as crm's contact page lists it. */
export type PersonSurveyResponse = { id: string; survey_id: string | null; submitted_at: string | null; created_at: string | null };

/** The surveys a person answered, newest first; null when org is not installed. */
export type PersonSurveyResponsesSlot = ((personId: string) => Promise<PersonSurveyResponse[]>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // A.79.7 (ADR 0034, step 3): one slot for what the site's five used to
  // carry. The frame around public pages is the kernel's own
  // (kernel/shell/public-frame), so the root layout imports it directly; what
  // it and the <head> say about the organisation comes from org, which owns
  // the company. The fallback is an empty presence, and the layout then names
  // the organisation from kernel/config.
  publicPresence: {
    kind: "value",
    type: "PublicPresence",
    typeFrom: "@/kernel/shell/public-frame/presence",
    fallback: "{ title: \"\", description: \"\", name: \"\", logoSrc: \"\", logoDarkSrc: \"\", footerTagline: \"\", copyrightName: \"\", phones: [], services: [], navExtra: [], companyLinks: [], productLinks: [], socialLinks: [], hasWorkflows: false }",
    styles: [],
    surfaces: ["public"],
    why: "what the public frame and the <head> say about the organisation; nothing but its configured name without org",
  },
  // ADR 0032: the surveys a contact answered are org's enrichment of crm's
  // contact page. A CRM is complete without the survey engine, so the page
  // takes them here and, in a deployment without org, has no Surveys tab.
  personSurveyResponses: {
    kind: "value",
    type: "PersonSurveyResponsesSlot",
    fallback: "null",
    styles: [],
    surfaces: ["admin"],
    why: "the surveys a contact answered, on crm's contact page; no Surveys tab without org",
  },
};
