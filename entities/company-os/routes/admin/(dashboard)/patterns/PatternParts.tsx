import type { ReactNode } from "react";

// The building blocks of the pattern library page: a titled card, a colour
// swatch and a type-ramp row. Kept beside the page so the page is the catalogue.

export function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="admin-card admin-section-card admin-pat-section">
      <h2 className={`admin-card-title ${sub ? "u-mb-1" : "u-mb-4"}`}>{title}</h2>
      {sub && <p className="admin-pat-caption u-mt-0 u-mb-4">{sub}</p>}
      {children}
    </section>
  );
}

export function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="admin-pat-swatch">
      <div className="admin-pat-swatch-chip" style={{ background: `var(${varName})` }} /* layout-ok: swatch shows the token it names */ />
      <div>
        <div className="admin-pat-swatch-name">{name}</div>
        <div className="admin-pat-swatch-meta">{varName}</div>
      </div>
    </div>
  );
}

export function TypeRow({ meta, size, weight, children }: { meta: string; size: number; weight?: number; children: ReactNode }) {
  return (
    <div className="admin-pat-type-row">
      <span className="admin-pat-type-meta">{meta}</span>
      <span className="u-ink" style={{ fontSize: size, fontWeight: weight ?? 400, lineHeight: 1.3 }} /* layout-ok: the type ramp demo renders each size from its data row */>
        {children}
      </span>
    </div>
  );
}
