// The facts Quests states (QS.2; spec 2026-10-20, "Notifications: email, Lark
// and the inbox"), part of the one vocabulary in catalogue.ts and split out only
// for the file-size cap. Quests publishes each one after its own write landed;
// what to say about it, and to whom, is the subscriber's. The inbox writes rows
// for the summon and the Reaction; Quests itself listens to the summon and the
// reminder to send their email and Lark DMs,
// so a failed send is the bus's to record and never the publisher's.
//
// No fact names who missed. A Missed is read about one person on one quest by
// that person, their manager, an admin or a manager Giver (ADR 0020), and any
// entity may subscribe to the bus, so quest.closed says that a quest closed and
// nothing about anyone on it. Nor does any fact count a person's misses.
import { z } from "zod";

const id = z.string().min(1);
/** An instant with its offset, as quest_heads.closes_at stores one. */
const instant = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be a timestamp");

export const QUEST_EVENTS = {
  // A Bounty was summoned: its quest, heads and party rows are written. One
  // fact for the whole party; each person called gets an inbox row, an email
  // and a Lark DM, each with one link to the Quests page. `required` is the
  // quest's own flag (a manager or an admin gave it).
  "quest.called": z.object({
    questId: id,
    title: z.string().min(1),
    giverId: id,
    giverName: z.string().min(1).optional(),
    required: z.boolean(),
    /** Everyone called, once each (company_os.people ids, staff when summoned). */
    personIds: z.array(id).min(1),
    /** The heads in the Giver's order, each with its ask and due time. */
    heads: z.array(z.object({ headId: id, ask: z.string().min(1), closesAt: instant })).min(1),
  }),

  // A party member turned in on one head. Stated for every Turn-in, late or
  // not. A Turn-in waits for its Giver on the Quests page (the daily nudge was
  // dropped in QS.2b), so this has no inbox listener today. The Ladders
  // recompute the person who turned in (A.75).
  "quest.turned_in": z.object({ questId: id, headId: id, personId: id, giverId: id, late: z.boolean() }),

  // The Giver reacted to one person's Turn-in. The inbox tells that person.
  "quest.reacted": z.object({
    questId: id,
    headId: id,
    /** Whose Turn-in it was. */
    personId: id,
    giverId: id,
    giverName: z.string().min(1).optional(),
    title: z.string().min(1),
    line: z.string().min(1),
  }),

  // A fire was held (ADR 0023): a Raid's session ended, was not cancelled, and
  // someone other than its Host attended. The quest clock states it within a
  // tick of the session's end, over a window that overlaps the last tick, so a
  // fire may be stated twice; the Ladders recompute the Host, which writes the
  // same rows the second time. Names no one who came.
  "quest.fire.held": z.object({ questId: id, hostId: id }),

  // A quest closed: its Giver closed it early, or the clock closed its last
  // head. Stated once, by whichever write moved it from open to closed.
  "quest.closed": z.object({ questId: id, giverId: id, by: z.enum(["giver", "clock"]) }),

  // One head of an open Bounty is due within two hours, and these people are
  // still out on it and have not been reminded (required: everyone called;
  // optional: those who accepted). Quests claimed each row's reminded_at
  // before stating it, so a person is named once per head, and sends each a
  // private email and a Lark DM. No inbox row.
  //
  // The payload lists who is still out on a head shortly before it closes,
  // which is who is about to miss, and ADR 0020 keeps that from the party.
  // Its one subscriber sends each person their own reminder and keeps no list:
  // neither the email nor the DM leaves an interactions row on the CRM
  // timeline (crmLog: false), and a failed send raises with the head and a
  // count, never a person, because the bus stores and audits that error. Each
  // send's key names the head and a hash of the person id, in the effect
  // ledger, on Resend and in the audit line of an unconfirmed (409) email; the
  // hash is no secret, so that key is ADR 0020 territory, read only by an
  // admin's Settings -> Agents, and no other surface may read it
  // (entities/quests/lib/quest-messages.ts). This fact must never gain a
  // subscriber that stores the list or shows it to anyone but each person
  // themself: not an inbox row, not a Giver's or a party view, not a CRM
  // timeline row, not an audit line naming them. A manager's view of Missed
  // reads the rows of one quest under its own permission, never this fact.
  "quest.head.due_soon": z.object({
    questId: id,
    headId: id,
    title: z.string().min(1),
    ask: z.string().min(1),
    closesAt: instant,
    personIds: z.array(id).min(1),
  }),
} as const;
