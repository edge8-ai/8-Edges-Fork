// The assistant entity's client door (multi-entity design §3, "two doors per
// entity", ME-13). ./index.ts is a server-only barrel — Postgres, the Anthropic
// SDK, the .docx parser and the service-role Supabase client all sit behind it —
// and a barrel is bundled whole, so a "use client" component may never import
// it. This file is the other door: only browser-safe code is re-exported here
// (client components, types, constants, pure helpers), and
// scripts/entity-client-doors.test.mjs walks its import graph to prove nothing
// server-only follows it into the browser.
//
// Like the index, it lists what a caller outside the entity consumes, not what
// might be useful: knip reports an export nothing imports.
export { ChatWidget } from "./ui/ChatWidget";
//removed from "./ui/chat-widget-types";
// ConversationHistory is no longer exported here: since the two chat widgets
// became thin wrappers over ChatWidget, the only caller is inside this entity.
export { MEETING_ACCEPT } from "./lib/meeting-upload";
// The admin assistant pane the composition root hands the kernel shell (RS-14).
// AdminChatWidget is not exported here any more: the admin shell receives it
// already composed, as AdminAssistant on the server door, via app/shell.ts.
