// Server-only. Anthropic tool definitions for the admin database assistant.
// Every admin gets query_database (read-only, chatbot_reader role). Privileged
// admins (see ./privileged.ts) also get execute_write and send_email;
// both pause for an explicit Approve click in the chat UI before anything runs
// (app/api/admin/chat/route.ts).

import type Anthropic from "@anthropic-ai/sdk";
import { toolsFor, type PermittedTool } from "../tool-permission";

export const QUERY_TOOL: Anthropic.Tool = {
  name: "query_database",
  description:
    "Run a single read-only SQL SELECT against the Edge8 Company OS database " +
    "(schema company_os). Use this for every question about business data — " +
    "contacts, deals, leads, invoices, expenses, hiring, staff, time off, " +
    "events, surveys. Also use it to introspect information_schema.columns when " +
    "you are unsure of a table's columns. Results are capped at 200 rows; add " +
    "ORDER BY and LIMIT, and aggregate in SQL for counts and sums.",
  input_schema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "One SELECT (or WITH) statement. No semicolons.",
      },
    },
    required: ["sql"],
  },
};

export const WRITE_TOOL: Anthropic.Tool = {
  name: "execute_write",
  description:
    "Propose a single INSERT or UPDATE against company_os. The statement is " +
    "shown to the admin, who must approve it before it runs — so first agree " +
    "the change in conversation, and SELECT the target rows to verify ids " +
    "before proposing an UPDATE. UPDATE must have a WHERE clause. There is no " +
    "DELETE: archive rows by setting archived_at. Add RETURNING id (or the " +
    "changed columns) so you can report exactly what changed. Call this tool " +
    "on its own, never alongside other tool calls.",
  input_schema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "One INSERT or UPDATE statement. No semicolons, no DELETE.",
      },
    },
    required: ["sql"],
  },
};

export const EMAIL_TOOL: Anthropic.Tool = {
  name: "send_email",
  description:
    "Send an email to one recipient from the configured sender (replies go to " +
    "the admin). The full email is shown to the admin, who must approve it " +
    "before it sends — draft it in conversation first. Plain text only: blank " +
    "lines separate paragraphs. One recipient per call, no bulk sends; look " +
    "the address up in the database rather than guessing it. Sent emails are " +
    "logged to interactions. Call this tool on its own, never alongside other " +
    "tool calls.",
  input_schema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email address (exactly one)." },
      subject: { type: "string", description: "Subject line." },
      body: {
        type: "string",
        description:
          "Plain-text body. Blank lines separate paragraphs. Include the greeting and sign-off.",
      },
    },
    required: ["to", "subject", "body"],
  },
};

export const PORTAL_TOOL: Anthropic.Tool = {
  name: "invite_portal_member",
  description:
    "Provision client-portal access for a CRM contact — the same flow as the " +
    "admin UI's Invite/Resend buttons. action 'invite' ensures the " +
    "portal_members row for (person, company), mints or relinks their auth " +
    "account, and emails the invite; it also reactivates revoked access and " +
    "completes half-provisioned members (active membership but " +
    "people.auth_user_id is null). action 'resend_link' emails a fresh " +
    "sign-in link to someone whose auth account already exists. First query " +
    "the database for the person, their company link (person_companies), " +
    "portal_members status, and people.auth_user_id — then pick the action: " +
    "'invite' when auth_user_id is null or access was revoked, 'resend_link' " +
    "when they have an account but need a new link. The admin must approve " +
    "before anything is sent. Call this tool on its own, never alongside " +
    "other tool calls.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["invite", "resend_link"] },
      person_id: { type: "string", description: "company_os.people.id (UUID)." },
      company_id: { type: "string", description: "company_os.companies.id (UUID)." },
      summary: {
        type: "string",
        description:
          "One human-readable line shown on the approval card, e.g. " +
          "\"Invite Jane Doe (jane@acme.com) to the Acme Inc portal\".",
      },
    },
    required: ["action", "person_id", "company_id", "summary"],
  },
};

export const PRIVILEGED_TOOL_NAMES = new Set([
  WRITE_TOOL.name,
  EMAIL_TOOL.name,
  PORTAL_TOOL.name,
]);

// Each tool with the permission it needs (tool-permission.ts, ADR 0014): reading
// the database is assistant.query, and every tool that changes something
// (a write, an email, a portal invite) is assistant.write. Entering the Admin
// view is not enough for either. The privileged ones also need the deploy-time
// list in privileged.ts.
const query = (tool: Anthropic.Tool): PermittedTool => ({ tool, permission: "assistant.query" });
const write = (tool: Anthropic.Tool): PermittedTool => ({ tool, permission: "assistant.write" });

/** The tools this admin is handed: those whose permission they hold, the privileged ones only when they may write. */
export function chatbotTools(opts: { may: (permission: string) => boolean; canWrite: boolean }): Anthropic.Tool[] {
  return toolsFor(opts.may, [query(QUERY_TOOL), ...(opts.canWrite ? [WRITE_TOOL, EMAIL_TOOL, PORTAL_TOOL].map(write) : [])]);
}
