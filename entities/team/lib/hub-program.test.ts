import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// X.1: an AI Program can own many repos — a product split into front end, back
// end and a prompt registry (AIO Labz), or a modular monolith with a repo per
// component. Before X.1 the rollup kept ONE repo per program (a Map keyed by
// program id, so the last repo won) and a three-repo program showed one
// repo's hours, tokens and PRs. What this pins is that every figure on a
// program card is the sum over all of its repos, and that a one-repo program
// reads exactly as it did.

// The htt client is the same scripted fake: the rollup's one query is htt.pull_requests.
vi.mock("@/kernel/data/supabase", () => ({ ...fakeSupabase(), htt: { from: (table: string) => builderFor(table) } }));
vi.mock("@/entities/boards", () => ({ selectTasks: vi.fn(), selectBoards: vi.fn() }));
vi.mock("@/entities/client-programs", () => ({
  BACKLOG_SELECT: "",
  ROADMAP_GROUPS_SELECT: "",
  selectClientRoadmapGroups: vi.fn(),
  selectClientBacklogItems: vi.fn(),
  selectAiPrograms: vi.fn(),
}));
vi.mock("@/entities/crm", () => ({ getMeetingsForCompany: vi.fn() }));
vi.mock("@/entities/portal", async () => {
  const tokens = await vi.importActual<typeof import("@/entities/portal/lib/hub-tokens")>("@/entities/portal/lib/hub-tokens");
  return { listDocumentsForCompanies: vi.fn(), fetchDeliveryRaw: vi.fn(), humanHoursOf: tokens.humanHoursOf, leverageOf: tokens.leverageOf };
});

const { listProgramSummaries, selectedProgramRepo } = await import("./hub-program");

beforeEach(() => resetFake());

const repo = (id: string, program: string | null, over: Partial<{ live_url: string | null; last_synced_at: string | null }> = {}) => ({
  id,
  name: id,
  github_repo: `acme/${id}`,
  ai_program_id: program,
  live_url: null,
  last_synced_at: "2026-09-26T23:00:00Z",
  ...over,
});

const inputs = {
  programs: [
    { id: "shop", name: "Shop", status: "active" as const },
    { id: "solo", name: "Solo", status: "active" as const },
  ],
  delivery: {
    repos: [
      repo("shop-web", "shop", { live_url: "https://shop.example" }),
      repo("shop-api", "shop", { last_synced_at: "2026-09-25T23:00:00Z" }),
      repo("shop-registry", "shop"),
      repo("solo-app", "solo"),
    ],
    programs: [
      { id: "shop", name: "Shop" },
      { id: "solo", name: "Solo" },
    ],
    hourRows: [
      { repo_id: "shop-web", hours: 2, measured_hours: 2 },
      { repo_id: "shop-api", hours: 3, measured_hours: 3 },
      { repo_id: "shop-registry", hours: 1, measured_hours: 1 },
      { repo_id: "solo-app", hours: 4, measured_hours: 4 },
    ],
    aiRows: [
      { repo_id: "shop-web", amount: 100_000 },
      { repo_id: "shop-api", amount: 200_000 },
      { repo_id: "solo-app", amount: 50_000 },
    ],
    additions: [],
  },
  backlogRows: [],
  boardRows: [],
};

describe("listProgramSummaries sums every repo a program owns (X.1)", () => {
  it("adds up hours, AI tokens and merged PRs across a program's repos", async () => {
    script("pull_requests", { data: [{ repo_id: "shop-web" }, { repo_id: "shop-api" }, { repo_id: "shop-api" }, { repo_id: "solo-app" }] });
    const [shop] = await listProgramSummaries("company-1", inputs);
    expect(shop).toMatchObject({ id: "shop", deliveredHours: 6, aiTokens: 300_000, prsMergedLast7d: 3 });
    expect(shop.repos.map((r) => r.githubRepo)).toEqual(["acme/shop-web", "acme/shop-api", "acme/shop-registry"]);
  });

  it("names the live site from whichever repo has one, and reports the program only as fresh as its stalest repo", async () => {
    script("pull_requests", { data: [] });
    const [shop] = await listProgramSummaries("company-1", inputs);
    expect(shop.liveUrl).toBe("https://shop.example");
    expect(shop.lastSyncedAt).toBe("2026-09-25T23:00:00Z");
  });

  it("prefers the product's own domain over a component's platform subdomain for the live site", async () => {
    script("pull_requests", { data: [] });
    const repos = [repo("api", "shop", { live_url: "https://shop-api.vercel.app" }), repo("web", "shop", { live_url: "https://shop.example" })];
    const [shop] = await listProgramSummaries("company-1", { ...inputs, programs: [inputs.programs[0]], delivery: { ...inputs.delivery, repos } });
    expect(shop.liveUrl).toBe("https://shop.example");
  });

  it("reads a one-repo program exactly as before", async () => {
    script("pull_requests", { data: [{ repo_id: "solo-app" }] });
    const [, solo] = await listProgramSummaries("company-1", inputs);
    expect(solo).toMatchObject({ id: "solo", deliveredHours: 4, aiTokens: 50_000, prsMergedLast7d: 1, liveUrl: null, lastSyncedAt: "2026-09-26T23:00:00Z" });
    expect(solo.repos.map((r) => r.id)).toEqual(["solo-app"]);
  });

  it("gives a program with no repo an empty list and zeros", async () => {
    script("pull_requests", { data: [{ repo_id: "shop-web" }] }); // the company's other repos still merged
    const [none] = await listProgramSummaries("company-1", { ...inputs, programs: [{ id: "new", name: "New", status: "active" }] });
    expect(none).toMatchObject({ repos: [], deliveredHours: 0, aiTokens: 0, prsMergedLast7d: 0, liveUrl: null, lastSyncedAt: null });
  });
});

describe("selectedProgramRepo (X.1)", () => {
  const repos = ["web", "api", "registry"].map((id) => ({ id, name: id, githubRepo: `acme/${id}`, liveUrl: null, lastSyncedAt: null }));

  it("shows the repo ?repo= names, and the first when none is named", () => {
    expect(selectedProgramRepo(repos, "api")?.id).toBe("api");
    expect(selectedProgramRepo(repos, undefined)?.id).toBe("web");
  });

  it("falls back to the first for a repo the program does not own, and to null with no repos", () => {
    expect(selectedProgramRepo(repos, "someone-elses")?.id).toBe("web");
    expect(selectedProgramRepo([], "api")).toBeNull();
  });
});
