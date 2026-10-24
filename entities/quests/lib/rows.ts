// The quests tables' rows as the entity reads and writes them (QS.1): the
// generated Supabase types, narrowed to the columns each read selects and to
// the entity's own unions where the database stores text (kind, state,
// standing). Deriving them from Tables and TablesInsert means a column the
// schema gains or loses shows up here as a type error, not as a drifted shape.
import type { Tables, TablesInsert } from "@/kernel/data/supabase/database.types";
import type { QuestKind, QuestState, Standing } from "./standing";

type CompanyOs = { schema: "company_os" };
type Narrow<Row, K extends keyof Row, N> = Omit<Pick<Row, K>, keyof N> & N;

export type QuestRow = Narrow<Tables<CompanyOs, "quests">, "id" | "kind" | "title" | "ask" | "giver_id" | "state" | "learning" | "required" | "closing_date" | "closed_at" | "created_at", { kind: QuestKind; state: QuestState }>;

export type HeadRow = Pick<Tables<CompanyOs, "quest_heads">, "id" | "quest_id" | "position" | "ask" | "closes_at" | "closed_at">;

export type PartyDbRow = Narrow<Tables<CompanyOs, "quest_party">, "id" | "quest_id" | "head_id" | "person_id" | "standing" | "late" | "accepted_at" | "turned_in_at" | "handed_back_at" | "missed_at" | "turn_in_text", { standing: Standing }>;

export type ReactionRow = Pick<Tables<CompanyOs, "quest_reactions">, "party_id">;

export type QuestInsert = Narrow<TablesInsert<CompanyOs, "quests">, "kind" | "title" | "ask" | "giver_id" | "closing_date" | "learning" | "required", { kind: QuestKind; closing_date: string; learning: boolean; required: boolean }>;

/** A Raid as Light it writes it (QS.5): open-ended, with its Host and its Training session, and what it grew from when Evolve lit it. */
export type RaidInsert = Narrow<TablesInsert<CompanyOs, "quests">, "kind" | "title" | "ask" | "giver_id" | "host_id" | "training_id" | "origin_idea_id" | "learning" | "required", { kind: "raid"; host_id: string; training_id: string; learning: boolean; required: false }>;

/**
 * A Beacon as lighting writes it (QS.6): lit by its own author, so the Giver is
 * the person who put the thing out, with the link on the quest (lit_url) and
 * what it grew from when a held fire was lit as a Beacon. It is written closed:
 * its one ask, light it with a link, is answered in the same action, so no
 * clock or close is ever owed on it. Nothing here, or anywhere, stores reach.
 */
export type BeaconInsert = Narrow<
  TablesInsert<CompanyOs, "quests">,
  "kind" | "title" | "ask" | "giver_id" | "lit_url" | "origin_quest_id" | "origin_idea_id" | "state" | "closed_at" | "learning" | "required",
  { kind: "beacon"; lit_url: string; state: "closed"; closed_at: string; learning: false; required: false }
>;

/** A Beacon's one head, written closed at the moment it is lit: a party row answers a head (quest_party.head_id is not null). */
export type BeaconHeadInsert = Pick<TablesInsert<CompanyOs, "quest_heads">, "quest_id" | "position" | "ask" | "closes_at" | "closed_at"> & { closed_at: string };

/** The author's own party row on their Beacon, turned in with the link: the ladders credit a Beacon from this row (the witness rule). */
export type BeaconPartyInsert = Narrow<
  TablesInsert<CompanyOs, "quest_party">,
  "quest_id" | "head_id" | "person_id" | "standing" | "accepted_at" | "turned_in_at" | "late" | "turn_in_url",
  { standing: "turned_in"; accepted_at: string; turned_in_at: string; late: false; turn_in_url: string }
>;

/** A half-lit Beacon taken back: withdrawn, and so no longer closed (quests_closed_shape). */
export type BeaconWithdrawPatch = { state: "withdrawn"; withdrawn_at: string; closed_at: null };

/** A lit Beacon as the Lighthouses read takes it. */
export type BeaconRow = Pick<Tables<CompanyOs, "quests">, "id" | "title" | "giver_id" | "created_at"> & { lit_url: string };

/** A Raid the reader hosted, as the Lighthouses read asks whether it was held and whether it has a Beacon yet. */
export type HostedRaidRow = Pick<Tables<CompanyOs, "quests">, "id" | "title" | "origin_idea_id"> & { training_id: string };

/** A raised hand as the Campfires read takes it (QS.5). The person is read to count hands and find the reader's own; it never leaves the read. */
export type HandRow = Pick<Tables<CompanyOs, "quest_hands">, "person_id" | "topic" | "created_at"> & { topic_key: string };

/** A lit Raid as the Campfires read takes it: its Host and its session, both set by Light it, so never null here. */
export type LitRaidRow = Pick<Tables<CompanyOs, "quests">, "id" | "title"> & { host_id: string; training_id: string };

export type HeadInsert = Pick<TablesInsert<CompanyOs, "quest_heads">, "quest_id" | "position" | "ask" | "closes_at">;

export type PartyInsert = Narrow<TablesInsert<CompanyOs, "quest_party">, "quest_id" | "head_id" | "person_id" | "standing" | "accepted_at", { standing: "called" | "accepted" }>;

export type ReactionInsert = Pick<TablesInsert<CompanyOs, "quest_reactions">, "quest_id" | "party_id" | "line">;

/** A raised hand (QS.5): the person and the topic as typed; topic_key is the database's. */
export type HandInsert = Pick<TablesInsert<CompanyOs, "quest_hands">, "person_id" | "topic">;
/** Lighting a fire sets the Raid on every hand of the topic. */
export type HandPatch = { quest_id: string };
/** The columns each read selects, so the rows above and the queries cannot drift apart. */
export const QUEST_COLUMNS = "id, kind, title, ask, giver_id, state, learning, required, closing_date, closed_at, created_at";
export const HEAD_COLUMNS = "id, quest_id, position, ask, closes_at, closed_at";
export const HAND_COLUMNS = "person_id, topic, topic_key, created_at";
export const RAID_COLUMNS = "id, title, host_id, training_id";
export const BEACON_COLUMNS = "id, title, giver_id, lit_url, created_at";
export const HOSTED_RAID_COLUMNS = "id, title, origin_idea_id, training_id";
export const PARTY_COLUMNS = "id, quest_id, head_id, person_id, standing, late, accepted_at, turned_in_at, handed_back_at, missed_at, turn_in_text";
