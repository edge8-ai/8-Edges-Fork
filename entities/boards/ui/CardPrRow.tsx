"use client";

import { Badge } from "@/kernel/ui/Badge";
import { Icon } from "@/kernel/ui/Icon";
import type { CardPrSync } from "@/entities/boards/lib/types";
import { externalHref } from "@/kernel/ui/url";
import type { Form } from "./board-view-types";
import { CardPillPicker } from "./CardPillPicker";
import { PrPanel } from "./CardPillPanels";
import { EMPTY_FIELD, prPillLabel } from "./card-pills";

/**
 * The PR row under the drawer's header (W.152; drawn as the canvas draws it,
 * W.159): the PR as a chip that opens it, with a pencil beside it to change the
 * address, or "None · paste a PR link" when the card has none. Split from
 * CardPills for the client-component size cap.
 *
 * Once HTT's PR sync has stamped the card (W.161) the chip reads as the canvas
 * does, the PR's number then its title ("Card drawer: hybrid layout"), with
 * the state as a badge beside it. Until then, and on a deployment without
 * HTT, it reads the number alone.
 */
const STATE_BADGE = { merged: { tone: "ok", label: "Merged" }, open: { tone: "info", label: "Open" }, closed: { tone: "neutral", label: "Closed" } } as const;

export function CardPrRow({
  form,
  setForm,
  synced,
  readOnly,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  synced: CardPrSync | null;
  readOnly: boolean;
}) {
  const prHref = externalHref(form.prUrl);
  const hasPr = !!form.prUrl.trim();
  const prText = (
    <>
      <Icon name="branch" />
      <span className="wb-pill-text">
        {prPillLabel(form.prUrl).replace(/^PR /, "")}
        {synced?.title && <span className="wb-chip-pr-title"> {synced.title}</span>}
      </span>
    </>
  );
  const badge = synced ? STATE_BADGE[synced.state] : null;
  return (
    <div className="wb-core-row">
      <span className="wb-core-label">PR</span>
      <span className="wb-core-value wb-pill-pr-group">
        {/* Opening the PR is what people most often want from it, so the
            chip itself is the link; only a real http(s) address becomes one
            (W.116). The pencil beside it changes the address. */}
        {prHref ? (
          <a className="wb-pill wb-chip-link" href={prHref} target="_blank" rel="noreferrer" title={form.prUrl} aria-label={`Open ${prPillLabel(form.prUrl)} in a new tab`}>
            {prText}
          </a>
        ) : (
          hasPr && <span className="wb-pill is-static">{prText}</span>
        )}
        {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        {!readOnly && (
          <CardPillPicker
            empty={!hasPr}
            caret={false}
            className={hasPr ? "wb-chip-icon" : undefined}
            label={
              hasPr ? (
                <Icon name="pencil" />
              ) : (
                <>
                  <Icon name="branch" />
                  {EMPTY_FIELD.pr}
                </>
              )
            }
            ariaLabel={hasPr ? "Change the PR link" : "Pull request: none. Paste a link"}
            panelLabel="Pull request"
          >
            {(close) => (
              <PrPanel
                prUrl={form.prUrl}
                onChoose={(prUrl) => {
                  setForm({ ...form, prUrl });
                  close();
                }}
              />
            )}
          </CardPillPicker>
        )}
      </span>
    </div>
  );
}
