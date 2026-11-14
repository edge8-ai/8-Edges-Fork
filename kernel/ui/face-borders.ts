"use client";

// The worn borders a page hands its faces (LD.4, shared since LD.8; spec "Faces
// and borders"). A team page that draws faces asks the kernel's faces seam
// (kernel/shell/faces.ts) once for every person it draws, and provides each
// wearer's Learn & Share tier here, by person; every face below it reads its
// own. A person who wears nothing is not in it, and their face is plain. The
// seam already answers nothing when the viewer's game style is off.
//
// It lives in the kernel because Quests and the board both draw faces deep in
// a client tree and read the same answer the same way: one context, not one
// copy per entity. With no provider every face is plain, which is how the admin
// surface and the portal draw the very same components.
import { createContext, useContext } from "react";

/** Each wearer's Learn & Share tier by person id; a person not in it wears nothing. */
export type FaceBorders = Readonly<Record<string, string>>;

/** No border for anyone: the context's default, and the stable value a provider passes when it was handed none. */
export const NO_BORDERS: FaceBorders = {};

export const FaceBordersContext = createContext<FaceBorders>(NO_BORDERS);

/** The tier a person wears as a border on this page, or null for a plain face (and for nobody). */
export function useFaceBorder(personId: string | null): string | null {
  const borders = useContext(FaceBordersContext);
  return personId ? (borders[personId] ?? null) : null;
}
