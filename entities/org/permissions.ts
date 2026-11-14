// What the org entity offers on the Admin view: the company's own information, people operations and the team (ADR 0013).
// Read as text by scripts/gen-deployment.mjs; nothing imports this file. Every
// atom is held by whoever reaches its pages today, so declaring it changes
// nothing until the guard swap.
import type { EntityPermissions } from "@/kernel/identity/permission-declaration";

/** @generator */
export const permissions: EntityPermissions = {
  permissions: {
    "org.company": "Edit the company's information: goals, onboarding deck, org chart, strategy and values",
    "org.legal-entities": "Add legal entities and change their name, legal name, country, type, currency and active flag",
    "org.legal-registration": "Keep the legal entities' registration details current: tax number, business registration number, registered address, legal representative, jurisdiction, date of incorporation",
    "org.operations": "Run people operations: capacity, equipment and surveys",
    "org.people": "See and manage the team's members and their probation",
    // Performance reviews and the kudos wall moved here from team with their
    // tables (ADR 0025); their atoms took this entity's name with A.89.
    "org.reviews": "Run performance reviews across the team",
    "org.performance": "See performance reviews: your own, and your reports' when you manage",
    "org.kudos": "See the kudos wall and give kudos",
  },
  holders: {
    "org.company": "admin",
    "org.legal-entities": "super-admin",
    // The Accountant keeps the registration details current, as Vietnamese law
    // asks (Khoa, 2026-10-08); adding an entity or changing its name stays
    // org.legal-entities, the Super Admin's.
    "org.legal-registration": "super-admin, finance, accountant",
    "org.operations": "admin",
    "org.people": "admin",
    "org.reviews": "admin",
    "org.performance": "team-member:own, contractor:own, manager:team",
    "org.kudos": "team-member, contractor",
  },
  routes: {
    "routes/admin/(dashboard)/company/goals/page": "org.company",
    "routes/admin/(dashboard)/company/onboarding-deck/page": "org.company",
    "routes/admin/(dashboard)/company/org/page": "org.company",
    "routes/admin/(dashboard)/company/strategy/page": "org.company",
    "routes/admin/(dashboard)/company/values/page": "org.company",
    "routes/admin/(dashboard)/operations/capacity/page": "org.operations",
    "routes/admin/(dashboard)/operations/equipment/page": "org.operations",
    "routes/admin/(dashboard)/operations/equipment/new/page": "org.operations",
    "routes/admin/(dashboard)/operations/equipment/fitness/page": "org.operations",
    "routes/admin/(dashboard)/operations/surveys/page": "org.operations",
    "routes/admin/(dashboard)/operations/surveys/[id]/page": "org.operations",
    "routes/admin/(dashboard)/operations/surveys/[id]/results/page": "org.operations",
    "routes/admin/(dashboard)/settings/legal-entities/page": "org.legal-registration",
    "routes/admin/(dashboard)/talent/team/page": "org.people",
    "routes/admin/(dashboard)/talent/team/[id]/page": "org.people",
    "routes/admin/(dashboard)/talent/probation/page": "org.people",
    // Performance reviews and the kudos wall, moved here from team with their
    // tables (ADR 0025).
    "routes/admin/(dashboard)/talent/reviews/page": "org.reviews",
    // Client review cycles and one cycle's overview (CR.2.3).
    "routes/admin/(dashboard)/talent/reviews/clients/page": "org.reviews",
    "routes/admin/(dashboard)/talent/reviews/clients/[cycleId]/page": "org.reviews",
    // One member's client review, the HR summary and the release (CR.3.3).
    "routes/admin/(dashboard)/talent/reviews/clients/[cycleId]/[teamMemberId]/page": "org.reviews",
    // Opening a client review cycle from the app (CR.2.5).
    "routes/admin/(dashboard)/talent/reviews/clients/new/page": "org.reviews",
    "routes/team/(dashboard)/reviews/page": "org.performance",
    "routes/team/(dashboard)/reviews/[id]/page": "org.performance",
    "routes/team/(dashboard)/kudos/page": "org.kudos",
  },
  actions: {
    "lib/capacity-actions": "org.operations",
    "routes/admin/(dashboard)/company/actions": "org.company",
    "routes/admin/(dashboard)/company/org/actions": "org.people",
    "routes/admin/(dashboard)/company/values/actions": "org.company",
    "routes/admin/(dashboard)/edges/goals/actions": "org.company",
    "routes/admin/(dashboard)/operations/equipment/actions": "org.operations",
    "routes/admin/(dashboard)/operations/surveys/actions": "org.operations",
    "routes/admin/(dashboard)/operations/surveys/assignment-actions": "org.operations",
    "routes/admin/(dashboard)/settings/legal-entities/company-actions": "org.legal-entities",
    "routes/admin/(dashboard)/settings/legal-entities/bank-actions": "org.legal-registration",
    "routes/admin/(dashboard)/settings/legal-entities/registration-actions": "org.legal-registration",
    "routes/admin/(dashboard)/talent/team/actions": "org.people",
    "routes/admin/(dashboard)/talent/reviews/actions": "org.reviews",
    "routes/admin/(dashboard)/talent/reviews/clients/[cycleId]/actions": "org.reviews",
    // The owner's actions on a client review cycle (CR.2.4).
    "routes/admin/(dashboard)/talent/reviews/clients/[cycleId]/owner-actions": "org.reviews",
    "routes/admin/(dashboard)/talent/reviews/clients/new/actions": "org.reviews",
    "routes/team/(dashboard)/reviews/actions": "surface.team",
    "lib/kudos-actions": "org.kudos",
  },
  implies: {},
};
