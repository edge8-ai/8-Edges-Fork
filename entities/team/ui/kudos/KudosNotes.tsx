// A month's kudos as notes (TH.1.8): the giver's face over the receiver's, the
// thanks in the giver's words, and who to whom. Newest first, in the order the
// reader returns; never grouped or counted by person (see lib/kudos.ts).
import { HomeFace, toneFor } from "@/entities/team/ui/home/HomeFace";
import type { KudosNote } from "@/entities/team/lib/kudos";
import { kudosDay, noteTone } from "@/entities/team/lib/kudos-rules";
import { KudosTakeDown } from "./KudosTakeDown";
import type { MayProp } from "@/kernel/identity/may-prop";

export function KudosNotes({
  notes,
  viewerPersonId,
  currentMonth,
  may,
}: {
  notes: KudosNote[];
  viewerPersonId: string;
  currentMonth: string;
  may: MayProp;
}) {
  return (
    <ul className="th-kd-notes">
      {notes.map((n, i) => {
        const mine = n.from.personId === viewerPersonId;
        const forMe = n.to.personId === viewerPersonId;
        return (
          <li key={n.id} className={`th-kd-note tone-${noteTone(i)}`}>
            <span className="th-kd-pair" aria-hidden="true">
              <HomeFace name={n.from.name} avatarUrl={n.from.avatarUrl} tone={toneFor(n.from.personId)} />
              <HomeFace name={n.to.name} avatarUrl={n.to.avatarUrl} tone={toneFor(n.to.personId)} />
            </span>
            <div className="u-min-0">
              <p className="th-kd-body">{n.body}</p>
              <p className="th-kd-meta">
                {mine ? "You" : n.from.name} to {forMe ? "you" : n.to.name} · {kudosDay(n.givenOn, currentMonth)}
                {mine && <KudosTakeDown id={n.id} may={may} />}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
