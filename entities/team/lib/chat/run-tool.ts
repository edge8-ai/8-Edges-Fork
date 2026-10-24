// Server-only. Runs one of the team assistant's read tools by name. The access
// argument, and for a my_* tool the signed-in person, come from the route,
// resolved from the session; nothing in the tool input can change either.

import { ReadFailure } from "@/kernel/data/read";
import type { ChatAccess } from "./access";
import {
  clientContacts,
  clientFinancials,
  companyTotals,
  customersAndProspects,
  listBusinesses,
  listDeals,
} from "./company-tools";
import { myPay, myReimbursements, myTimeOff } from "./my-records-tools";
import { myCoaching, myGoals, myReviews, myWork, type ChatSelf } from "./my-work-tools";
import type { ToolInput, ToolOutcome } from "./shared";
import { findPhotos, listEvents, listIdeas, searchHandbook, staffDirectory, timeOff } from "./workspace-tools";

const TOOLS: Record<string, (input: ToolInput, access: ChatAccess) => Promise<ToolOutcome>> = {
  company_totals: companyTotals,
  customers_and_prospects: customersAndProspects,
  list_businesses: listBusinesses,
  list_deals: listDeals,
  client_financials: clientFinancials,
  client_contacts: clientContacts,
  search_handbook: searchHandbook,
  staff_directory: staffDirectory,
  time_off: timeOff,
  list_events: listEvents,
  list_ideas: listIdeas,
  find_photos: findPhotos,
};

// The person's own records. Each body reads only the rows of the person it is
// handed, and the route hands it the session's actor, never the model's input.
const MY_TOOLS: Record<string, (input: ToolInput, me: ChatSelf) => Promise<ToolOutcome>> = {
  my_work: myWork,
  my_goals: myGoals,
  my_reviews: myReviews,
  my_coaching: myCoaching,
  my_time_off: myTimeOff,
  my_pay: myPay,
  my_reimbursements: myReimbursements,
};

export const isTeamDataTool = (name: string): boolean => Object.hasOwn(TOOLS, name);
export const isMyTool = (name: string): boolean => Object.hasOwn(MY_TOOLS, name);

export async function runTeamDataTool(name: string, input: ToolInput, access: ChatAccess): Promise<ToolOutcome> {
  const tool = TOOLS[name];
  if (!tool) return { content: `Unknown tool: ${name}`, isError: true };
  return failuresSaid(name, () => tool(input, access));
}

export async function runMyTool(name: string, input: ToolInput, me: ChatSelf): Promise<ToolOutcome> {
  const tool = MY_TOOLS[name];
  if (!tool) return { content: `Unknown tool: ${name}`, isError: true };
  return failuresSaid(name, () => tool(input, me));
}

async function failuresSaid(name: string, run: () => Promise<ToolOutcome>): Promise<ToolOutcome> {
  try {
    return await run();
  } catch (err) {
    // A failed read is said as a failure, never as an empty answer.
    if (err instanceof ReadFailure) {
      console.error(`[team/chat] ${name}:`, err.message);
      return { content: "That lookup failed on the database side. Say so and suggest trying again.", isError: true };
    }
    throw err;
  }
}
