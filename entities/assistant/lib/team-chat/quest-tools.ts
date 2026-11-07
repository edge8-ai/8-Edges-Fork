// Server-only. The team assistant's quest tools (QS.9; quests spec 2026-10-20,
// "Claude" and "Access"; ADR 0013, ADR 0020), each with the Quests atom it
// needs. Their bodies live in entities/team/lib/chat/quest-tools.ts and read
// through the quests door. No tool here totals anyone's answers across
// quests, so "who misses the most?" has no read to answer it, and none of
// them lights a fire, raises a hand, Evolves or lights a Beacon (spec, Out of
// Scope): only the read-and-draft tools ship.
import type Anthropic from "@anthropic-ai/sdk";
import type { PermittedTool } from "../tool-permission";

const NO_INPUT = { type: "object", properties: {} } as const;

// my_quests and draft_bounty read the signed-in person's own quests and take
// no person: the route hands the body the session's actor. Neither writes;
// draft_bounty returns a draft the person posts from the page.
const MY_QUESTS_TOOL: Anthropic.Tool = {
  name: "my_quests",
  description:
    "The person's own open quests on the Quests page: the Bounties they are called on " +
    "or have accepted and still owe, each with its Giver, its opening note, whether it " +
    "is required (given by a manager or an admin: everyone called is committed, with no " +
    "Accept and no hand-back), and every open head they still owe with its ask, its due " +
    "time in Saigon and where they stand on it (called means not answered yet; on an " +
    "optional Bounty they may accept or decline); the Raids (burning fires) they have a " +
    "seat by or host, with the session's start, and a fire they host that has ended and " +
    "still needs Mark who came (toMark); and the fires they held that they may light as " +
    "a Beacon. Only the person's own: it says nothing about where anyone else stands.",
  input_schema: NO_INPUT,
};

const DRAFT_BOUNTY_TOOL: Anthropic.Tool = {
  name: "draft_bounty",
  description:
    "Draft a Bounty from the person's instruction (\"give everyone a quest to watch the " +
    "launch by Friday\") for them to check and post themselves. It writes nothing and " +
    "calls nobody: it returns the draft and a link to the Quests page that opens the " +
    "Summon drawer filled in, where nobody is called until the person presses Summon. " +
    "Give a short title; an optional note to the party; one head per ask, each with its " +
    "ask, its due date (YYYY-MM-DD, a weekday such as friday, today or tomorrow, in " +
    "Saigon) and an optional time (HH:MM Saigon, default 18:00). For a pasted message, " +
    "make one head per ask with its own due time and leave out lines that are " +
    "information rather than asks. call is \"everyone\" or the names of the people to " +
    "call; only staff can be called. learning is true when the Turn-ins are learnings " +
    "worth sharing. instruction is the person's own words, quoted back in the drawer. " +
    "If a name matches more than one person or nobody, relay the message and ask.",
  input_schema: {
    type: "object",
    properties: {
      instruction: { type: "string", description: "The person's instruction, in their words." },
      title: { type: "string", description: "The Bounty's title, under 200 characters." },
      note: { type: "string", description: "An optional opening note to the party." },
      learning: { type: "boolean", description: "Whether Turn-ins are learnings worth sharing in Spark. Defaults to true." },
      call: {
        description: 'Who to call: "everyone", or a list of staff names.',
        anyOf: [{ type: "string", enum: ["everyone"] }, { type: "array", items: { type: "string" } }],
      },
      heads: {
        type: "array",
        description: "One per ask, in order.",
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

// The manager's one question (QS.9, on QS.3's report): who among the people the
// asker reaches missed ONE named Bounty. A manager reaches their direct reports,
// an admin everyone, and the Giver of a required Bounty everyone they called on
// it. It takes a Bounty's title and nothing that names a person, and reads that
// one Bounty: there is no way to ask it about a person across Bounties.
const QUEST_REPORT_TOOL: Anthropic.Tool = {
  name: "quest_report",
  description:
    "For ONE Bounty, named by its title: where each person the asker reaches stands on " +
    "each head (Missed, Turned in, Turned in late, Accepted, Called, Handed back). A " +
    "manager reaches their direct reports, an admin everyone, and the Giver of a " +
    "required Bounty everyone they called on it. If the title matches more than one " +
    "Bounty it says so with their titles: ask which one, and never call it once per " +
    "Bounty. It answers about one Bounty only; nothing totals a person's answers or " +
    "misses across Bounties, so it cannot say who misses the most or how often someone " +
    "misses. A late Turn-in lifts a Missed, and a withdrawn Bounty has no Missed.",
  input_schema: {
    type: "object",
    properties: { bounty: { type: "string", description: "The Bounty's title, or a distinctive part of it." } },
    required: ["bounty"],
  },
};

/**
 * The quest tools with their atoms: my_quests and draft_bounty for whoever may
 * open the Quests page (a team member or a contractor, about their own quests),
 * quest_report for whoever holds quests.report (a manager, an admin), whose
 * body applies that reach to each person again.
 */
export const QUEST_TOOLS: readonly PermittedTool[] = [
  { tool: MY_QUESTS_TOOL, permission: "quests.mine" },
  { tool: DRAFT_BOUNTY_TOOL, permission: "quests.mine" },
  { tool: QUEST_REPORT_TOOL, permission: "quests.report" },
];
