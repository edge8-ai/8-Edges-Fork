// Server-only. Anthropic tool definitions for the /team portal assistant.
// The team assistant is answer-only, with one deliberate exception:
// request_review_link for the people who may add reviewers to a performance
// review (admins, the talent director, managers). No general write, email, or
// portal tools exist here (that surface lives only in the admin assistant).
//
// Every read is a fixed, typed tool rather than free-form SQL (2026-10-02). The
// database cannot tell one employee from another (the reader role's policies
// are `using (true)`), so who may see a client's money or its contacts is
// decided in code, inside each tool, against the access the route resolves from
// the session (entities/team/lib/chat). A SQL tool would route around every one
// of those checks, which is why there is none. Hiding a tool here is only an
// extra layer: the tool body refuses on its own.

import type Anthropic from "@anthropic-ai/sdk";
import { toolsFor, type PermittedTool } from "../tool-permission";

const PERIOD_PROPS = {
  from: { type: "string", description: "Start date, YYYY-MM-DD. Defaults to the first of this month." },
  to: { type: "string", description: "End date, YYYY-MM-DD, inclusive. Defaults to today." },
} as const;

const COMPANY_TOTALS_TOOL: Anthropic.Tool = {
  name: "company_totals",
  description:
    "Company-wide financial totals for a period: invoiced revenue and outstanding " +
    "balance (QuickBooks invoices, by currency), paid online orders (USD), expenses " +
    "(by currency), and the open pipeline (count and USD value). Totals only, never " +
    "broken down by client.",
  input_schema: { type: "object", properties: { ...PERIOD_PROPS } },
};

const CUSTOMERS_TOOL: Anthropic.Tool = {
  name: "customers_and_prospects",
  description:
    "How many customers Edge8 has, which businesses became customers in a period " +
    "(a deal won), how many new leads came in, and which new prospect businesses " +
    "were added. Business names only, no contact people.",
  input_schema: { type: "object", properties: { ...PERIOD_PROPS } },
};

const BUSINESSES_TOOL: Anthropic.Tool = {
  name: "list_businesses",
  description:
    "Look up businesses (companies) by name or lifecycle stage: name, industry, " +
    "country, stage (lead, sql, opportunity, customer, evangelist), and client " +
    "start and end dates. Business details only, no contact people.",
  input_schema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Part of the business name." },
      stage: { type: "string", description: "Lifecycle stage to filter by." },
    },
  },
};

const DEALS_TOOL: Anthropic.Tool = {
  name: "list_deals",
  description:
    "Deals in the sales pipeline: title, business, stage, status (open, won, lost), " +
    "owner, amount, expected close date and close date. Newest first, up to 50.",
  input_schema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Part of the deal title." },
      company: { type: "string", description: "Business name to filter by." },
      status: { type: "string", enum: ["open", "won", "lost"] },
    },
  },
};

const CLIENT_FINANCIALS_TOOL: Anthropic.Tool = {
  name: "client_financials",
  description:
    "Per-client money. With a company: that client's invoices and orders. " +
    "Without one: invoiced revenue broken down by client for the period, covering " +
    "only the clients the person may see. Refuses a client the person is not " +
    "assigned to unless they have revenue access; relay the refusal as given.",
  input_schema: {
    type: "object",
    properties: {
      company: { type: "string", description: "Client business name. Omit for the by-client breakdown." },
      ...PERIOD_PROPS,
    },
  },
};

const CLIENT_CONTACTS_TOOL: Anthropic.Tool = {
  name: "client_contacts",
  description:
    "The contact people at one client business: name, title, email, phone, " +
    "location. Refuses a client the person is not assigned to unless they have " +
    "revenue access; relay the refusal as given.",
  input_schema: {
    type: "object",
    properties: { company: { type: "string", description: "Client business name." } },
    required: ["company"],
  },
};

const HANDBOOK_TOOL: Anthropic.Tool = {
  name: "search_handbook",
  description:
    "Search the company handbook (policies, values, benefits, how we work). " +
    "Returns matching entries with their full text. Omit query to list every entry title.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "A few words to search for." } },
  },
};

const STAFF_TOOL: Anthropic.Tool = {
  name: "staff_directory",
  description:
    "Edge8 staff: name, work email, position, department, manager, location, " +
    "employment type, status (active, on_leave, notice, pre_start, or left), start " +
    "date, avatar, and the id for their profile link (/team/directory/<id>).",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Part of the person's name." },
      department: { type: "string", description: "Part of the department name." },
      include_former: { type: "boolean", description: "Include people who have left." },
    },
  },
};

const TIME_OFF_TOOL: Anthropic.Tool = {
  name: "time_off",
  description:
    "Who is off between two dates: person, leave type, status, dates, days. " +
    "The reason and manager note are never included.",
  input_schema: {
    type: "object",
    properties: {
      from: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      to: { type: "string", description: "YYYY-MM-DD. Defaults to 14 days from from." },
      name: { type: "string", description: "Part of a staff member's name." },
    },
  },
};

const EVENTS_TOOL: Anthropic.Tool = {
  name: "list_events",
  description: "Edge8 events: title, type, status, dates, location, and a short blurb.",
  input_schema: {
    type: "object",
    properties: {
      when: { type: "string", enum: ["upcoming", "past", "all"], description: "Defaults to upcoming." },
      search: { type: "string", description: "Part of the event title." },
    },
  },
};

const IDEAS_TOOL: Anthropic.Tool = {
  name: "list_ideas",
  description:
    "Ideas that Spark Solutions: kind (build or learning), title, author, office, " +
    "status, date, and the idea's text and AI plan.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["build", "learning"] },
      search: { type: "string", description: "Part of the idea title." },
    },
  },
};

const PHOTOS_TOOL: Anthropic.Tool = {
  name: "find_photos",
  description:
    "Photos from the team gallery, newest first, with who is tagged in each. Give a " +
    "staff member's name to get their avatar and the gallery photos they are tagged in.",
  input_schema: {
    type: "object",
    properties: { person: { type: "string", description: "Part of a staff member's name." } },
  },
};

// The person's own records (2026-10-10). Each reads only the signed-in
// person's rows: the route hands the body the session's actor, and no input
// field names a person, so there is nothing for the model to point elsewhere.
const NO_INPUT = { type: "object", properties: {} } as const;

const MY_WORK_TOOL: Anthropic.Tool = {
  name: "my_work",
  description:
    "The person's own Workboard: this sprint's open cards (in progress, late, due " +
    "today, new to them, later this sprint, after it, undated), blockers other " +
    "people are waiting on them for, open cards on boards without sprints, and " +
    "what they finished recently. Each card has its priority, due date, board and " +
    "client, Human Tokens and a link. Use it for \"what should I focus on\".",
  input_schema: NO_INPUT,
};

const MY_GOALS_TOOL: Anthropic.Tool = {
  name: "my_goals",
  description:
    "The person's own FAST goals: status, quarter, due date, their measure and " +
    "progress, the company key result each ladders to with its progress, and " +
    "comments on each goal.",
  input_schema: NO_INPUT,
};

const MY_REVIEWS_TOOL: Anthropic.Tool = {
  name: "my_reviews",
  description:
    "Every performance and probation review about the person: their self-assessments, " +
    "their manager's reviews (drafts included, with their status), and other or " +
    "external reviewers' reviews by reviewer name, with ratings, achievements, " +
    "improvements, comments, summary and decision. Only rows the /team/reviews page " +
    "opens carry a link.",
  input_schema: NO_INPUT,
};

const MY_COACHING_TOOL: Anthropic.Tool = {
  name: "my_coaching",
  description:
    "The person's own coaching: their coach, the next 1-1 and its shared prep, " +
    "growth priorities, commitments, open talking points, recent check-ins, recent " +
    "held 1-1s with their shared recaps, and their own notes.",
  input_schema: NO_INPUT,
};

const MY_TIME_OFF_TOOL: Anthropic.Tool = {
  name: "my_time_off",
  description:
    "The person's own leave requests, including the reason they gave and their " +
    "manager's note, and their leave balance (remaining, pending, used this policy " +
    "year, next accrual). Defaults to the last twelve months and everything ahead.",
  input_schema: {
    type: "object",
    properties: {
      from: { type: "string", description: "YYYY-MM-DD. Leave ending on or after this day." },
      to: { type: "string", description: "YYYY-MM-DD. Leave starting on or before this day." },
    },
  },
};

const MY_PAY_TOOL: Anthropic.Tool = {
  name: "my_pay",
  description:
    "The person's own pay: their salary history and their latest payslips " +
    "(gross, allowances, insurance, tax, net, paid; figures in VND), plus the " +
    "last four digits of the bank account they are paid into.",
  input_schema: NO_INPUT,
};

const MY_REIMBURSEMENTS_TOOL: Anthropic.Tool = {
  name: "my_reimbursements",
  description: "The person's own reimbursement claims: title, status, receipts, total in VND and where each stands.",
  input_schema: NO_INPUT,
};

export const REVIEW_LINK_TOOL: Anthropic.Tool = {
  name: "request_review_link",
  description:
    "Add one or more reviewers to a team member's performance or probation " +
    "review and get a link for each. Use it when someone asks for a review " +
    "link, wants a client contact, a second lead, or a peer to review " +
    "someone, or wants to start a review. The subject's open cycle is used, " +
    "or one is opened (probation for someone on probation, otherwise ad hoc) " +
    "with their self-assessment and manager review. A reviewer given by email " +
    "who is a team member becomes a team reviewer; any other email becomes an " +
    "external reviewer who needs no account, the link is theirs alone. A " +
    "reviewer given by name only must be a team member. The tool refuses " +
    "when the caller may not add reviewers for that person, when the subject " +
    "name is ambiguous, or when a reviewer cannot be resolved; relay its " +
    "message and ask. Links are returned for you to show; nothing is emailed " +
    "unless the person explicitly asked you to send it (then set send).",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "The team member being reviewed: name or company email." },
      reviewers: {
        type: "array",
        description: "Who should review. Each needs a name, an email, or both.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
          },
        },
      },
      send: {
        type: "boolean",
        description: "Email each reviewer their link now. Only when asked in so many words.",
      },
    },
    required: ["subject", "reviewers"],
  },
};

// Each tool with the permission it needs (tool-permission.ts): today every team
// tool is for whoever enters the Team view.
const team = (tool: Anthropic.Tool): PermittedTool => ({ tool, permission: "surface.team" });

const OPEN_TOOLS: PermittedTool[] = [
  COMPANY_TOTALS_TOOL,
  CUSTOMERS_TOOL,
  BUSINESSES_TOOL,
  DEALS_TOOL,
  HANDBOOK_TOOL,
  STAFF_TOOL,
  TIME_OFF_TOOL,
  EVENTS_TOOL,
  IDEAS_TOOL,
  PHOTOS_TOOL,
  MY_WORK_TOOL,
  MY_GOALS_TOOL,
  MY_REVIEWS_TOOL,
  MY_COACHING_TOOL,
  MY_TIME_OFF_TOOL,
  MY_PAY_TOOL,
  MY_REIMBURSEMENTS_TOOL,
].map(team);

const CLIENT_TOOLS: PermittedTool[] = [CLIENT_FINANCIALS_TOOL, CLIENT_CONTACTS_TOOL].map(team);

/**
 * The tools this person is handed: those whose permission they hold (`may`,
 * from the session), and of those the per-client tools only when they may see
 * some client, and the review tool only when they may add reviewers. Those two
 * are row scopes the tool bodies enforce again on their own.
 */
export function chatbotTools(opts: {
  may: (permission: string) => boolean;
  canRequestReviews: boolean;
  seesAnyClient: boolean;
}): Anthropic.Tool[] {
  return toolsFor(opts.may, [
    ...OPEN_TOOLS,
    ...(opts.seesAnyClient ? CLIENT_TOOLS : []),
    ...(opts.canRequestReviews ? [team(REVIEW_LINK_TOOL)] : []),
  ]);
}
