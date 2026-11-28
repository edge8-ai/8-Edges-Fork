// The contracts of the slots the Team and Portal shells take from entities
// (ADR 0025). The shells live in the kernel and name no entity, so what they
// need of one (the control that ends an assume view, what a client bought, the
// client's programs) is declared by its provider in that entity's slots.ts and
// reaches the hand-written layout through app/shell.ts (ADR 0026). The types
// sit here because the kernel components that receive them must compile without
// any provider.
import type { PortalActor } from "@/kernel/identity/portal-auth";

/** Ends the signed-in admin's team assume sessions; the caller then loads Settings → Assume. */
export type EndTeamAssume = () => Promise<{ ok: boolean; error?: string }>;
/** The Team banner's Exit control; none when no installed entity offers assume. */
export type EndTeamAssumeSlot = EndTeamAssume | null;

/** Which of the portal's rows this client is entitled to, by the key a row's `when` names. */
export type PortalEntitlementsSlot = (actor: PortalActor) => Promise<Record<string, boolean>>;
/** The client's live programs, one sidebar link each. */
export type PortalProgramNamesSlot = (actor: PortalActor) => Promise<{ id: string; name: string }[]>;
/** Ends the admin's portal assume session, from the banner and the account menu. */
export type EndPortalAssumeSlot = (() => Promise<void>) | null;
