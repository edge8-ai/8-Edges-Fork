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
    "routes/admin/(dashboard)/settings/legal-entities/registration-actions": "org.legal-registration",
    "routes/admin/(dashboard)/talent/team/actions": "org.people",
  },
  implies: {},
};
