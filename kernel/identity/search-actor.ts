// Who is searching, as the global search (S.1) hands it to each entity's
// searcher.
//
// The three surface guards answer with three unrelated shapes: an admin is an
// id and an email, a team member a whole TeamActor with its scope sets, a
// portal member a PortalActor with the companies the member belongs to. A
// flattened "common actor" would throw away exactly the facts a searcher needs
// to scope its rows the way its own screen does, so the union keeps each
// guard's answer whole and tags it with the surface it came from. Every variant
// also carries what the person may do (ADR 0013): runSearch asks it whether the
// person may open the page a contribution's hits open, and each hit's own page,
// so no searcher decides on its own who may see a section.
import type { AdminUser } from "./admin-auth";
import type { Access } from "./access-model";
import type { PortalActor } from "./portal-auth";
import type { TeamActor } from "./team-auth";

export type SearchSurface = "admin" | "team" | "portal";

type Permitted = { access: Pick<Access, "may"> };

export type SearchActor =
  | ({ surface: "admin"; admin: AdminUser } & Permitted)
  | ({ surface: "team"; team: TeamActor } & Permitted)
  | ({ surface: "portal"; portal: PortalActor } & Permitted);
