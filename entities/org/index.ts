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
export type { FieldConfig, SurveyFieldRow, SurveyRow } from "./lib/surveys";
export { getSurveyScore, getSurveyNps } from "./lib/survey-scores";
// Survey assignments: the /team home and inbox list what a person still owes,
// the submit API closes the assignment, and the reminder cron reads the rest.
export { openSurveysFor, completeSurveyAssignment } from "./lib/survey-assignments";

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
// The office goals snapshot and the card that renders it.
export * from "./lib/office-goals";
export { OfficeGoalsCard } from "./ui/OfficeGoalsCard";

// --- the directory and what people hold ------------------------------------
export type { OpenRole, OrgEntry } from "./lib/directory-shapes";
export { ON_CHART_STATUSES } from "./lib/org-tree";
export { EQUIPMENT_TYPES, specSummary, statusLabel } from "./lib/equipment-shared";
// The fixed VND/USD rate every salary figure is stated at; the operations
// dashboard shows the payroll line in both currencies.
export { FIXED_VND_PER_USD } from "./lib/compensation-shared";

// Where the reimbursement VAT box sends whoever keeps the legal details (RB.15).
export { legalEntityEditHref } from "./lib/legal-entity-href";

// Cross-entity reads and writes of this entity's tables (design §4).
export * from "./lib/reads";
export * from "./lib/writes";
