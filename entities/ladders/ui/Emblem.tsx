// The emblems a page draws (LD.3): a helm or a medal by tier, and a border that
// makes room for itself round a face. They name a tier and nothing else; the
// art comes from ./emblems/ (Edge8's upstream, the fork's plain set there), and
// each draws only its own art, so a page loads exactly what it shows.
//
// What a component is given is what shows. A medal's star arc is for its owner
// alone (spec "The two ladders"), so only the owner's own view passes `stars`;
// a worn tier is the word alone and never a star. Whether anything is drawn at
// all is the caller's call too: nothing when the viewer's game style is off.
import type { CSSProperties, ReactNode } from "react";
import { FRAME_AIR } from "@/kernel/ui/Avatar";
import { tierName, type BuilderTier, type LearnShareTier } from "../lib/points";
import { HELM_BOX, type ImmortalBand, type StarCount } from "./emblem-contract";
import { BORDER_GEOMETRY, BorderArt, HelmArt, MedalArt, StarsArt } from "./emblems";

type EmblemProps = { size: number; label?: string } & (
  | { ladder: "learn_share"; tier: LearnShareTier }
  | {
      ladder: "builder";
      tier: BuilderTier;
      /** The owner's own view only: the medal's star arc, one to five. */
      stars?: StarCount | null;
      /** Immortal's medal: the first, second or third. */
      band?: ImmortalBand | null;
    }
);

const round = (n: number): number => Math.round(n * 100) / 100;

/** A tier's emblem, `size` pixels wide: a Learn & Share helm or a Builder medal. */
export function Emblem(props: EmblemProps) {
  const label = props.label ?? tierName(props.tier);
  if (props.ladder === "learn_share") {
    return (
      <span className="ladder-emblem" role="img" aria-label={label}>
        <HelmArt tier={props.tier} width={props.size} height={round((props.size * HELM_BOX.height) / HELM_BOX.width)} />
      </span>
    );
  }
  const stars = props.stars && props.tier !== "immortal" ? props.stars : null;
  return (
    <span className="ladder-emblem" role="img" aria-label={label}>
      <MedalArt tier={props.tier} band={props.band ?? null} size={props.size} />
      {stars ? (
        <span className="ladder-emblem-stars">
          <StarsArt stars={stars} size={props.size} />
        </span>
      ) : null}
    </span>
  );
}

// A border's hole, in the units borderBox's viewBox is drawn in.
const HOLE = 100;

/**
 * The box a border needs round a face of `size` pixels, and where the face's
 * centre sits in it. The hole clears the face by the kernel's FRAME_AIR, the
 * same air the Avatar's own frame keeps, so the two draw a border identically.
 */
export function borderBox(tier: LearnShareTier, size: number) {
  const g = BORDER_GEOMETRY[tier];
  const unit = HOLE / g.r; // the art's pixels to the hole's units
  const px = ((size / 2) * FRAME_AIR) / HOLE; // the hole's units to the page's pixels
  return {
    width: round(g.width * unit * px),
    height: round(g.height * unit * px),
    faceX: round(g.cx * unit * px),
    faceY: round(g.cy * unit * px),
    viewBox: `${round(-g.cx * unit)} ${round(-g.cy * unit)} ${round(g.width * unit)} ${round(g.height * unit)}`,
  };
}

/**
 * A worn border with its full extent as its box, for a layout with room (the
 * profile plaque): the face (`children`, drawn at `size` with no border of its
 * own) sits in the hole, and the frame is drawn above it. Where a row has no
 * room, give the Avatar its `border` instead, which keeps the face's box.
 */
export function Border({ tier, size, children }: { tier: LearnShareTier; size: number; children?: ReactNode }) {
  const box = borderBox(tier, size);
  // The box and the hole are measured from the tier's art and the face's size;
  // .ladder-border in app/admin/admin.css lays them out.
  const measured = {
    "--ladder-border-w": `${box.width}px`,
    "--ladder-border-h": `${box.height}px`,
    "--ladder-face-x": `${round(box.faceX - size / 2)}px`,
    "--ladder-face-y": `${round(box.faceY - size / 2)}px`,
    "--ladder-face-size": `${size}px`,
  } as CSSProperties;
  return (
    <span className="ladder-border" style={measured}>
      {children ? <span className="ladder-border-face">{children}</span> : null}
      <span className="ladder-border-frame" aria-hidden>
        <BorderArt tier={tier} width={box.width} height={box.height} />
      </span>
    </span>
  );
}
