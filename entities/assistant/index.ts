// The assistant entity's public surface: the two chat back ends, the shared
// conversation history, and the meeting transcript / summary helpers that the
// admin and team screens drive (multi-entity design §3, rules 1 and 2).
//
// Everything here is server-side. That is deliberate, not an oversight: the two
// chat back ends open a Postgres connection under a restricted role, the meeting
// helpers pull the Anthropic SDK and a .docx parser, and the history store holds
// the service-role Supabase client. A barrel is included in a bundle as a whole,
// so the moment a "use client" component imported this file every one of those
// would follow it into the browser. The two React pieces the widgets share
// (ConversationHistory) are therefore also on ./client.ts, the
// browser-safe door (ME-13).
//
// The surface grows when a call site needs it, not in anticipation: knip reports
// an export nothing imports, which is what keeps the door narrow. `tables.ts` is
// the entity's other declaration file and is deliberately not re-exported — it is
// read by the ownership gate and by the assistant's own code, not by callers.

// ── The streaming agent loop both chat routes run ──────────────────────────
// Trimming and persisting the transcript is now part of the loop, so the two
// history helpers the routes used to call themselves are no longer on the door.
export { runChatTurn, type ChatSseEvent, type ChatTurnOptions } from "./lib/chat-turn";

// ── Admin assistant back end ───────────────────────────────────────────────
// The two back ends export the same three names, so the door disambiguates
// them; call sites alias back to the short name where the body reads better.
export { runReadOnlyQuery as runAdminChatQuery } from "./lib/admin-chat/db";
export { chatbotTools as adminChatTools, PRIVILEGED_TOOL_NAMES } from "./lib/admin-chat/tools";
export { buildSystemPrompt as buildAdminChatPrompt } from "./lib/admin-chat/system-prompt";
// The admin-chat route sends the prompt with every call so it is recorded
// under the prompt's version (Z.6.1).
export { ADMIN_CHAT_PROMPT } from "./lib/admin-chat/system-prompt.prompt";
export { isPrivilegedChatUser } from "./lib/admin-chat/privileged";
export {
  performApprovedWrite,
  performApprovedEmail,
  performApprovedPortalInvite,
} from "./lib/admin-chat/actions";
// The record every privileged decision leaves on the approvals primitive (S.5).
export { recordAssistantDecision } from "./lib/admin-chat/approval-record";

// ── Team assistant back end ────────────────────────────────────────────────
export { chatbotTools as teamChatTools } from "./lib/team-chat/tools";
export { buildSystemPrompt as buildTeamChatPrompt } from "./lib/team-chat/system-prompt";
// The team-chat route sends the prompt with every call so it is recorded
// under the prompt's version (Z.6.1).
export { TEAM_CHAT_PROMPT } from "./lib/team-chat/system-prompt.prompt";

// ── Meeting transcripts and summaries ──────────────────────────────────────
export { extractTranscript, MEETING_MAX_BYTES } from "./lib/meeting-extract";
export { summarizeMeeting } from "./lib/meeting-summary";

// ── AI Journey survey pair (portal survey page and API route) ──────────────
export { backfillCompanyIndustry, isAiJourneyPurpose, resolveCompanyPrefill } from "./lib/ai-journey";

// Client components take it from ./client.ts; a server page may take it here.
// The shell contribution the composition root mounts when this entity is installed.
export { AdminAssistant } from "./ui/AdminAssistant";
