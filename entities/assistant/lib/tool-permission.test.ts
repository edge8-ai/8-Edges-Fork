// The assistant is never a side door (AC.15, ADR 0013): the model is handed
// only the tools whose permission the person holds.
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { toolsFor } from "./tool-permission";
import { chatbotTools as teamTools } from "./team-chat/tools";
import { chatbotTools as adminTools } from "./admin-chat/tools";

const holding = (...held: string[]) => (permission: string) => held.includes(permission);
const names = (tools: Anthropic.Tool[]) => tools.map((t) => t.name);
const tool = (name: string): Anthropic.Tool => ({ name, input_schema: { type: "object", properties: {} } });

describe("toolsFor", () => {
  it("hands a tool to someone holding its permission and withholds it from someone who does not", () => {
    const tools = [
      { tool: tool("open"), permission: "surface.team" },
      { tool: tool("narrow"), permission: "assistant.narrow" },
    ];
    expect(names(toolsFor(holding("surface.team"), tools))).toEqual(["open"]);
    expect(names(toolsFor(holding("surface.team", "assistant.narrow"), tools))).toEqual(["open", "narrow"]);
  });

  it("is closed by default: a tool whose permission is blank is handed to nobody, even someone holding everything", () => {
    expect(toolsFor(() => true, [{ tool: tool("stray"), permission: " " }])).toEqual([]);
  });
});

describe("the team assistant's tools", () => {
  it("hands every open tool to a team member, and the per-client and review tools only when their scope allows", () => {
    const member = teamTools({ may: holding("surface.team"), seesAnyClient: false, canRequestReviews: false });
    expect(names(member)).not.toContain("client_financials");
    expect(names(member)).not.toContain("request_review_link");
    expect(names(member)).toContain("company_totals");
    const placed = teamTools({ may: holding("surface.team"), seesAnyClient: true, canRequestReviews: true });
    expect(names(placed)).toEqual(expect.arrayContaining(["client_financials", "client_contacts", "request_review_link"]));
  });

  it("hands no tool at all to someone without the Team view's permission, whatever their scopes", () => {
    expect(teamTools({ may: holding("surface.admin"), seesAnyClient: true, canRequestReviews: true })).toEqual([]);
  });
});

// AE.1 (ADR 0014): each tool names its own atom, so entering the Admin view is
// never enough to be handed the database.
describe("the admin assistant's tools", () => {
  it("hands query_database to a holder of assistant.query, and the privileged tools only to a privileged holder of assistant.write", () => {
    expect(names(adminTools({ may: holding("assistant.query"), canWrite: false }))).toEqual(["query_database"]);
    expect(names(adminTools({ may: holding("assistant.query"), canWrite: true }))).toEqual(["query_database"]);
    expect(names(adminTools({ may: holding("assistant.query", "assistant.write"), canWrite: false }))).toEqual(["query_database"]);
    expect(names(adminTools({ may: holding("assistant.query", "assistant.write"), canWrite: true }))).toEqual([
      "query_database",
      "execute_write",
      "send_email",
      "invite_portal_member",
    ]);
  });

  it("hands no tool to someone who only enters the Admin view, even a privileged email", () => {
    expect(adminTools({ may: holding("surface.admin"), canWrite: true })).toEqual([]);
    expect(adminTools({ may: holding("surface.team"), canWrite: true })).toEqual([]);
  });
});
