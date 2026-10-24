"use client";

import { useEffect, useRef } from "react";

// The frame a company document is read in (TH.19). The documents are uploaded
// HTML served as they were written, and one wide table in the handbook made
// the whole document scroll sideways on a phone, cutting its headings off at
// the frame's edge. The frame is same-origin, so once a document loads, every
// table wider than the page is wrapped in a box that scrolls on its own; a
// table that fits is left exactly as it was, and the stored document is never
// changed. Rotating the phone checks again.
const WRAP_CLASS = "e8-wide-table";

function wrapWideTables(doc: Document) {
  if (!doc.getElementById("e8-wide-table-style")) {
    const style = doc.createElement("style");
    style.id = "e8-wide-table-style";
    style.textContent = `.${WRAP_CLASS}{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}`;
    doc.head.appendChild(style);
  }
  const width = doc.documentElement.clientWidth;
  for (const table of Array.from(doc.querySelectorAll("table"))) {
    if (table.parentElement?.classList.contains(WRAP_CLASS)) continue;
    if (table.getBoundingClientRect().width <= width) continue;
    const box = doc.createElement("div");
    box.className = WRAP_CLASS;
    table.replaceWith(box);
    box.appendChild(table);
  }
}

export function CompanyDocFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    // The frame is rendered on the server, so it can finish loading before
    // React attaches anything: check now when it already has, and on every
    // later load (a link followed inside the frame).
    let win: Window | null = null;
    const onResize = () => {
      if (frame.contentDocument) wrapWideTables(frame.contentDocument);
    };
    const run = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc || doc.readyState !== "complete") return;
        wrapWideTables(doc);
        win?.removeEventListener("resize", onResize);
        win = frame.contentWindow;
        win?.addEventListener("resize", onResize);
      } catch {
        // A document that is not same-origin (a fork pointing elsewhere) is left as it is.
      }
    };
    run();
    frame.addEventListener("load", run);
    return () => {
      frame.removeEventListener("load", run);
      win?.removeEventListener("resize", onResize);
    };
  }, [src]);
  return <iframe ref={ref} src={src} title={title} className="admin-deck-frame" />;
}
