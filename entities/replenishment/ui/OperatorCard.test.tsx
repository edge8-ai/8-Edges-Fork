import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { JOBS, WORDS, done } from "./__fixtures__/scanner";
import type { OperatorScreen } from "./OperatorScreen";
import type { StoredJob } from "../lib/run-store";

// What the operator card asks the server to do (RP.5). There is no DOM test
// environment here, so the screen is replaced by one that hands back the
// handlers the card gave it, and each is called as a key press or a tap
// would: Enter with a BIN finishes the job with it trimmed, Enter on an empty
// field and Mark done with nothing typed send nothing, Reopen reopens. The
// node environment has no window, so its storage throws on every touch, which
// is the blocked-storage case the card must survive.
type ScreenProps = ComponentProps<typeof OperatorScreen>;
const seen = vi.hoisted(() => ({ props: null as unknown }));
vi.mock("./OperatorScreen", () => ({
  OperatorScreen: (props: unknown) => {
    seen.props = props;
    return null;
  },
}));
const { OperatorCard } = await import("./OperatorCard");

const actions = {
  completeJob: vi.fn(async (_jobId: string, _bin: string) => ({ ok: true as const })),
  reopenJob: vi.fn(async (_jobId: string) => ({ ok: true as const })),
  notYou: vi.fn(async () => {}),
};

function mount(jobs: StoredJob[] = JOBS): ScreenProps {
  renderToStaticMarkup(
    <OperatorCard run={{ title: "Run 29 Oct", truncated: false, dataRows: 10 }} person={{ name: "Rowan Quill", initials: "RQ", day: "Thu 29 Oct" }} words={WORDS} jobs={jobs} actions={actions} />,
  );
  return seen.props as ScreenProps;
}

beforeEach(() => {
  vi.clearAllMocks();
  seen.props = null;
});

describe("OperatorCard", () => {
  it("opens on the first open job, with the instructions closed until the device is asked", () => {
    const screen = mount([done(JOBS[0], "P03-02"), JOBS[1], JOBS[2]]);
    expect(screen.state.at).toBe(1);
    expect(screen.helpOpen).toBe(false);
    expect(screen.theme).toBeNull();
    expect(screen.notYou).toBe(actions.notYou);
  });

  it("finishes the job on screen when Enter comes with a BIN, trimmed", async () => {
    const screen = mount();
    expect(screen.on.key("Enter", "  P03-02 ")).toBe(true);
    await Promise.resolve();
    expect(actions.completeJob).toHaveBeenCalledWith("j1", "P03-02");
  });

  it("does nothing on Enter with an empty field, or on any other key", () => {
    const screen = mount();
    expect(screen.on.key("Enter", "   ")).toBe(false);
    expect(screen.on.key("x", "P03-02")).toBe(false);
    expect(actions.completeJob).not.toHaveBeenCalled();
  });

  it("asks for the BIN instead of finishing when Mark done is tapped with nothing typed", () => {
    mount().on.markDone();
    expect(actions.completeJob).not.toHaveBeenCalled();
  });

  it("finishes with what is in the field when Mark done is tapped", async () => {
    // A static render cannot type, so the field's text comes from the table:
    // a finished round opens on its first job with that job's BIN in the field.
    const screen = mount(JOBS.map((j) => done(j, `B-${j.id}`)));
    screen.on.markDone();
    await Promise.resolve();
    expect(actions.completeJob).toHaveBeenCalledWith("j1", "B-j1");
  });

  it("reopens the finished job on screen", async () => {
    const screen = mount(JOBS.map((j) => done(j, `B-${j.id}`)));
    screen.on.reopen();
    await Promise.resolve();
    expect(actions.reopenJob).toHaveBeenCalledWith("j1");
  });

  it("does not reopen a job that is open", async () => {
    mount().on.reopen();
    await Promise.resolve();
    expect(actions.reopenJob).not.toHaveBeenCalled();
  });

  it("survives an action that throws, as a scanner losing its signal does", async () => {
    actions.completeJob.mockRejectedValueOnce(new Error("Failed to fetch"));
    const screen = mount();
    expect(screen.on.key("Enter", "P03-02")).toBe(true);
    // The rejection is caught and turned into a notice, never left unhandled.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actions.completeJob).toHaveBeenCalledTimes(1);
  });

  it("closes the instructions without throwing when the device's storage cannot be reached", () => {
    const screen = mount();
    expect(typeof window).toBe("undefined");
    expect(() => screen.on.closeHelp()).not.toThrow();
  });
});
