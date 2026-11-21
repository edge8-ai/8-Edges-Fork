// One change note as a card (TR.8): the poster's face beside their words in a
// green bubble, and the day. The organiser's list and the learner's plan card
// both draw this one component, so the organiser sees exactly what the
// learners see. A note posted in the last week pops in with "New".
import { Avatar } from "@/kernel/ui/Avatar";
import { initials } from "@/kernel/ui/format";
import type { ChangeNote } from "../lib/change-notes";
import { dayLabel } from "./change-format";

export function ChangeCard({ note, who, isNew = false, onRemove }: { note: ChangeNote; who?: string; isNew?: boolean; onRemove?: () => void }) {
  return (
    <div className={`tr-cn-card${isNew ? " is-new" : ""}`}>
      {isNew && <span className="tr-cn-new">New</span>}
      <div className="tr-cn-changed">
        <Avatar name={note.postedBy} initials={initials(note.postedBy)} size={36} decorative />
        <div className="tr-cn-bubble">
          <span className="tr-cn-who">
            {who ?? note.postedBy} · {dayLabel(note.postedAt)}
          </span>
          {note.body}
        </div>
      </div>
      {onRemove && (
        <button type="button" className="tr-cn-remove" onClick={onRemove}>
          Remove
        </button>
      )}
    </div>
  );
}
