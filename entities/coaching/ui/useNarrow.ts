"use client";

import { useEffect, useState } from "react";

// Whether the viewport is a phone, as a hook.
//
// It exists because of a specific collision, worth recording: under 640px the
// commitment card's move menu becomes a bottom sheet, and a bottom sheet has to
// leave the card entirely. The drag library transforms the card while it is
// being dragged, and a transformed ancestor makes `position: fixed` resolve
// against ITSELF rather than the viewport — so a sheet rendered inside the card
// would be pinned to a moving box. The sheet is portalled to the body instead,
// and this is how it knows when to be one (K.29).
//
// A media query rather than a width number, so it matches the CSS breakpoint
// exactly instead of tracking it approximately from JavaScript.
const NARROW = "(max-width: 640px)";

export function useNarrow(): boolean {
  // False on the server and on the first client render: matchMedia does not
  // exist there, and a card that renders its menu inline for one frame is
  // correct, where one that assumes "phone" would flash a sheet on a desktop.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}
