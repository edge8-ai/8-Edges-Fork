"use server";

// The reader's own choices about what the game shows (spec 2026-10-21, "The
// door"; ADR 0021). Each command opens with ladders.mine and acts on the
// reader's own ladder_display row and nobody else's: there is no subject
// parameter to name anyone else. The game style switch came first, with QS.11
// (2026-10-21); setWear with LD.4; setDisplay with LD.6.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { mustRows, ReadFailure } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { upsertLadderDisplay } from "./writes";
import { selectLadderUnlocks } from "./reads";
import type { Ladder } from "./points";
import { BANNERS, DISPLAY_CASE_HOLDS, STAT_KEYS, type DisplayChange } from "./display-choices";

const On = z.boolean();

/**
 * Turns the reader's game style on or off (QS.11). Off shows Quests in its
 * plain view and quiets the Ladders' rank-up and badge drops; nobody else sees
 * the difference. The Quests page reaches it through the gameStyle page slot,
 * because quests may not import ladders.
 */
export async function setGameStyle(on: boolean): Promise<Result> {
  await requirePermission("ladders.mine");
  const actor = await requireTeamMember();
  const parsed = On.safeParse(on);
  if (!parsed.success) return { ok: false, error: "Say on or off." };
  const { error } = await upsertLadderDisplay({ person_id: actor.personId, game_style: parsed.data });
  if (error) return { ok: false, error: "Your game style could not be saved. Try again." };
  // The style decides more than the Quests page: with it off, the viewer sees no
  // worn border anywhere on the team surface, the sidebar's own face included
  // (LD.4), so every team page is drawn again, as setWear does below.
  revalidatePath("/team", "layout");
  return { ok: true };
}

const WearInput = z.object({ ladder: z.enum(["learn_share", "builder"]), on: z.boolean() }).strict();

/** The ladder_display column each ladder's wear switch writes; one place, so the ladder keeps points.ts's spelling everywhere. */
const WEAR_COLUMN = { learn_share: "wear_learn_share", builder: "wear_builder" } as const satisfies Record<Ladder, string>;

/**
 * Wears or hides the reader's tier on one ladder (LD.4; spec "Wearing"). Both
 * start off, so nobody learns a tier until its holder shows it. Learn & Share
 * is worn as a border round the reader's face wherever the team surface draws
 * it; Builder as a medal on the profile plaque and the postcard (LD.6). It
 * writes the reader's own row and nobody else's: the reader is the signed-in
 * person, and the command has no parameter that could name anyone else.
 */
export async function setWear(ladder: Ladder, on: boolean): Promise<Result> {
  await requirePermission("ladders.mine");
  const actor = await requireTeamMember();
  const parsed = WearInput.safeParse({ ladder, on });
  if (!parsed.success) return { ok: false, error: "Say which ladder, and on or off." };
  const { ladder: which, on: wear } = parsed.data;
  const row = { person_id: actor.personId, [WEAR_COLUMN[which]]: wear };
  const { error } = await upsertLadderDisplay(row);
  if (error) return { ok: false, error: "Your choice could not be saved. Try again." };
  // A worn border shows on the reader's face in the team sidebar and on every
  // team page that draws them, so every team page is drawn again.
  revalidatePath("/team", "layout");
  return { ok: true };
}

/** At most `max`, each once, in the order given. */
const distinct = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).max(max).refine((xs) => new Set(xs).size === xs.length, "Each one once.");

const DisplayInput = z
  .object({
    banner: z.enum(BANNERS),
    titleBadge: z.string().min(1).max(80).nullable(),
    shownStats: distinct(z.enum(STAT_KEYS), STAT_KEYS.length),
    displayCase: distinct(z.string().min(1).max(80), DISPLAY_CASE_HOLDS),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Say what to change.");

/** The badges the reader found: the only ones they may wear as a Title or put in their display case. */
async function badgesFoundBy(personId: string): Promise<Set<string>> {
  const rows = mustRows(await selectLadderUnlocks("key").eq("person_id", personId).eq("kind", "badge"), "[ladders] badges found") as unknown as { key: string }[];
  return new Set(rows.map((r) => r.key));
}

/**
 * Dresses the reader's own profile (LD.6; spec "The profile page"): the
 * banner, the badge worn as a Title, the stats switched on and the display
 * case, at most five. Each field is optional and only the fields given are
 * written, so the banner picker cannot undo a stat switch saved a moment
 * before. A Title and the display case name badges the reader found and
 * nothing else: a badge they have not found is refused. Like setWear, it
 * writes the reader's own row and has no parameter that could name anyone
 * else.
 */
export async function setDisplay(change: DisplayChange): Promise<Result> {
  await requirePermission("ladders.mine");
  const actor = await requireTeamMember();
  const parsed = DisplayInput.safeParse(change);
  if (!parsed.success) return { ok: false, error: "That choice is not one the profile offers." };
  const { banner, titleBadge, shownStats, displayCase } = parsed.data;
  const named = [...(titleBadge ? [titleBadge] : []), ...(displayCase ?? [])];
  if (named.length > 0) {
    let found: Set<string>;
    try {
      found = await badgesFoundBy(actor.personId);
    } catch (err) {
      // A failed read is a refusal with its reason; anything else is a bug and is not hidden.
      if (!(err instanceof ReadFailure)) throw err;
      return { ok: false, error: "Your badges could not be read just now. Try again." };
    }
    if (named.some((key) => !found.has(key))) return { ok: false, error: "Only a badge you found can go there." };
  }
  const row = {
    person_id: actor.personId,
    ...(banner !== undefined ? { banner } : {}),
    ...(titleBadge !== undefined ? { title_badge: titleBadge } : {}),
    ...(shownStats !== undefined ? { shown_stats: shownStats } : {}),
    ...(displayCase !== undefined ? { display_case: displayCase } : {}),
  };
  const { error } = await upsertLadderDisplay(row);
  if (error) return { ok: false, error: "Your profile could not be saved. Try again." };
  // The owner's page is drawn again; a teammate's view of it is read fresh on every visit.
  revalidatePath("/team/profile");
  return { ok: true };
}
