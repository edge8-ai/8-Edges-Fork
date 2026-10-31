// The org entity's server door (RS-09, spec
// docs/engineering/2026-09-08-pluggable-entities-spec.md): the company itself —
// its people directory and org chart, its departments and positions, its
// objectives and key results, its strategy and values, its legal record, the
// equipment its team holds and the survey engine it runs.
//
// Another entity may reach org only through this file (design §3 rule 2). It is
// a server-only barrel: the modules below build the service-role Supabase
// client at load, so a "use client" file takes what it needs from ./client.ts.
//
// Route bodies (routes/, crons/) are deliberately absent: app/ imports those
// files directly, because Next reads a route's segment config from the route
// file and a page is not a library export.

// --- the survey engine -----------------------------------------------------
// org builds the surveys; portal runs them. The public runner at /surveys/[slug]
// and its two API routes read the field model, the answer validator and the row
// shapes from here.
export { validateAnswer, parseStoredAnswer, getSurveyResponsesForCompany, type CompanySurveyResponse } from "./lib/surveys";
export type { FieldConfig, SurveyFieldRow } from "./lib/surveys";
export { getSurveyScore, getSurveyNps } from "./lib/survey-scores";
// Survey assignments: the /team home and inbox list what a person still owes,
// the submit API closes the assignment, and the reminder cron reads the rest.
export { openSurveysFor, completeSurveyAssignment } from "./lib/survey-assignments";
// Who is on probation and when it ends: the Probation page's rows, which the
// Admin Home's "Team this week" reads for probations ending and new joiners (AH.2.7).
export { getProbationRows } from "./lib/probation";

// --- the company's own shape ----------------------------------------------
// The screens /team renders of the company: the org chart, the values grid, the
// strategy view, the goals panels and the onboarding deck.
export { CompanyGoalsObjectives } from "./ui/company/CompanyGoalsObjectives";
export { CoreValuesFrame, CoreValuesHero, CoreValuesMeet, CoreValuesState, ValueTile } from "./ui/company/CoreValuesBento";
export { assignMarks } from "./lib/core-values";
export { loadCoreValues } from "./lib/core-values-read";
export { OnboardingDeckEmbed } from "./ui/company/OnboardingDeckEmbed";
export { OrgChart } from "./ui/company/OrgChart";
export { OrgChartEmpty, OrgChartUnavailable } from "./ui/company/OrgChartStates";
export { StrategyView } from "./ui/company/StrategyView";
export { TeamGoalsPanel } from "./ui/company/TeamGoalsPanel";
export { parseStrategy } from "./lib/company/strategy";
// The shapes the Company Goals view is built from; the roll-up that fills them
// lives in team, which owns the personal goals (RS-09).
export type { ObjectiveWithKrs, LadderedPerson } from "./lib/company/goal-shapes";
export type { ObjectiveGroup, PersonGroup } from "./ui/company/TeamGoalsPanel";
// The Edges vocabulary: objectives, key results, their statuses and the issue
// board's diagnoses. Constants and row shapes, shared with ideas and team.
export * from "./lib/company/edges-shared";
export * from "./lib/company/kr-progress";
export { KEY_RESULT_AUDIT_TABLE, NOT_MEASURED_YET, getNeverMeasuredKeyResults } from "./lib/company/key-result-measured";
// The company KPIs a campaign (or any other record) can name as its goal.
export { listCompanyKeyResults } from "./lib/company/company-key-results";
// The office goals snapshot and the card that renders it.
export * from "./lib/office-goals";
export { OfficeGoalsCard } from "./ui/OfficeGoalsCard";

// --- the directory and what people hold ------------------------------------
export type { OpenRole, OrgEntry } from "./lib/directory-shapes";
export { EQUIPMENT_TYPES, specSummary, statusLabel } from "./lib/equipment-shared";
// The fixed VND/USD rate every salary figure is stated at; the operations
// dashboard shows the payroll line in both currencies.
export { FIXED_VND_PER_USD } from "./lib/compensation-shared";

// Where the reimbursement VAT box sends whoever keeps the legal details (RB.15).
export { legalEntityEditHref } from "./lib/legal-entity-href";

// --- the questions and commands other entities put to org's tables (A.67) ---
// The raw table helpers in lib/reads.ts and lib/writes.ts stay private to org
// (ADR 0018): a caller asks a named question and never chooses the columns or
// the filters. That matters most for the staff directory and the survey
// runner, which the client portal and the public reach: their column lists are
// the privacy line, and they now live where the view and the tables do.
export * from "./lib/directory";
export * from "./lib/handbook";
export { coreValuesForScorecard, coreValueTitles, taggableCoreValues } from "./lib/core-values-read";
export * from "./lib/company/goals";
export { latestStrategy } from "./lib/company/strategy-read";
export * from "./lib/equipment-requests";
export * from "./lib/survey-definitions";
export * from "./lib/survey-responses";
// The personSurveyResponses slot (slots.ts): the surveys a contact answered, on
// crm's contact page (ADR 0032).
export type { PersonSurveyResponse, PersonSurveyResponsesSlot } from "./slots";
export { redInvoiceBuyerEntity, legalEntityCountries } from "./lib/legal-entities";
export { savePersonQualification } from "./lib/person-qualifications";

// The company's public presence: the <head> copy, marks, phones and links the
// App's public frame renders, provided to the root layout through the
// `publicPresence` shell slot (A.79.7, ADR 0034 step 3). The fork overlay
// replaces the module with an empty presence.
export { publicPresence } from "./lib/public-presence";
