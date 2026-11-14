// An in-memory stand-in for the parked-run rows, for the writer's and the
// letter's approval tests (Y.16, Y.17): a run parks once per tick while it
// waits on a decision, and closing it touches only a run still waiting. The
// approvals those runs wait on are the kernel's fake
// (kernel/approvals/testing/fake.ts, A.39). Each suite wires both in with its
// own vi.mock calls.

export type FakePark = { routineId: string; tick: string; status: string; summary: string };

export const parks: FakePark[] = [];

export function resetParksFake(): void {
  parks.length = 0;
}

export const parksFake = {
  parkRun: async (routineId: string, tick: string, summary: string) => {
    if (!parks.some((p) => p.routineId === routineId && p.tick === tick)) parks.push({ routineId, tick, status: "waiting", summary });
    return { ok: true as const };
  },
  closeParkedRun: async (routineId: string, tick: string, outcome: { status: string; summary: string }) => {
    const park = parks.find((p) => p.routineId === routineId && p.tick === tick && p.status === "waiting");
    if (park) Object.assign(park, outcome);
    return { ok: true as const };
  },
};
