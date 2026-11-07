"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getLastRecap } from "./data/row-bar";
import { coachingMarkdownToHtml } from "./markdown";
import type { LastRecapView } from "./row-actions";
import type { Result } from "@/kernel/data/result";

import { parseInput, zId } from "./schemas";
import { z } from "zod";

// What the roster's row-bar actions accept (ticket 13).
const S = { profile: z.object({ profileId: zId }) };

// The roster row's drawer (K.57). Its undo-after-mark-held twin went in K.80,
// when "Mark it done" replaced the instant write. It starts with the guard
// (CLAUDE.md rule 1) and re-derives ownership server-side: the browser hands
// over an id, never a permission.

// The previous recap, rendered, for the row's drawer. The markdown is turned
// into HTML on the server for the same reason every other coaching document is
// (lib/markdown.ts): the body is coach- and AI-authored prose, and the sanitize
// pass belongs on the side of the wire that can be trusted to run it.
export async function lastRecapForRow(
  profileId: string,
): Promise<{ ok: true; recap: LastRecapView } | { ok: false; error: string }> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.profile, { profileId });
  if (!p.ok) return p;
  const recap = await getLastRecap(actor, p.data.profileId);
  if (!recap) return { ok: false, error: "No 1-1 has been held yet." };
  const html = recap.markdown ? await coachingMarkdownToHtml(recap.markdown) : null;
  return { ok: true, recap: { heldOn: recap.heldOn, html } };
}
