import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The badges' fence (LD.7b; spec "The client portal never shows", ADR 0021
// "Who reads what"). A badge drop, the Achievements tab and the postcard's
// stickers reach the team surface only: the two page slots are mounted on
// team routes alone, no admin or portal file names them or the components
// behind them, and the portal entity imports none of it. A teammate's page
// showing no Achievements tab and no locked or secret tile is pinned beside
// the page itself (ui/profile/ProfilePages.test.tsx), and the slot answering
// nobody but the reader beside the slot (ui/badges/drops.test.tsx).

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE = /\.(ts|tsx|mjs)$/;

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !SOURCE.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    out.push(path.relative(ROOT, path.join(entry.parentPath, entry.name)));
  }
  return out;
}

const BADGE_NAMES = /\b(badgeDrops|questBadgeDrops|postcardStickers|BadgeDrop|BadgeDropsSlot|QuestBadgeDropsSlot|PostcardStickersSlot|OwnAchievements|AchievementsView|Stickers)\b/;
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

describe("badges reach the team surface only", () => {
  it("mounts the two badge slots on team routes alone", () => {
    const mounts = fs.readdirSync(path.join(ROOT, "entities")).map((e) => `entities/${e}/mounts.ts`).filter((f) => fs.existsSync(path.join(ROOT, f)));
    const mounted: string[] = [];
    for (const file of mounts) {
      // Each mount entry opens with its quoted route key at two spaces; a slot line belongs to the key above it.
      let key = "";
      for (const line of read(file).split("\n")) {
        const open = /^ {2}"([^"]+)": \{/.exec(line);
        if (open) key = open[1];
        if (/^\s*slots:.*\b(badgeDrops|questBadgeDrops|postcardStickers)\b/.test(line)) mounted.push(`${file.split("/")[1]}:${key}`);
      }
    }
    expect(mounted.length).toBeGreaterThanOrEqual(7);
    expect(mounted).toContain("quests:routes/team/(dashboard)/quests/page");
    expect(mounted.filter((m) => !m.split(":")[1].startsWith("routes/team/"))).toEqual([]);
  });

  it("names them in no admin or portal file, and the portal entity imports none of them", () => {
    const files = [...sourcesUnder("app/admin"), ...sourcesUnder("app/portal"), ...sourcesUnder("entities/portal").filter((f) => !f.startsWith("entities/portal/routes/team/"))];
    expect(files).toContain("app/portal/(dashboard)/layout.tsx");
    expect(files.filter((f) => BADGE_NAMES.test(read(f)) || /entities\/ladders\/ui\/badges/.test(read(f)))).toEqual([]);
  });

  it("draws no division, star or point on a drop, a tile or a sticker", () => {
    const badgeUi = sourcesUnder("entities/ladders/ui/badges");
    expect(badgeUi.length).toBeGreaterThan(5);
    for (const f of badgeUi) expect([f, /★|\bdivision\b|\bpoints?\b/i.test(read(f).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))]).toEqual([f, false]);
  });
});
