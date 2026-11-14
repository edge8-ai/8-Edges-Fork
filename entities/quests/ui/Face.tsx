// A person's portrait on the Quests page: their initials on a tone kept by
// their id. The page only ever draws the faces of people who have turned in
// (lit portraits), the Giver, the reader, and the names in the Summon drawer's
// picker; a face for someone still out is never drawn.
//
// The face is the kernel's Avatar (LD.3) under Quests' own classes, so with no
// border it is the element Quests always drew. The border is the person's worn
// Learn & Share tier (LD.4), which the page read once for every face it draws
// and provides by person (kernel/ui/face-borders.ts). It shows only in the game style:
// the seam answers nothing for a viewer whose switch was off when the page was
// drawn, and a viewer who turns it off on the page sees plain faces at once.
import { Avatar } from "@/kernel/ui/Avatar";
import { useFaceBorder } from "@/kernel/ui/face-borders";
import { useGameStyle } from "./game-style";
import { portraitTone } from "./quests-model";
import type { Portrait } from "../lib/quests-read";

type FaceSize = "sm" | "md" | "lg";

// `bare` draws the face with no border whatever its owner wears: the ghost
// lighthouse (QS.6) stands where the reader's Beacon would, not one they lit.
export function Face({ who, size = "md", lit = false, fresh = false, bare = false }: { who: Portrait; size?: FaceSize; lit?: boolean; fresh?: boolean; bare?: boolean }) {
  const worn = useFaceBorder(who.personId);
  const border = useGameStyle() && !bare ? worn : null;
  const cls = ["qs-av", `qs-av--${size}`, `qs-tone-${portraitTone(who.personId)}`, lit ? "qs-av--lit" : "", fresh ? "qs-av--fresh" : ""].filter(Boolean).join(" ");
  return <Avatar className={cls} name={who.name} initials={who.initials} border={border} />;
}
