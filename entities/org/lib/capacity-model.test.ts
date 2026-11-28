import { describe, expect, it } from "vitest";
import { fitCheck, forecast, mondayOf, weekStarts, type ModelCommitment, type ModelRole } from "./capacity-model";

// 2026-09-28 is a Monday; every fixture is laid out from it so a week is easy
// to read off: week 0 is 28 Sep - 4 Oct, week 1 is 5 - 11 Oct, and so on.
const MON = "2026-09-28";

const engineer: ModelRole = { id: "r-eng", hoursPerWeek: 80, effectiveFrom: "2026-01-01" };
const designer: ModelRole = { id: "r-des", hoursPerWeek: 40, effectiveFrom: "2026-01-01" };

function commit(over: Partial<ModelCommitment>): ModelCommitment {
  return { roleId: "r-eng", hoursPerWeek: 10, startsOn: MON, endsOn: null, ...over };
}

describe("mondayOf", () => {
  it("returns the Monday of the week a date falls in, weeks starting Monday", () => {
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28"); // a Sunday closes the week
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
  });

  it("crosses a month and a year boundary", () => {
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });
});

describe("weekStarts", () => {
  it("lists consecutive Mondays", () => {
    expect(weekStarts(MON, 3)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
  });
});

describe("forecast", () => {
  it("gives every role twelve weeks of supply, committed and free", () => {
    const rows = forecast([engineer, designer], [], MON);
    expect(rows.map((r) => r.roleId)).toEqual(["r-eng", "r-des"]);
    expect(rows[0].weeks).toHaveLength(12);
    expect(rows[0].weeks[0]).toEqual({ weekStart: MON, supply: 80, committed: 0, free: 80 });
    expect(rows[0].weeks[11].weekStart).toBe("2026-12-14");
  });

  it("counts a commitment in every week it overlaps, and only its own role's", () => {
    const rows = forecast(
      [engineer, designer],
      [
        // Wednesday of week 1 to Tuesday of week 3: overlaps weeks 1, 2 and 3.
        commit({ hoursPerWeek: 30, startsOn: "2026-10-07", endsOn: "2026-10-20" }),
        commit({ roleId: "r-des", hoursPerWeek: 5 }),
      ],
      MON,
    );
    const eng = rows[0].weeks.map((w) => w.committed);
    expect(eng.slice(0, 5)).toEqual([0, 30, 30, 30, 0]);
    expect(rows[1].weeks.every((w) => w.committed === 5)).toBe(true);
  });

  it("treats a commitment's first and last day as inside it", () => {
    const rows = forecast(
      [engineer],
      [commit({ startsOn: "2026-10-04", endsOn: "2026-10-05" })], // a Sunday to the next Monday
      MON,
    );
    expect(rows[0].weeks.slice(0, 3).map((w) => w.committed)).toEqual([10, 10, 0]);
  });

  it("runs an open-ended commitment to the end of the horizon", () => {
    const rows = forecast([engineer], [commit({ startsOn: "2026-11-02", endsOn: null })], MON);
    expect(rows[0].weeks.map((w) => w.committed)).toEqual([0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10, 10]);
  });

  it("ignores a commitment that ended before the horizon", () => {
    const rows = forecast([engineer], [commit({ startsOn: "2026-08-03", endsOn: "2026-09-27" })], MON);
    expect(rows[0].weeks.every((w) => w.committed === 0)).toBe(true);
  });

  it("sums overlapping commitments and lets free go negative", () => {
    const rows = forecast(
      [designer],
      [commit({ roleId: "r-des", hoursPerWeek: 30 }), commit({ roleId: "r-des", hoursPerWeek: 25.5 })],
      MON,
    );
    expect(rows[0].weeks[0]).toEqual({ weekStart: MON, supply: 40, committed: 55.5, free: -15.5 });
  });

  it("supplies nothing before effective_from, and a full week from the week it falls in", () => {
    const hire: ModelRole = { id: "r-new", hoursPerWeek: 40, effectiveFrom: "2026-10-14" }; // Wednesday of week 2
    const rows = forecast([hire], [], MON);
    expect(rows[0].weeks.slice(0, 4).map((w) => w.supply)).toEqual([0, 0, 40, 40]);
  });

  it("keeps decimal hours exact to the cent of an hour", () => {
    const rows = forecast(
      [{ id: "r-x", hoursPerWeek: 0.3, effectiveFrom: "2026-01-01" }],
      [commit({ roleId: "r-x", hoursPerWeek: 0.1 }), commit({ roleId: "r-x", hoursPerWeek: 0.2 })],
      MON,
    );
    expect(rows[0].weeks[0]).toMatchObject({ committed: 0.3, free: 0 });
  });
});

describe("fitCheck", () => {
  const base = { roleId: "r-des", hoursPerWeek: 20, startsOn: MON, endsOn: "2026-10-25" };

  it("fits when every requested week has the hours free", () => {
    expect(fitCheck(base, [designer], [commit({ roleId: "r-des", hoursPerWeek: 20 })], MON)).toEqual({ fits: true });
  });

  it("is short by the worst weekly shortfall, listing each short week", () => {
    const res = fitCheck(
      base,
      [designer],
      [
        commit({ roleId: "r-des", hoursPerWeek: 25, startsOn: "2026-10-05", endsOn: "2026-10-11" }), // week 1: short 5
        commit({ roleId: "r-des", hoursPerWeek: 32, startsOn: "2026-10-19", endsOn: "2026-10-25" }), // week 3: short 12
      ],
      MON,
    );
    expect(res).toEqual({ fits: false, shortBy: 12, shortWeeks: ["2026-10-05", "2026-10-19"] });
  });

  it("checks the weeks the request spans, from the Monday of its start to the week of its end", () => {
    // Commitment fills week 0 only; a request starting on the Friday of week 0 still touches it.
    const full = commit({ roleId: "r-des", hoursPerWeek: 40, startsOn: MON, endsOn: "2026-10-04" });
    expect(fitCheck({ ...base, startsOn: "2026-10-02" }, [designer], [full], MON)).toMatchObject({ fits: false, shortWeeks: [MON] });
    expect(fitCheck({ ...base, startsOn: "2026-10-05" }, [designer], [full], MON)).toEqual({ fits: true });
  });

  it("checks an open-ended request over twelve weeks from its start", () => {
    const late = commit({ roleId: "r-des", hoursPerWeek: 40, startsOn: "2026-12-14", endsOn: "2026-12-20" }); // week 11
    const later = commit({ roleId: "r-des", hoursPerWeek: 40, startsOn: "2026-12-21", endsOn: "2026-12-27" }); // week 12
    const res = fitCheck({ ...base, endsOn: null }, [designer], [late, later], MON);
    expect(res).toEqual({ fits: false, shortBy: 20, shortWeeks: ["2026-12-14"] });
  });

  it("counts a request that starts before today from the current week, not from its start", () => {
    // Weeks already gone cannot be staffed or un-staffed; checking them would
    // report a shortfall nobody can act on.
    const past = commit({ roleId: "r-des", hoursPerWeek: 40, startsOn: "2026-09-14", endsOn: "2026-09-27" });
    expect(fitCheck({ ...base, startsOn: "2026-09-14" }, [designer], [past], MON)).toEqual({ fits: true });
  });

  it("finds no supply for a role that does not exist yet in the requested weeks", () => {
    const hire: ModelRole = { id: "r-new", hoursPerWeek: 40, effectiveFrom: "2026-10-12" };
    const res = fitCheck({ ...base, roleId: "r-new" }, [hire], [], MON);
    expect(res).toEqual({ fits: false, shortBy: 20, shortWeeks: ["2026-09-28", "2026-10-05"] });
  });

  it("finds no supply for an unknown role", () => {
    const res = fitCheck({ ...base, roleId: "r-missing", endsOn: "2026-10-04" }, [designer], [], MON);
    expect(res).toEqual({ fits: false, shortBy: 20, shortWeeks: [MON] });
  });

  it("fits a request whose weeks all lie in the past, since there is nothing left to staff", () => {
    expect(fitCheck({ ...base, startsOn: "2026-08-03", endsOn: "2026-08-30" }, [designer], [], MON)).toEqual({ fits: true });
  });
});
