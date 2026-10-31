// The shared face (LD.3; spec "Faces and borders"): a person's photo or their
// initials, at a size, under an accessible name, and optionally a frame round it.
// Quests' Face and the board's FaceAvatar wrap it, and pass their own classes, so
// a face drawn with no frame renders exactly the element they drew before.
//
// The frame is a key, never a picture the kernel knows. A frame is a span with
// the class `${FRAME_CLASS_PREFIX}<key>` over the face; whatever stylesheet
// defines that class places and paints it (an entity that owns frames ships
// one). Where no such stylesheet is loaded, a key draws nothing.
//
// One composition rule, everywhere a frame is worn: the face keeps its size and
// is the hole; the frame is drawn around it and above it, with a hair of air
// (FRAME_AIR: the frame's hole over the face's radius) between the face's edge
// and the frame's inner ring; nothing else may overlap it. The face's box does
// not grow, so a row of faces keeps its rhythm and the frame overflows the box.
// A layout with room for the frame's full extent makes that room itself.
//
// The game style rule (Khoa, 2026-10-21): the viewer's switch governs every
// frame. Avatar never decides whether one shows. The caller passes `border`
// already decided, and passes null when the viewer's game style is off, when the
// person wears nothing, and anywhere off the team surface (LD.4 wires this).
import type { CSSProperties } from "react";

/** A frame's class is this prefix and its key: `frame-gold`. */
export const FRAME_CLASS_PREFIX = "frame-";

/**
 * The frame's hole over the face's radius: the inner ring clears the face by
 * this much (the approved prototype's 30.4 / 30, a hair at every size).
 */
export const FRAME_AIR = 30.4 / 30;

export type AvatarProps = {
  /** The person's name: the face's accessible name and its tooltip. */
  name: string;
  /** Shown when there is no photo. */
  initials: string;
  photoUrl?: string | null;
  /**
   * The face's diameter in pixels. Leave it out when `className` sizes the face
   * (Quests' qs-av, the board's wb-face-avatar).
   */
  size?: number;
  /**
   * The frame's key (a worn Learn & Share tier, "gold"), or null for a bare
   * face. The caller decides: null when the viewer's game style is off,
   * whatever the person wears.
   */
  border?: string | null;
  /**
   * The face is decoration and whoever draws it says the name in words (a
   * button's accessible name, screen-reader text): hidden from assistive
   * technology, with no tooltip.
   */
  decorative?: boolean;
  className?: string;
};

export function Avatar({ name, initials, photoUrl = null, size, border = null, decorative = false, className }: AvatarProps) {
  const cls = [className, size ? "admin-face" : "", border ? "admin-face--framed" : ""].filter(Boolean).join(" ") || undefined;
  // layout-ok: the face's diameter comes from the caller's props.
  const style = size ? ({ "--admin-face-size": `${size}px` } as CSSProperties) : undefined;
  const face = photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- an uploaded portrait of unknown size; next/image needs fixed dimensions
    <img className="admin-face-photo" src={photoUrl} alt="" />
  ) : (
    initials
  );
  const frame = border ? <span className={`admin-face-frame ${FRAME_CLASS_PREFIX}${border}`} aria-hidden /> : null;
  if (decorative) {
    return (
      <span className={cls} style={style} aria-hidden>
        {face}
        {frame}
      </span>
    );
  }
  return (
    <span className={cls} style={style} title={name} aria-label={name} role="img">
      {face}
      {frame}
    </span>
  );
}
