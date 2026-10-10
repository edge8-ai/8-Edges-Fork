import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import { featuredPostIds } from "@/entities/campaigns/lib/broadcast-report";
import { saveNotes, updateLetter } from "./data";
import type { StepRunner } from "./types";

// Step 2: three published posts of the letter's brand that no sent letter has
// featured, newest first, at most two from one pillar so a letter does not
// read as one argument three times. Falls back to the posts featured longest
// ago when fewer than three are unsent, and says so in the summary.

type Row = { id: string; title: string; publish_date: string | null; marketing_pillars: { name: string } | { name: string }[] | null };

export const runPick: StepRunner = async ({ letter }) => {
  if (!letter.brandId) return { ok: false, error: "Pick: the broadcast has no brand, so there is no post list to pick from." };
  const { data, error } = await companyOs.from("marketing_content").select("id, title, publish_date, marketing_pillars(name)")
    .eq("channel", "blog")
    .eq("status", "published")
    .eq("brand_id", letter.brandId)
    .not("slug", "is", null)
    .order("publish_date", { ascending: false })
    .limit(60);
  if (error) return { ok: false, error: `Pick: ${error.message}` };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, title: r.title, pillar: one(r.marketing_pillars)?.name ?? null }));
  if (rows.length < 3) return { ok: false, error: `Pick: only ${rows.length} published post(s) on this brand.` };

  const sent = await featuredPostIds();
  const choose = (pool: typeof rows) => {
    const picked: typeof rows = [];
    const perPillar = new Map<string, number>();
    for (const p of pool) {
      const key = p.pillar ?? "";
      if ((perPillar.get(key) ?? 0) >= 2) continue;
      picked.push(p);
      perPillar.set(key, (perPillar.get(key) ?? 0) + 1);
      if (picked.length === 3) break;
    }
    return picked;
  };

  let picked = choose(rows.filter((r) => !sent.has(r.id)));
  let note = "";
  if (picked.length < 3) {
    picked = choose(rows);
    note = " Fewer than three unsent posts: the pick includes posts sent before.";
  }
  if (picked.length < 3) return { ok: false, error: "Pick: could not assemble three posts within the pillar rule." };

  const saved = await updateLetter(letter.id, { blocks: { ...letter.blocks, posts: picked.map((p) => p.id) } });
  if (!saved.ok) return saved;
  letter.blocks = { ...letter.blocks, posts: picked.map((p) => p.id) };
  const noted = await saveNotes(letter, { picked });
  if (!noted.ok) return noted;
  return { ok: true, summary: `Picked: ${picked.map((p) => p.title).join(" · ")}.${note}` };
};
