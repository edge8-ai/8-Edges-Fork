// Server-only. Restricted SQL executor for the /team portal assistant.
//
// Reads run through the dedicated `team_chatbot_reader` Postgres role. It is
// DEFAULT-DENY: USAGE on company_os and SELECT on the tables
// 20261010130000_team_reader_opens_company_tables.sql names, some of them by
// column, so pay, identity, people's private records, hiring, message logs,
// call transcripts, client money and client contacts are unreachable at the
// database layer no matter what SQL the model emits. Defense in depth, each
// layer independently sufficient:
//   1. validation in ../read-executor.ts (single SELECT/WITH statement only)
//   2. structural wrap: the query runs as a subquery, so DML cannot escape
//   3. the extended protocol rejects multi-statement strings
//   4. the blocked-table pattern below
//   5. the role's grants, which are the hard boundary
//
// This module never writes: there is no team writer role and no write executor.
// NEVER import from a client component.

import { makeReadExecutor, type BlockedTables } from "../read-executor";

// The private list, by name. The role cannot read any of these anyway; naming
// them here gives a coaxed query a clear message instead of a bare "permission
// denied", and is one more layer if a later grant opens one by mistake. A
// person's own private records reach them through the my_* tools instead.
const BLOCKED_TABLE = new RegExp(
  "\\b(?:" +
    [
      // Pay and identity
      "people_sensitive", "compensation_sensitive", "compensation", "payroll_\\w+",
      "contractor_\\w+", "reimbursement_\\w+",
      // People's private records
      "performance_reviews", "goals", "one_on_ones", "coaching_\\w+", "surveys", "survey_\\w+",
      "capability_pulse_\\w+",
      // Hiring
      "applications", "application_\\w+", "candidates", "candidate_\\w+", "interviews",
      "interview_\\w+", "offers", "job_requisitions", "requisition_\\w+", "hiring_\\w+",
      // Message logs and calls
      "email_messages", "email_events", "email_campaign_recipients", "interactions",
      "call_transcripts", "call_scorecards", "scorecard_scores", "meeting_followups",
      // Client money and client contacts
      "invoices", "orders", "subscriptions", "affiliates", "affiliate_\\w+", "token_purchases",
      "revenue_snapshots", "event_pnl_lines", "person_companies", "inquiries", "inquiry_triage",
      "event_registrations", "people_with_deals", "proposal_drafts",
      // System
      "audit_log", "approvals", "admins", "access_\\w+", "portal_\\w+", "assistant_conversations",
      "ai_calls", "ddl_\\w+", "routine_\\w+", "notification_\\w+", "notifications", "qbo_connection",
      "lark_user_connections", "person_git_emails", "event_outbox", "event_deliveries",
      "automation_effects",
    ].join("|") +
    ")\\b",
  "i",
);

export const TEAM_BLOCKED: BlockedTables = {
  pattern: BLOCKED_TABLE,
  message:
    "That table is private and off-limits to query_database (pay, people's private " +
    "records, hiring, message logs, call transcripts, client money and contacts, " +
    "system tables). For the person's own records use the my_* tools; otherwise " +
    "answer from the tables you can read.",
};

export const runReadOnlyQuery = makeReadExecutor({
  envVar: "TEAM_CHATBOT_DB_URL",
  logPrefix: "team-chat/db",
  poolMax: 3,
  blocked: TEAM_BLOCKED,
});
