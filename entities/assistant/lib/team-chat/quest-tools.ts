// Server-only. The team assistant's quest tools (QS.9; quests spec 2026-10-20,
// "Claude" and "Access"; ADR 0013, ADR 0020), each with the Quests atom it
// needs. Their names keep the quest words (the entity does); what the model reads
// is in ask words (AK.7). Their bodies live in entities/team/api/team/chat/quest-tools.ts and read
// through the quests door. No tool here totals anyone's answers across
// quests, so "who misses the most?" has no read to answer it, and none of
// them sends or answers an ask: only the read-and-draft tools ship.
import type Anthropic from "@anthropic-ai/sdk";
import type { PermittedTool } from "../tool-permission";

const NO_INPUT = { type: "object", properties: {} } as const;

// my_quests and draft_bounty read the signed-in person's own asks and take
// no person: the route hands the body the session's actor. Neither writes;
// draft_bounty returns a draft the person sends from the page (Send ask).
const MY_QUESTS_TOOL: Anthropic.Tool = {
  name: "my_quests",
  description:
    "The person's own open asks on the Asks page: what is waiting on them. Each ask has " +
    "its asker, its opening note, whether it is optional (nobody is expected to answer an " +
    "optional ask, though they may; an ask from a manager or an admin is required), and " +
    "every open question they still owe with its due time in Saigon and where they stand " +
    "on it (not answered yet, or said they would answer). Only the person's own: it says " +
    "nothing about where anyone else stands. It links the Asks page.",
  input_schema: NO_INPUT,
};

const DRAFT_BOUNTY_TOOL: Anthropic.Tool = {
  name: "draft_bounty",
  description:
    "Draft an ask from the person's instruction (\"ask everyone to watch the launch by " +
    "Friday\") for them to check and send themselves. It writes nothing and asks nobody: " +
    "it returns the draft and a link to the Asks page that opens the New ask drawer filled " +
    "in, where nobody is asked until the person presses Send ask. Give a short title; an " +
    "optional note to the people asked; one entry in heads for the question, with its " +
    "ask, its due date (YYYY-MM-DD, a weekday such as friday, today or tomorrow, in " +
    "Saigon) and an optional time (HH:MM Saigon, default 18:00). For a pasted message, " +
    "make one entry with the question and leave out lines that are information rather " +
    "than a question. call is \"everyone\" or the names of the people to ask; only staff " +
    "can be asked. learning is true when the answers are learnings worth sharing. " +
    "instruction is the person's own words, quoted back in the drawer. " +
    "If a name matches more than one person or nobody, relay the message and ask.",
  input_schema: {
    type: "object",
    properties: {
      instruction: { type: "string", description: "The person's instruction, in their words." },
      title: { type: "string", description: "The ask's title, under 200 characters." },
      note: { type: "string", description: "An optional opening note to the people asked." },
      learning: { type: "boolean", description: "Whether the answers are learnings worth sharing. Defaults to true." },
      call: {
        description: 'Who to ask: "everyone", or a list of staff names.',
        anyOf: [{ type: "string", enum: ["everyone"] }, { type: "array", items: { type: "string" } }],
      },
      heads: {
        type: "array",
        description: "The question, with its due date.",
        items: {
          type: "object",
          properties: {
            ask: { type: "string" },
            date: { type: "string", description: "YYYY-MM-DD, a weekday (friday), today or tomorrow, in Saigon." },
            time: { type: "string", description: "HH:MM in Saigon. Defaults to 18:00." },
          },
          required: ["ask", "date"],
        },
      },
    },
    required: ["title", "call", "heads"],
  },
};

// The manager's one question: who among the people the asker reaches missed ONE
// named ask. A manager reaches their direct reports, an admin everyone, and the
// asker of a required ask everyone they asked. It takes an ask's title and nothing
// that names a person, and reads that one ask: there is no way to ask it about a
// person across asks.
const QUEST_REPORT_TOOL: Anthropic.Tool = {
  name: "quest_report",
  description:
    "For ONE ask, named by its title: where each person the asker reaches stands on " +
    "it (Missed, Answered, Answered late, Said they would answer, Not answered yet, Handed back). A " +
    "manager reaches their direct reports, an admin everyone, and the asker of a " +
    "required ask everyone they asked. If the title matches more than one " +
    "ask it says so with their titles: ask which one, and never call it once per " +
    "ask. It answers about one ask only; nothing totals a person's answers or " +
    "misses across asks, so it cannot say who misses the most or how often someone " +
    "misses. A late answer lifts a Missed, and a withdrawn ask has no Missed.",
  input_schema: {
    type: "object",
    properties: { bounty: { type: "string", description: "The ask's title, or a distinctive part of it." } },
    required: ["bounty"],
  },
};

/**
 * The quest tools with their atoms: my_quests and draft_bounty for whoever may
 * open the Asks page (a team member or a contractor, about their own asks),
 * quest_report for whoever holds quests.report (a manager, an admin), whose
 * body applies that reach to each person again.
 */
export const QUEST_TOOLS: readonly PermittedTool[] = [
  { tool: MY_QUESTS_TOOL, permission: "quests.mine" },
  { tool: DRAFT_BOUNTY_TOOL, permission: "quests.mine" },
  { tool: QUEST_REPORT_TOOL, permission: "quests.report" },
];
