"use client";

import { useState } from "react";
import { toCsv, csvFilename, type CsvRow } from "./csv";

// The "Download rows" link that sits in a chart card's head (RF-8). It holds
// the rows the card was already given and writes them to a file in the browser
// when clicked, so the download is by construction what is on screen for the
// period on screen. There is no route behind it and nothing to keep in sync.
//
// The rows arrive as plain data, never as a function: a server page hands a
// client component values, and React refuses a function across that boundary
// at request time in a way no static render catches.
export function DownloadRows({ rows, name, label = "Download rows" }: { rows: CsvRow[]; name: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  if (rows.length === 0) return null;

  function download() {
    // Cleared on every attempt: a browser that refused one download may allow
    // the next, and a label stuck on "Download blocked" for the life of the
    // mount would be a lie about the current state.
    setFailed(false);
    try {
      const blob = new Blob([`﻿${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = csvFilename(name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick: revoking synchronously can beat the click in
      // Safari and the file arrives empty.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // A browser that refuses the download says so in the link rather than
      // doing nothing, which would read as a broken button.
      setFailed(true);
    }
  }

  return (
    <button type="button" className="dash-download" onClick={download} title={`${rows.length} rows, as shown`}>
      {failed ? "Download blocked" : label} ↓
    </button>
  );
}
