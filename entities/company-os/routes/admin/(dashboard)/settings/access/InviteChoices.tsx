"use client";

import { Badge } from "@/kernel/ui/Badge";
import { SUPER_ADMIN_REFUSAL, type BundleOption, type ShapeGroup, type ShapeLevel } from "@/entities/company-os/lib/access-invite-plan";

// The two halves of "What they will hold" in the invite drawer (AE.4): the
// declared role bundles as checkbox cards, and for a temp or advisor the custom
// shape, composed from the deployment's declared atoms.

export function BundleChoices({
  bundles,
  chosen,
  onToggle,
  superAdminRefused,
}: {
  bundles: BundleOption[];
  chosen: ReadonlySet<string>;
  onToggle: (key: string) => void;
  superAdminRefused: boolean;
}) {
  return (
    <div className="u-stack u-gap-2">
      {bundles.map((b) => (
        <label key={b.key} className="admin-card admin-card--outlined u-p-3 u-mb-0 u-pointer">
          <span className="u-row u-items-start u-gap-2">
            <input type="checkbox" checked={chosen.has(b.key)} onChange={() => onToggle(b.key)} />
            <span className="u-grow u-min-0">
              <span className="u-row u-wrap u-items-center u-gap-2">
                <strong>{b.name}</strong>
                <Badge tone="neutral">{b.owner}</Badge>
              </span>
              <span className="u-block">{b.sentence}</span>
              <span className="admin-hint u-block">{b.opens}</span>
              {b.key === "super-admin" && chosen.has(b.key) && superAdminRefused && (
                <span className="u-block u-err u-mt-1">{SUPER_ADMIN_REFUSAL}</span>
              )}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

const PAIR_LEVELS: ShapeLevel[] = ["off", "view", "manage"];
const SINGLE_LEVELS: ShapeLevel[] = ["off", "hold"];
const LEVEL_LABEL: Record<ShapeLevel, string> = { off: "Off", view: "View", manage: "Manage", hold: "Hold" };

export function CustomShape({
  groups,
  levels,
  onChange,
}: {
  groups: ShapeGroup[];
  levels: Readonly<Record<string, ShapeLevel>>;
  onChange: (key: string, level: ShapeLevel) => void;
}) {
  return (
    <div className="u-stack u-gap-3">
      <p className="admin-hint u-m-0">
        Nothing is implied for a temp or advisor. Choose exactly what this one person holds; it becomes a role of their own. Entering the Admin
        view is added for you when anything here needs it.
      </p>
      {groups.map((g) => (
        <div key={g.owner}>
          <div className="admin-label">{g.label}</div>
          {g.rows.map((row) => {
            const level = levels[row.key] ?? "off";
            return (
              <div key={row.key} className="u-row u-wrap u-items-center u-between u-gap-2 u-py-1">
                <span className="u-flex-200 u-min-0">
                  <strong className="u-block">{row.label}</strong>
                  <span className="admin-hint u-block">{row.sentence}</span>
                  {row.warning && <span className="u-block u-warn admin-hint">{row.warning}</span>}
                </span>
                <span className="admin-viewtoggle" role="radiogroup" aria-label={row.label}>
                  {(row.pair ? PAIR_LEVELS : SINGLE_LEVELS).map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={level === l}
                      className={level === l ? "is-active" : ""}
                      onClick={() => onChange(row.key, l)}
                    >
                      {LEVEL_LABEL[l]}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
