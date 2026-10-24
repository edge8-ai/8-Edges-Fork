// The dressed profile's two pages (LD.6; spec "The profile page"; ADR 0021),
// the dressedProfile page slot app/shell.ts hands the team entity: the
// signed-in reader's own, and a teammate's.
//
// The fence holds in the signatures. OwnProfile takes no id: it reads the
// reader from the request, behind ladders.mine, and draws their standing for
// them alone, with Customise, the Quest log and the Achievements. Teammate
// takes a person and reads only wornTiers' profile answer, what that person
// switched on, with the viewer's own game style; it has no Quest log, no
// Achievements and no switch, and nothing in it carries a division, a star or
// a point.
import { Suspense, type ReactNode } from "react";
import { getAccess } from "@/kernel/identity/access-request";
import { ReadFailure } from "@/kernel/data/read";
import { mayProp } from "@/kernel/identity/may-prop";
import type { DressedProfileSlot, ProfilePerson } from "@/kernel/shell/page-slots";
import { Tabs, type TabDef } from "@/kernel/ui/Tabs";
import { QuestLog } from "@/entities/quests";
import { setDisplay, setGameStyle } from "../../lib/display-actions";
import { gameStyleOf } from "../../lib/game-style";
import { myStanding, type Standing } from "../../lib/standing";
import { wornTiers, type WornProfile } from "../../lib/worn";
import { YourLaddersView } from "../YourLadders";
import { dressOwn, dressTeammate, type CaseBadge, type ProfileDress } from "./profile-model";
import { ProfileHero, type Editor } from "./ProfileHero";
import { BadgeMedal } from "../badges/BadgeArt";
import { OwnAchievements } from "../badges/OwnAchievements";

/** The display case full size: each badge the person chose, in order, with its medal and its story (LD.7b). */
function CaseFull({ badges, empty }: { badges: CaseBadge[]; empty: string }) {
  if (badges.length === 0) return <p className="pf-ph">{empty}</p>;
  return (
    <ul className="bd-full">
      {badges.map((b) => (
        <li key={b.id} className={`bd-full-i${b.art ? ` bd--${b.art.rarity}` : ""}`}>
          {b.art ? <BadgeMedal glyph={b.art.glyph} glyphSize={34} /> : null}
          <h3 className="bd-n">{b.name}</h3>
          {b.art ? <span className="bd-r">{b.art.rarity}</span> : null}
          {b.art ? <p className="bd-d">{b.art.flavour}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Dressed({ dress, editor, tabs, tab }: { dress: ProfileDress; editor: Editor | null; tabs: TabDef[]; tab?: string }) {
  return (
    <div className="pf">
      <ProfileHero dress={dress} editor={editor} />
      <div className="pf-tabs">
        <Tabs tabs={tabs} initialKey={tab} syncParam="tab" />
      </div>
    </div>
  );
}

/** The owner's tabs: Overview, Quest log, Achievements, Display case and Postcard. */
function ownTabs(standing: Standing, dress: ProfileDress, personId: string, postcard: ReactNode): TabDef[] {
  return [
    { key: "overview", label: "Overview", content: <YourLaddersView standing={standing} /> },
    {
      key: "log",
      label: "Quest log",
      // Its paged reads stream behind the rest of the page instead of holding it up.
      content: (
        <Suspense fallback={<p className="pf-ph">Reading your quest log…</p>}>
          <QuestLog reader={{ personId }} gameOn={standing.display.gameStyle} />
        </Suspense>
      ),
    },
    {
      key: "achievements",
      label: "Achievements",
      // The owner's act facts behind the locked tiles' counts stream behind the rest of the page.
      content: (
        <Suspense fallback={<p className="pf-ph">Reading your badge case…</p>}>
          <OwnAchievements reader={{ personId }} standing={standing} />
        </Suspense>
      ),
    },
    { key: "case", label: "Display case", content: <CaseFull badges={dress.displayCase} empty="Your display case is empty. Up to five badges you found will sit here full size, each with its story." /> },
    { key: "postcard", label: "Postcard", content: postcard },
  ];
}

/** The signed-in reader's own profile; without ladders.mine, or when their ladders cannot be read, the postcard alone. */
export async function OwnProfile({ person, postcard, tab }: { person: ProfilePerson; postcard: ReactNode; tab?: string }) {
  const access = await getAccess();
  if (!access?.personId || !access.may("ladders.mine", { person: access.personId })) return <>{postcard}</>;
  let standing: Standing;
  try {
    standing = await myStanding({ personId: access.personId });
  } catch (err) {
    // A failed read says so: drawing Iron and zero would be a wrong answer
    // about the reader, and failing the whole profile, postcard and all, over
    // the ladders is worse.
    if (!(err instanceof ReadFailure)) throw err;
    console.error("[ladders] own profile:", err.message);
    return (
      <>
        <section className="pe-card" role="status">
          <p className="pe-sub">Your ladders could not be read just now. Reload the page to try again.</p>
        </section>
        {postcard}
      </>
    );
  }
  const editor: Editor = { may: mayProp(access, ["ladders.mine"], { person: access.personId }), actions: { setDisplay, setGameStyle } };
  return <OwnProfileView personId={access.personId} person={person} standing={standing} editor={editor} postcard={postcard} tab={tab} />;
}

/** The owner's page drawn from their standing already read; the reads and the guard are OwnProfile's. */
export function OwnProfileView({ personId, person, standing, editor, postcard, tab }: { personId: string; person: ProfilePerson; standing: Standing; editor: Editor; postcard: ReactNode; tab?: string }) {
  const dress = dressOwn(person, standing);
  return <Dressed dress={dress} editor={editor} tabs={ownTabs(standing, dress, personId, postcard)} tab={tab} />;
}

/**
 * A teammate's profile, read-only: what they chose to show, in the viewer's
 * game style, and their postcard. When their choices cannot be read, the
 * postcard alone, which shows no more than a person who hid everything.
 */
export async function TeammateProfile({ personId, person, postcard, tab }: { personId: string; person: ProfilePerson; postcard: ReactNode; tab?: string }) {
  const viewer = await getAccess();
  let worn: WornProfile;
  let gameOn: boolean;
  try {
    [worn, gameOn] = await Promise.all([wornTiers([personId], { profile: true }), viewer?.personId ? gameStyleOf({ personId: viewer.personId }) : Promise.resolve(true)]);
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error("[ladders] teammate profile:", err.message);
    return <>{postcard}</>;
  }
  return <TeammateProfileView person={person} worn={worn} gameOn={gameOn} postcard={postcard} tab={tab} />;
}

/** A teammate's page drawn from wornTiers' profile answer and the viewer's game style, already read. */
export function TeammateProfileView({ person, worn, gameOn, postcard, tab }: { person: ProfilePerson; worn: WornProfile; gameOn: boolean; postcard: ReactNode; tab?: string }) {
  const dress = dressTeammate(person, worn, gameOn);
  const tabs: TabDef[] = [
    { key: "overview", label: "Overview", content: <CaseFull badges={dress.displayCase} empty="Nothing in the display case yet." /> },
    { key: "postcard", label: "Postcard", content: postcard },
  ];
  return <Dressed dress={dress} editor={null} tabs={tabs} tab={tab} />;
}

/** The dressedProfile page slot, as ladders provides it. */
export const dressedProfile: NonNullable<DressedProfileSlot> = { Own: OwnProfile, Teammate: TeammateProfile };
