// Where a signed-in member's own profile lives. The account menu's View profile
// leads here from Team, and from Admin through the PROFILE_HREF shell slot
// (TH.29), so the Admin layout never names a page this entity owns and a
// deployment without Team offers no profile to view.
export const PROFILE_HREF = "/team/profile";
