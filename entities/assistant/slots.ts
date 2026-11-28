// The slots assistant provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** @generator */
export const slots: SlotDeclarations = {
  // W.7: the admin layout used to import the chat pane directly, so a
  // deployment that left the assistant out still bundled it. It draws with
  // admin.css, which the admin layout loads.
  AdminAssistant: {
    kind: "component",
    type: "((props: { email: string | null | undefined }) => ReactElement) | null",
    styles: [],
    surfaces: ["admin"],
    why: "the admin shell's chat pane; nothing when the assistant is not installed",
  },
  // ADR 0025: the Team shell moved to the kernel, so the Team layout takes the
  // hub's chat widget the way the Admin layout takes its pane. While assuming
  // it is left out: the assistant answers as whoever is signed in.
  TeamChatWidget: {
    kind: "component",
    type: "(() => ReactElement) | null",
    styles: [],
    surfaces: ["team"],
    why: "the team shell's chat widget; nothing when the assistant is not installed",
  },
};
