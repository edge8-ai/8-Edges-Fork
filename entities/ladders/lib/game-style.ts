// The reader's game style (QS.11, decided by Khoa on 2026-10-21): on until the
// person turns it off, for themselves alone. The Profile reads it here; the
// Quests page that once took it as a page slot is gone (AK.4).
import { readOr } from "@/kernel/data/read";
import { selectLadderDisplay } from "./reads";

/**
 * Whether the reader sees the game style. It takes the reader, as myStanding
 * does, and answers only about them (ADR 0021). A reader with no row has never
 * turned it off, so it is on. A failed read also answers on, and says so in
 * the log: the game style is the approved default, and the page must still
 * draw rather than fail over a cosmetic choice.
 */
export async function gameStyleOf(reader: { personId: string }): Promise<boolean> {
  const rows = readOr(
    await selectLadderDisplay("game_style").eq("person_id", reader.personId).limit(1),
    "[ladders] game style",
    [] as { game_style: boolean }[],
  ) as unknown as { game_style: boolean }[];
  return rows[0]?.game_style ?? true;
}
