"use client";

import { useState, type ReactNode } from "react";

export type ViewDef = { key: string; label: string; content: ReactNode };

// Segmented Calendar/List switch (styles: .admin-viewtoggle). Same RSC-payload
// pattern as Tabs.tsx: server-rendered panels are passed in as ReactNode and
// this only toggles which one is mounted.
export function ViewToggle({ views, initial }: { views: ViewDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? views[0]?.key);
  const current = views.find((v) => v.key === active) ?? views[0];
  return (
    <div>
      <div className="u-row u-end u-mb-4">
        <div className="admin-viewtoggle" role="tablist">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v.key === active}
              className={v.key === active ? "is-active" : ""}
              onClick={() => setActive(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {current?.content}
    </div>
  );
}
