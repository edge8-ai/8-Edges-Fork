// Static rate-card data for the "Build Your Team" request flow.
// Pure data, safe to import from both the server action and the client form.

export type HirePositionId = "ai_engineer" | "ai_officer" | "data_engineer";
export type HireBracketId = "1-3" | "3-5" | "5+";

export type HireBracket = {
  id: HireBracketId;
  label: string;
  minUsd: number;
  maxUsd: number;
};

export type HirePosition = {
  id: HirePositionId;
  label: string;
  brackets: HireBracket[];
};

export const HIRE_POSITIONS: HirePosition[] = [
  {
    id: "ai_engineer",
    label: "AI Engineer",
    brackets: [
      { id: "1-3", label: "1-3 years", minUsd: 3000, maxUsd: 4000 },
      { id: "3-5", label: "3-5 years", minUsd: 4000, maxUsd: 6000 },
      { id: "5+", label: "5+ years", minUsd: 6000, maxUsd: 8000 },
    ],
  },
  {
    id: "ai_officer",
    label: "AI Officer",
    brackets: [
      { id: "1-3", label: "1-3 years", minUsd: 2500, maxUsd: 4000 },
      { id: "3-5", label: "3-5 years", minUsd: 4000, maxUsd: 5000 },
      { id: "5+", label: "5+ years", minUsd: 5000, maxUsd: 8000 },
    ],
  },
  {
    id: "data_engineer",
    label: "Data Engineer",
    brackets: [
      { id: "1-3", label: "1-3 years", minUsd: 3000, maxUsd: 4000 },
      { id: "3-5", label: "3-5 years", minUsd: 4000, maxUsd: 5000 },
      { id: "5+", label: "5+ years", minUsd: 5000, maxUsd: 8000 },
    ],
  },
];

// Order a full team and the whole order gets a discount.
export const TEAM_DISCOUNT_MIN = 3;
export const TEAM_DISCOUNT_RATE = 0.1;

export function findBracket(
  positionId: string,
  bracketId: string,
): { position: HirePosition; bracket: HireBracket } | null {
  const position = HIRE_POSITIONS.find((p) => p.id === positionId);
  const bracket = position?.brackets.find((b) => b.id === bracketId);
  if (!position || !bracket) return null;
  return { position, bracket };
}

// Tech stack the client can request, grouped into columns on the form.
export type HireTechGroup = { label: string; options: string[] };

export const HIRE_TECH_GROUPS: HireTechGroup[] = [
  {
    label: "Database",
    options: ["PostgreSQL", "pgvector", "Pinecone / Weaviate", "Redis", "MongoDB", "Snowflake / BigQuery"],
  },
  {
    label: "Front End",
    options: ["React", "Next.js", "TypeScript", "Tailwind CSS", "Vercel AI SDK", "React Native"],
  },
  {
    label: "Back End",
    options: ["Python / FastAPI", "Node.js / TypeScript", "LangChain / LlamaIndex", "RAG pipelines", "MCP / agent tooling", "Go"],
  },
  {
    label: "Preferred LLMs",
    options: ["OpenAI (GPT)", "Anthropic (Claude)", "Google (Gemini)", "Meta (Llama)", "Mistral", "Open-source / self-hosted"],
  },
  {
    label: "Cloud",
    options: ["AWS", "Google Cloud (GCP)", "Azure", "Vercel", "Cloudflare", "Modal / Replicate"],
  },
];

export const HIRE_TECH_STACK = HIRE_TECH_GROUPS.flatMap((g) => g.options);

export const HIRE_TERMS = [
  "1-year contract.",
  "1-month deposit due at signing.",
  "Cancel any time in the first 2 months at no charge.",
  "After 2 months, cancelling forfeits the 1-month deposit.",
  "Performance-related termination: 3 documented incidents, and we'll find a replacement within 30 days.",
  "Build a team of 3 or more and the whole order gets 10% off.",
];
