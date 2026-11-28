import { z } from "zod";

// The shape of a saved audience's rules, safe to import from a client component:
// the audience editor renders these choices, and lib/audiences.ts (server-only)
// resolves them to people.

export const RELATIONSHIPS = ["team", "client", "prospect", "network"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  team: "Team",
  client: "Clients",
  prospect: "Prospects",
  network: "Network",
};

export const audienceRulesSchema = z.object({
  relationships: z.array(z.enum(RELATIONSHIPS)).default([]),
  companyIds: z.array(z.string().uuid()).default([]),
  tagIds: z.array(z.string().uuid()).default([]),
  excludeTagIds: z.array(z.string().uuid()).default([]),
});
export type AudienceRules = z.infer<typeof audienceRulesSchema>;

export type AudienceRow = { id: string; name: string; rules: AudienceRules; createdAt: string };
