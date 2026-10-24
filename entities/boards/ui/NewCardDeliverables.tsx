"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { formatBytes } from "@/kernel/ui/format";
import { FILE_ACCEPT, FILE_TYPES } from "@/entities/boards/lib/deliverable-rules";
import { linkHost, linkLabel } from "@/entities/boards/lib/deliverable-types";
import { DeliverableAdds } from "./DeliverableAdds";
import { DeliverableLinkBox } from "./DeliverableLinkBox";
import { RefusedRow } from "./DeliverableRows";
import { clearPending, dropPending, holdFiles, holdLink, usePendingDeliverables, type PendingDeliverable } from "./new-card-deliverables";
import { useCardFileIntake } from "./useCardFileIntake";
import { useDraftFlag } from "./card-drawer-sections";

/**
 * A new card's Deliverables (W.163 U7), as the canvas's NewCard artboard draws
 * it: the same section a saved card has, with a drop area, "Choose file" and
 * "Add a link". The card has no id yet, so what is chosen, dropped, pasted or
 * linked is HELD here as pending rows, each removable, and handed to the card
 * when Create has made it (useCardForm, handPendingToCard).
 *
 * Closing the new card without creating it takes nothing anywhere: the drawer
 * asks first, and the held rows are forgotten when this section goes.
 */
export function NewCardDeliverables({ currentPrUrl, onUseAsPr }: { currentPrUrl: string; onUseAsPr: (url: string) => void }) {
  const items = usePendingDeliverables();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useCardFileIntake(section, holdFiles);
  useEffect(() => clearPending, []);
  // Held files and links are lost if the new card is closed, so they count
  // toward the drawer's one "Discard your changes?" question (W.141).
  useDraftFlag("deliverables", items.some((p) => p.kind !== "refused"));

  async function add(url: string): Promise<boolean> {
    const held = holdLink(url);
    if (!held.ok) {
      setError(held.error);
      return false;
    }
    setError(null);
    setAdding(false);
    return true;
  }

  const count = items.filter((p) => p.kind !== "refused").length;
  return (
    <section ref={section} className="wb-drawer-block wb-deliv" aria-label="Deliverables">
      <div className="wb-deliv-head">
        <h3 className="wb-drawer-heading">Deliverables{count > 0 ? ` · ${count}` : ""}</h3>
        <div className="wb-deliv-adds">
          <DeliverableAdds
            onChooseFile={() => picker.current?.click()}
            onToggleLink={() => setAdding((a) => !a)}
            linkOpen={adding}
            fileLabel="Choose file"
            linkLabel="Add a link"
          />
          <input
            ref={picker}
            type="file"
            multiple
            accept={FILE_ACCEPT}
            className="u-sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length > 0) holdFiles(files, "chosen");
            }}
          />
        </div>
      </div>

      {error && (
        <p className="wb-deliv-error" role="alert">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <ul className="wb-deliv-list">
          {items.map((p) => (
            <PendingRow key={p.key} p={p} onRemove={() => dropPending(p.key)} onAddLink={() => setAdding(true)} />
          ))}
        </ul>
      )}

      {adding ? (
        <DeliverableLinkBox saving={false} currentPrUrl={currentPrUrl} onAdd={add} onUseAsPr={onUseAsPr} onClose={() => setAdding(false)} />
      ) : (
        <div className="wb-deliv-drop">
          <p className="wb-deliv-drop-title">Drop files here, or paste a screenshot</p>
          <p className="wb-deliv-meta">Images, video, PDF, Office files and zip, up to 500 MB each. Seen by the team only.</p>
        </div>
      )}
    </section>
  );
}

/** One held row: what it is, that it is added on Create, and a way to take it off. */
export function PendingRow({ p, onRemove, onAddLink }: { p: PendingDeliverable; onRemove: () => void; onAddLink: () => void }) {
  if (p.kind === "refused") return <RefusedRow u={p} onDismiss={onRemove} onAddLink={onAddLink} onRetry={() => {}} />;
  const name = p.kind === "file" ? p.file.name : linkLabel({ url: p.url, title: null });
  return (
    <li className="wb-deliv-item">
      {p.kind === "file" ? (
        <span className="wb-deliv-type" aria-hidden>
          {FILE_TYPES[p.file.type] ?? "FILE"}
        </span>
      ) : (
        <span className="wb-deliv-icon" aria-hidden>
          <Icon name="link" />
        </span>
      )}
      <span className="wb-deliv-main wb-deliv-stack">
        <span className="wb-deliv-strong">
          {name}
          {p.kind === "link" && <span className="wb-deliv-host"> {linkHost(p.url)}</span>}
        </span>
        <span className="wb-deliv-meta">
          {p.kind === "file" ? `${formatBytes(p.file.size)} · ` : ""}Added when you create the card
        </span>
      </span>
      <button type="button" className="wb-deliv-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
        <Icon name="close" />
      </button>
    </li>
  );
}
