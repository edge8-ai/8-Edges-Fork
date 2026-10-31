import { describe, expect, it } from "vitest";
import { JOBS, WORDS, done } from "../ui/__fixtures__/scanner";
import { offlineFileName, renderOfflineReport, type OfflineRun } from "./offline-report";

// The offline copy (RP.7), through its renderer only: the file a manager
// downloads and an operator opens from disk with no signal.
const RUN: OfflineRun = { id: "0b7c6d5e-4f3a-4b2c-9d1e-0f1a2b3c4d5e", title: "Run 29 Oct · Main floor", uploadedAt: "2026-10-29T01:02:00Z", truncated: false, dataRows: 1200 };

const embedded = (html: string) => {
  const json = /<script type="application\/json" data-rp="jobs">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (json === undefined) throw new Error("no embedded jobs");
  return JSON.parse(json) as { runId: string; jobs: { id: string; item: string; bin: string | null }[] };
};

describe("renderOfflineReport", () => {
  it("draws every job, in walking order, and embeds the same jobs for the script", () => {
    const html = renderOfflineReport(RUN, JOBS, WORDS);
    const items = [...html.matchAll(/<h1 class="rp-scan-item">([^<]*)<\/h1>/g)].map((m) => m[1]);
    expect(items).toEqual(["KES-38", "KES-44", "KES-46"]);
    expect(embedded(html)).toEqual({
      runId: RUN.id,
      jobs: [
        { id: "j1", item: "KES-38", bin: null },
        { id: "j2", item: "KES-44", bin: null },
        { id: "j3", item: "KES-46", bin: null },
      ],
    });
  });

  it("shows what the operator needs on each job: the move, where to collect from, where to put it", () => {
    const html = renderOfflineReport(RUN, JOBS, WORDS);
    expect(html).toContain("<dt>Pick face</dt><dd>4</dd>");
    expect(html).toContain('<span class="rp-scan-grow rp-scan-strong">U01</span><span class="rp-scan-start">Start here</span><span class="rp-scan-qty">10</span>');
    expect(html).toContain('<span class="rp-scan-grow rp-scan-muted">Destination 3</span><span class="rp-scan-strong">P07-03</span>');
    // The choice job carries the hint; the job with no pick BIN carries the note.
    expect(html.match(/<p class="rp-scan-hint">/g)).toHaveLength(1);
    expect(html).toContain("The box decides.");
    expect(html).toContain('<p class="rp-scan-nopick">No pick BIN yet. Use any BIN in the size zone.</p>');
    expect(html).toContain("<li>Work the jobs in order.</li><li>Scan the BIN you used.</li>");
    expect(html).toContain("Rules set by the warehouse manager");
  });

  it("starts a job finished in the App as finished, with its BIN", () => {
    const html = renderOfflineReport(RUN, [done(JOBS[0], "P03-02"), JOBS[1]], WORDS);
    expect(embedded(html).jobs.map((j) => j.bin)).toEqual(["P03-02", null]);
  });

  it("says at the top that its progress is not sent back to the App", () => {
    const html = renderOfflineReport(RUN, JOBS, WORDS);
    const top = html.slice(html.indexOf('<header class="rp-scan-top">'), html.indexOf("</header>"));
    expect(top).toContain("is NOT sent back to the App");
  });

  it("carries the truncation banner only when the run was cut off", () => {
    expect(renderOfflineReport(RUN, JOBS, WORDS)).not.toContain("may have been cut off");
    expect(renderOfflineReport({ ...RUN, truncated: true, dataRows: 3 }, JOBS, WORDS)).toContain("Only 3 rows were read: this export may have been cut off.");
  });

  it("escapes a description written to break out, in the page and in the embedded jobs", () => {
    const hostile = { ...JOBS[0], item: `KES"38'`, description: "</script><img src=x onerror=alert(1)> & co" };
    const html = renderOfflineReport({ ...RUN, title: "<b>Run</b>" }, [hostile], { ...WORDS, footer: "<i>footer</i>" });
    expect(html).not.toContain("</script><img");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>Run</b>");
    expect(html).not.toContain("<i>footer</i>");
    expect(html).toContain("&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt; &amp; co");
    expect(html).toContain("KES&quot;38&#39;");
    // Exactly the two script elements the file needs, so the description closed none.
    expect(html.match(/<\/script>/g)).toHaveLength(3);
    expect(embedded(html).jobs[0].item).toBe(`KES"38'`);
  });

  it("makes no network request of any kind", () => {
    const html = renderOfflineReport(RUN, JOBS, WORDS);
    for (const reference of [/https?:/i, /\bsrc\s*=/i, /\bhref\s*=/i, /url\(/i, /@import/i, /\bfetch\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /<link\b/i, /<img\b/i, /<iframe\b/i]) {
      expect(html, String(reference)).not.toMatch(reference);
    }
    // And its own policy refuses anything a browser might still try.
    expect(html).toContain(`content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"`);
  });

  it("draws an empty run as nothing to restock, with no controls", () => {
    const html = renderOfflineReport(RUN, [], WORDS);
    expect(html).toContain("No replenishment required");
    expect(html).toContain('<div class="rp-scan-controls" hidden>');
    expect(html).not.toContain('class="rp-scan-card rp-scan-centre rp-scan-finish"');
    expect(html).not.toContain('<article class="rp-scan-card rp-scan-job"');
  });
});

describe("offlineFileName", () => {
  it("names the file by the run's upload day", () => {
    expect(offlineFileName("2026-10-29T01:02:00Z")).toBe("Replenishment_Report_2026-10-29.html");
  });

  it("counts the day in the business time zone, not UTC", () => {
    // 23:30 UTC on the 28th is already the 29th in Vietnam (UTC+7).
    expect(offlineFileName("2026-10-28T23:30:00Z")).toBe("Replenishment_Report_2026-10-29.html");
  });
});
