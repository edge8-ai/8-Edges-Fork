"use server";
// Kudos (TH.1.8): give a teammate thanks, or take down one you gave. The Home
// card and the month's page both call these, so they live with the data in
// lib/ (Rule 4), guarded by the culture atom the gallery uses.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { publish } from "@/kernel/events";
import type { Result } from "@/kernel/data/result";
import { archiveOwnKudos, insertKudos } from "./kudos";
import { cleanKudos, KUDOS_MAX } from "./kudos-rules";

const GiveInput = z.object({
  toPersonId: z.string().uuid(),
  body: z.string(),
});

function refresh() {
  revalidatePath("/team");
  revalidatePath("/team/kudos");
}

export async function giveKudos(input: { toPersonId: string; body: string }): Promise<Result> {
  await requirePermission("team.culture");
  const actor = await requireTeamMember();
  const parsed = GiveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a teammate to thank." };
  const body = cleanKudos(parsed.data.body);
  if (!body) return { ok: false, error: "Write your thanks in one line first." };
  if (body.length > KUDOS_MAX) return { ok: false, error: `Keep it to one line, under ${KUDOS_MAX} characters.` };
  if (parsed.data.toPersonId === actor.personId) return { ok: false, error: "Kudos go to a teammate, not to yourself." };

  const { data, error } = await insertKudos(actor.personId, parsed.data.toPersonId, body);
  if (error || !data) return { ok: false, error: "Could not send your kudos. Try again in a moment." };
  // The fact goes on the bus; the inbox decides who hears it.
  await publish("kudos.given", {
    kudosId: data.id,
    body,
    actorName: actor.greeting ?? actor.name,
    assigneeId: parsed.data.toPersonId,
    actorPersonId: actor.personId,
  });
  refresh();
  return { ok: true };
}

export async function takeDownKudos(id: string): Promise<Result> {
  await requirePermission("team.culture");
  const actor = await requireTeamMember();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "That kudos is not here any more." };
  const { data, error } = await archiveOwnKudos(id, actor.personId);
  if (error) return { ok: false, error: "Could not take it down. Try again in a moment." };
  if (!data || data.length === 0) return { ok: false, error: "Only the person who gave a kudos can take it down." };
  refresh();
  return { ok: true };
}
