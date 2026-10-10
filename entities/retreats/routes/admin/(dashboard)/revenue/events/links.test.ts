import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.118.3. An event's bespoke landing page is where the client portal's
// "View & register" button navigates in place, so it must be a path on this
// site; anything else is refused before the event is written.
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: vi.fn() }));
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/entities/finance", () => ({ selectProducts: vi.fn(), insertProducts: vi.fn(), updateProducts: vi.fn() }));
// The actions ask for their declared permission first (ADR 0013); recorded so the test pins which.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: vi.fn(async (p: string) => (asked.push(p), { user: { email: "admin@example.test" } })) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/entities/org", () => ({ selectSurveys: vi.fn() }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://edge8.test" }));
vi.mock("@/entities/retreats", () => ({
  qrPngDataUrl: vi.fn(),
  eventPath: (slug: string) => `/events/${slug}`,
  EVENT_TYPES: [],
  EVENT_STATUSES: [],
  EVENT_VISIBILITIES: [],
}));

import { addEventVideo, updateEvent } from "./actions";

const eventWrites = () => calls.filter((c) => c.ops.includes("update")).map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
});

describe("updateEvent · landing page", () => {
  it("keeps a path on this site, and clears on empty", async () => {
    script("events", { data: { id: "e1" } }, { data: { id: "e1" } });
    expect(await updateEvent("e1", { landing_path: " /saigon-private " })).toEqual({ ok: true });
    expect(await updateEvent("e1", { landing_path: "" })).toEqual({ ok: true });
    expect(eventWrites().map((w) => w.landing_path)).toEqual(["/saigon-private", null]);
    expect(new Set(asked)).toEqual(new Set(["retreats.events"]));
  });

  it("refuses anything that would leave the site, and writes nothing", async () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "saigon-private"]) {
      expect(await updateEvent("e1", { landing_path: bad })).toEqual({
        ok: false,
        error: "The landing page must be a path on this site, starting with / (e.g. /saigon-private).",
      });
    }
    expect(calls).toHaveLength(0);
  });
});

// W.118.6. The event page draws a video that is not a file as a "Watch video"
// link, so the stored address is always one externalHref accepts.
describe("addEventVideo", () => {
  it("stores the video address as externalHref writes it", async () => {
    // The media list is read, then written back with the new video appended.
    script("events", { data: { slug: "retreat", media: [] } }, {});
    expect(await addEventVideo("e1", " youtube.com/watch?v=abc ", " Day one ")).toEqual({ ok: true });
    expect(eventWrites()).toEqual([{ media: [{ kind: "video", url: "https://youtube.com/watch?v=abc", caption: "Day one" }] }]);
  });

  it("refuses an address that is not a web link, and writes nothing", async () => {
    for (const bad of ["javascript:alert(1)", "the recording", ""]) {
      expect(await addEventVideo("e1", bad)).toEqual({
        ok: false,
        error: "Enter a full video URL (YouTube, Vimeo, or a direct video file).",
      });
    }
    expect(calls).toHaveLength(0);
  });
});
