// Role families for the talent Rank page. Each family groups several job
// requisitions (tagged via job_requisitions.metadata.role_family) and carries
// an ideal profile that the family AI screen rates every applicant against —
// one shared yardstick, so scores are comparable across reqs.

export type RoleFamilyKey =
  | "ai_engineer"
  | "ai_instructor"
  | "product_manager"
  | "designer"
  | "marketing";

export type RoleFamily = {
  key: RoleFamilyKey;
  label: string;
  profile: string;
};

export const ROLE_FAMILIES: RoleFamily[] = [
  {
    key: "ai_engineer",
    label: "AI Engineer",
    profile: `Edge8's ideal AI Engineer ships production AI systems, not demos. They have real experience building LLM applications end-to-end: RAG pipelines, multi-agent systems, tool calling, prompt engineering, and evaluation. They are strong general software engineers first (Python or TypeScript, APIs, databases, cloud infrastructure) with AI depth on top. They have deployed AI systems that real users depend on, can reason about cost/latency/quality trade-offs, and use AI-native development tools (Claude Code, Copilot) fluently. Client-facing communication in fluent English is important — our engineers work directly with US and Australian clients. Differentiators: shipped products with paying users, experience with Anthropic/OpenAI APIs in production, MCP servers, vector search, and cloud platforms (AWS/Azure). Red flags: buzzword lists without shipped work, research-only backgrounds with no production systems.`,
  },
  {
    key: "ai_instructor",
    label: "AI Instructor",
    profile: `Edge8's ideal AI Instructor teaches professionals how to work AI-first. They combine genuine hands-on AI capability (daily use of ChatGPT/Claude/Gemini and AI workflow tools, prompt design, building small automations) with real teaching craft: curriculum design, running workshops, coaching non-technical adults, and assessing learner progress against practical challenges. They can demystify AI for business audiences, design challenge-based learning (Edge8 certifies by proof of work, never attendance), and hold a room in fluent English. Differentiators: experience training corporate teams, course development from scratch, producing teaching materials and video content, and measurable learner outcomes. Red flags: pure classroom teachers with no real AI practice, or engineers with no evidence they can teach.`,
  },
  {
    key: "product_manager",
    label: "Product Manager",
    profile: `Edge8's ideal Product Manager owns outcomes, not tickets. They have shipped software products end-to-end: discovery, spec writing, prioritization, working with engineers and designers, launch, and iteration on real usage data. They write crisp functional requirements, map business workflows to software, and communicate directly with stakeholders and clients in fluent English. Experience in agile delivery (Scrum/Kanban) matters less than judgment: knowing what to build, cutting scope, and measuring impact. Differentiators: startup or high-growth environment experience, technical fluency (can read data, write SQL, use AI tools daily), B2B SaaS exposure, and evidence of products that reached paying customers. Red flags: process-heavy backgrounds with no shipped outcomes, project coordinators relabelled as PMs.`,
  },
  {
    key: "designer",
    label: "Designer",
    profile: `Edge8's ideal Designer designs working product, not just pictures. They are strong in UI/UX for web applications: information architecture, interaction design, responsive layouts, design systems, and accessibility. They prototype fast (Figma), collaborate tightly with engineers, and increasingly use AI tools in their workflow (image generation, AI-assisted prototyping). A portfolio with shipped product work is essential. Visual craft across brand, web, and instructional/content design is a plus — Edge8's designers also produce course materials and marketing assets. Fluent English for client work is important. Differentiators: end-to-end product design ownership, design-to-code sensibility (HTML/CSS awareness), motion/video capability. Red flags: portfolios of concepts never shipped, print-only backgrounds.`,
  },
  {
    key: "marketing",
    label: "Marketing Professional",
    profile: `Edge8's ideal Marketing Professional runs AI-first, full-funnel marketing with small-team ownership. They have hands-on experience across content creation, social media management (LinkedIn, Facebook, TikTok, Instagram), email marketing, and campaign analytics — and they use AI tools (ChatGPT, Claude, Canva AI) daily to multiply output. They write well in fluent English, can own a content calendar end-to-end, and measure what works (GA4, Meta analytics, CRM reporting). Video content creation and editing is a strong plus. Differentiators: B2B experience, HubSpot or similar CRM fluency, demonstrated growth outcomes (followers, leads, conversions with numbers), design sensibility. Red flags: single-channel specialists who cannot operate independently, agencies-of-record experience with no personal ownership.`,
  },
];

export const FAMILY_BY_KEY: Record<string, RoleFamily> = Object.fromEntries(
  ROLE_FAMILIES.map((f) => [f.key, f]),
);

// Shape stored at applications.metadata.family_screen by lib/family-screen.ts.
// Kept in metadata (not the ai_* columns) so per-req screens are untouched.
export type FamilyScreen = {
  family: RoleFamilyKey;
  rating: number; // 0-5, one decimal, against the family profile above
  overview: string;
  strengths: string[];
  gaps: string[];
  screened_at: string;
  model: string;
};
