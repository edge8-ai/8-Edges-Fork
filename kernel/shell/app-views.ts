import type { NavIconName } from "./nav-icons";

// The apps the account menu switches between (./AccountControl, TH.29): Team,
// Admin and the Client Hub, in that order in every one of them, so an app never
// moves under the pointer. The app rail that listed them as tiles (TH.28) made
// a switch most people never use the loudest thing in the sidebar, so it moved
// behind the face at the sidebar's foot, where Dave's reference puts it.
//
// An app you may not enter is left out: a member sees Team alone, a client the
// Client Hub alone, and a menu offering one app draws no Switch app at all.

export type AppKey = "team" | "admin" | "client";

export type AppView = { key: AppKey; label: string; href: string; icon: NavIconName; current: boolean };

/**
 * What this person may enter from here. The Client Hub carries its address
 * rather than a yes: for staff it is the list of clients to pick one from,
 * which the layout names (the kernel may not), and null leaves it out.
 */
export type AppAccess = { team?: boolean; admin?: boolean; client?: string | null };

const APPS: readonly Omit<AppView, "current">[] = [
  { key: "team", label: "Team", href: "/team", icon: "people" },
  { key: "admin", label: "Admin", href: "/admin", icon: "shield" },
  { key: "client", label: "Client Hub", href: "/portal", icon: "briefcase" },
];

/** The apps to show from inside `here`: that one, and each other this person may enter. */
export function appViews(here: AppKey, may: AppAccess): AppView[] {
  return APPS.flatMap((a): AppView[] => {
    if (a.key === here) return [{ ...a, current: true }];
    if (a.key === "client") return may.client ? [{ ...a, href: may.client, current: false }] : [];
    return may[a.key] ? [{ ...a, current: false }] : [];
  });
}
