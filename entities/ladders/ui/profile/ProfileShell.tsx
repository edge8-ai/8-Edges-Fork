"use client";

// The owner's profile page as a whole (LD.10): the game screen with its five
// tabs while their game style is on, and the postcard view while it is off.
// Khoa, 28 Oct 2026: "the none game view is the Post Card view". The postcard
// view is Your profile with two tabs, Postcard and My details, and the game
// style switch in its header so turning the game back on is one click.
//
// The shell holds the switch because the switch changes the whole page, not
// the hero. It flips at once; once the choice is saved the page is drawn again
// on the server, which fills the tabs the postcard view never read (the quest
// log and the achievements) instead of reading them for a page that hides them.
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GameStyleSwitch } from "@/entities/quests/client";
import { Tabs, type TabDef } from "@/kernel/ui/Tabs";
import { ProfileHero, type Editor } from "./ProfileHero";
import type { ProfileDress } from "./profile-model";

/** The owner's tabs, each already drawn on the server; `log` and `achievements` are absent when the page opened in the postcard view. */
export type OwnTabs = { overview: ReactNode; log: ReactNode | null; achievements: ReactNode | null; postcard: ReactNode; details: ReactNode };

const reading = (what: string) => <p className="pf-ph">Reading your {what}…</p>;

/** The postcard view: Your profile, the Postcard and My details tabs, and the game style switch when the reader may keep one. */
export function PostcardView({ postcard, details, tab, styleSwitch }: { postcard: ReactNode; details: ReactNode; tab?: string; styleSwitch?: ReactNode }) {
  return (
    <div className="pf-plain">
      <div className="pf-plain-head">
        <div>
          <p className="admin-eyebrow">Me</p>
          <h1 className="pe-title">Your profile</h1>
        </div>
        {styleSwitch ? <div className="pf-plain-switch">{styleSwitch}</div> : null}
      </div>
      <div className="pf-plain-tabs">
        <Tabs
          tabs={[
            { key: "postcard", label: "Postcard", content: postcard },
            { key: "details", label: "My details", content: details },
          ]}
          initialKey={tab}
          syncParam="tab"
        />
      </div>
    </div>
  );
}

export function OwnProfileShell({ dress, editor, tabs, tab }: { dress: ProfileDress; editor: Editor; tabs: OwnTabs; tab?: string }) {
  const router = useRouter();
  const [gameOn, setGameOn] = useState(dress.gameOn);
  const setGameStyle = async (on: boolean) => {
    const saved = await editor.actions.setGameStyle(on);
    if (saved.ok) router.refresh();
    return saved;
  };
  const styleSwitch = <GameStyleSwitch on={gameOn} onChange={setGameOn} setGameStyle={setGameStyle} />;
  if (!gameOn) return <PostcardView postcard={tabs.postcard} details={tabs.details} tab={tab} styleSwitch={styleSwitch} />;
  return (
    <div className="pf pf--own">
      <ProfileHero dress={{ ...dress, gameOn }} editor={editor} styleSwitch={styleSwitch} />
      <div className="pf-tabs">
        <Tabs
          tabs={[
            { key: "overview", label: "Overview", content: tabs.overview },
            { key: "log", label: "Quest log", content: tabs.log ?? reading("quest log") },
            { key: "achievements", label: "Achievements", content: tabs.achievements ?? reading("badge case") },
            { key: "postcard", label: "Postcard", content: tabs.postcard },
            { key: "details", label: "My details", content: tabs.details },
          ]}
          initialKey={tab}
          syncParam="tab"
        />
      </div>
    </div>
  );
}

/** A teammate's page, read-only: the game screen and two tabs. The viewer's game style is on, or the page would be their postcard alone. */
export function TeammateProfileShell({ dress, tabs, tab }: { dress: ProfileDress; tabs: TabDef[]; tab?: string }) {
  return (
    <div className="pf">
      <ProfileHero dress={dress} editor={null} />
      <div className="pf-tabs">
        <Tabs tabs={tabs} initialKey={tab} syncParam="tab" />
      </div>
    </div>
  );
}
