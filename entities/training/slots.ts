// The slots training provides (ADR 0026): what Home shows of training, which
// Home must not require. The generator (scripts/gen-deployment.mjs) reads
// `slots` and writes app/shell.ts from it; nothing imports it.
import type { ReactNode } from "react";
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** What Home shows of the training entity (TR.1): the certification card and the way into My Training. */
export type HomeTrainingSlot = ((props: { personId: string; greeting: string | null }) => Promise<ReactNode>) | null;
/** The new hire's "Get certified" strip under Start here, when the deployment runs a programme. */
export type StartHereCertificationSlot = (() => ReactNode) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // TR.1: Home's certification card and the banner into My Training. They
  // draw with Home's own sheet, which Home's page loads.
  HomeTraining: {
    kind: "component",
    type: "HomeTrainingSlot",
    styles: [],
    surfaces: ["team"],
    why: "the certification card and the way into My Training on Home; nothing when training is not installed",
  },
  // TR.1: the new hire's Get certified strip under Start here, with the
  // programme it points at.
  StartHereCertification: {
    kind: "component",
    type: "StartHereCertificationSlot",
    styles: [],
    surfaces: ["team"],
    why: "the Get certified strip under Start here; nothing when training is not installed",
  },
};
