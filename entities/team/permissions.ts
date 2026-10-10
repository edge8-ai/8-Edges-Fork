// What the team hub offers, and which of its Team pages need which (ADR 0013).
// Read as text by scripts/gen-deployment.mjs, which composes the registry in
// app/permissions.ts; nothing imports this file.
//
// The atoms are cut where a person might hold one without the other: a
// contractor who needs the Workboard need not see the directory, the company's
// own information or its benefits (AC.19 decides what the Contractor baseline
// keeps). Until then every atom is held by team members and contractors alike,
// which is exactly what every team login sees today.
//
// Pages that show the person's own records (the hub, profile, equipment) need
// only surface.team. The Workboard and boards pages stay on the baseline until
// they move into the boards entity, whose atoms they need; the client, hiring,
// review and probation pages are declared with their scoping in AC.7.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "team.directory": "See the team directory and the org chart",
    "team.company": "Read about the company: its goals and strategy",
    "team.culture": "Read about the company: its values, handbook, onboarding deck and gallery, and give kudos",
    "team.benefits": "See the team's health insurance cover",
    "team.vendors": "See the company's vendors and add one",
    "team.ideas": "See and share ideas",
    "team.company-manage": "Edit the handbook and the health insurance page",
    "team.reviews": "Run performance reviews across the team",
    "team.clients": "See the clients you are assigned to: their hub, board, documents, invoices, meetings, roadmap and team",
    "team.hiring": "See the hiring board: the requisitions you own, who is in flight and each role's loop",
    "team.interviews": "Open the interview kit for an interview you give",
    "team.performance": "See performance reviews and probation: your own, and your reports' when you manage",
  },
  holders: {
    // AC.19 kept who's who, the plans, the ideas feed and the vendors out of
    // the Contractor baseline, behind the Company role. AE.3 (Khoa,
    // 2026-10-08) puts the Company module back in the baseline, one atom at a
    // time: contractor is a holder on each Company page atom rather than being
    // handed the company role, so one page can leave the baseline later by
    // deleting one holder. The company role stays for anyone granted it.
    "team.directory": "team-member, contractor, company",
    "team.company": "team-member, contractor, company",
    "team.culture": "team-member, contractor",
    // Cover is an employment benefit a contract engagement does not carry.
    "team.benefits": "team-member",
    "team.vendors": "team-member, contractor, company",
    "team.ideas": "team-member, contractor, company",
    "team.company-manage": "admin",
    "team.reviews": "admin",
    // Someone assigned to a client, for those clients (AC.8): the Client team role.
    "team.clients": "client-team:clients",
    // The board redirects anyone who is not a hiring manager (or an admin) today.
    "team.hiring": "hiring-manager",
    // A panelist reaches their own interview kit by link.
    "team.interviews": "team-member:own, contractor:own",
    "team.performance": "team-member:own, contractor:own, manager:team",
  },
  routes: {
    "routes/team/(auth)/callback/page": "public",
    // It sits in (auth) but checks the session itself: only a signed-in member changes a password.
    "routes/team/(auth)/change-password/page": "surface.team",
    "routes/team/(auth)/login/page": "public",
    "routes/team/(auth)/verify/page": "public",
    "routes/team/(dashboard)/page": "surface.team",
    // The kernel's refusal page (AC.16): anyone on the surface may open it.
    "routes/team/(dashboard)/refused/page": "surface.team",
    "routes/team/(dashboard)/profile/page": "surface.team",
    "routes/team/(dashboard)/equipment/page": "surface.team",
    "routes/team/(dashboard)/directory/page": "team.directory",
    "routes/team/(dashboard)/directory/[id]/page": "team.directory",
    "routes/team/(dashboard)/org/page": "team.directory",
    "routes/team/(dashboard)/company-goals/page": "team.company",
    "routes/team/(dashboard)/strategy/page": "team.company",
    "routes/team/(dashboard)/values/page": "team.culture",
    "routes/team/(dashboard)/handbook/page": "team.culture",
    "routes/team/(dashboard)/gallery/page": "team.culture",
    "routes/team/(dashboard)/kudos/page": "team.culture",
    "routes/team/(dashboard)/onboarding-deck/page": "team.culture",
    "routes/team/(dashboard)/insurance/page": "team.benefits",
    "routes/team/(dashboard)/vendors/page": "team.vendors",
    "routes/team/(dashboard)/vendors/new/page": "team.vendors",
    "routes/team/(dashboard)/ideas/page": "team.ideas",
    "routes/team/(dashboard)/ideas/[id]/page": "team.ideas",
    "routes/admin/(dashboard)/company/handbook/page": "team.company-manage",
    "routes/admin/(dashboard)/company/insurance/page": "team.company-manage",
    "routes/admin/(dashboard)/talent/reviews/page": "team.reviews",
    // Relationship-scoped pages: open to every team login today, as each page filters its own rows; the reach is what AC.7's swap reads (AC.7).
    "routes/team/(dashboard)/clients/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/board/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/documents/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/invoices/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/meetings/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/meetings/[id]/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/roadmap/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/team/page": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/programs/[programId]/page": "team.clients",
    "routes/team/(dashboard)/hiring/page": "team.hiring",
    "routes/team/(dashboard)/hiring/[interviewId]/page": "team.interviews",
    "routes/team/(dashboard)/reviews/page": "team.performance",
    "routes/team/(dashboard)/reviews/[id]/page": "team.performance",
    "routes/team/(dashboard)/probation/[id]/page": "team.performance",
    "routes/team/(dashboard)/workboard/page": "surface.team",
    "routes/team/(dashboard)/sprint-planning/page": "surface.team",
    "routes/team/(dashboard)/boards/[slug]/page": "surface.team",
    "routes/team/(dashboard)/boards/[slug]/epics/page": "surface.team",
    "routes/team/(dashboard)/boards/[slug]/sprints/[sprintId]/page": "surface.team",
  },
  actions: {
    "lib/gallery-actions": "team.culture",
    "lib/kudos-actions": "team.culture",
    "lib/hub-hours-actions": "surface.team",
    "routes/admin/(dashboard)/talent/reviews/actions": "team.reviews",
    "routes/team/(dashboard)/actions": "surface.team",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/documents-actions": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/meetings/actions": "team.clients",
    "routes/team/(dashboard)/clients/[companyId]/(hub)/roadmap/actions": "team.clients",
    "routes/team/(dashboard)/equipment/actions": "surface.team",
    "routes/team/(dashboard)/hiring/kit-actions": "team.interviews",
    "routes/team/(dashboard)/hiring/manage-actions": "surface.team",
    "routes/team/(dashboard)/ideas/actions": "team.ideas",
    "routes/team/(dashboard)/probation/[id]/actions": "surface.team",
    "routes/team/(dashboard)/profile/actions": "surface.team",
    "routes/team/(dashboard)/reviews/actions": "surface.team",
    "routes/team/(dashboard)/vendors/actions": "team.vendors",
  },
  implies: {
    "client-team": "is assigned to at least one client",
  },
};
