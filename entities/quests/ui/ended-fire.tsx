"use client";

// A fire whose session is over and whose register has no mark yet (QS.5c, the
// approved artboard "QS.5b Host way back", row 1). Only its Host, who organises
// the session, is ever handed one: the fire's points land once the register
// shows someone other than the Host came, and the session page is the Host's
// only way back to mark it, so the card stays in Burning, dashed, with Mark
// who came, until the register carries a word. Nobody else sees it there.
import Link from "next/link";
import { useActPoints } from "./act-points";
import { FireArt } from "./art";
import { CalendarLeaf } from "./plain-leads";
import type { CampfireWords } from "./campfire-words";
import { fireDayAndHour, fireTime, type EndedFire as EndedFireValue } from "../lib/campfires-model";

export function EndedFire({ fire, words }: { fire: EndedFireValue; words: CampfireWords }) {
  // The Host's 100 is the ladders' figure, read through the page slot (QS.13); null without ladders.
  const firePoints = useActPoints()?.fire ?? null;
  const endedHour = fireDayAndHour(fire.endedAt).hour.replace(/ Saigon$/, "");
  const when = fireDayAndHour(fire.startsAt);
  return (
    <li className={`qn-fire qn-fire--mine qn-fire--ended${words.art ? "" : " qn-fire--plain"}`} data-fire={fire.questId}
      // Your next move scrolls here and focuses it (QS.13), as it does for a fire its reader hosts.
      data-move={`host-${fire.questId}`} tabIndex={-1}>
      {words.art ? (
        <div className="qn-fire-art">
          <FireArt burning={false} />
        </div>
      ) : (
        <CalendarLeaf startsAt={fire.startsAt} />
      )}
      <div className="qn-fire-body">
        <div className="qn-fire-kind">{words.endedKind}</div>
        <h3 className="qn-fire-title">{fire.title}</h3>
        <div className="qn-fire-meta">
          {words.art ? (
            <span>{fireTime(fire.startsAt)}</span>
          ) : (
            // Plainly the calendar leaf shows the day, so the line says the hour, and the day to a screen reader, as a burning card does.
            <span>
              <span className="qn-sr">{when.day} · </span>
              {when.hour}
            </span>
          )}
          <span>ended {endedHour}</span>
          <span>{words.endedSeats(fire.seats)}</span>
        </div>
        <p className="qn-said">
          <b>You host</b> · {words.hostLine(firePoints)}
        </p>
        <div className="qs-moves">
          <Link className="admin-btn admin-btn--primary" href={fire.sessionHref}>
            {words.markWho}
          </Link>
        </div>
      </div>
    </li>
  );
}
